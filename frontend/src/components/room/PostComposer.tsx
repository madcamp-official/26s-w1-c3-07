import { Bot, CornerDownRight, RotateCcw, Send, Sparkles, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { refineWithAi } from '../../services/api'
import type { ComposerSubmission, ComposerTarget, PostType, SubmitPostResult } from '../../types/room'
import { cn } from '../../utils/cn'
import Button from '../ui/Button'
import ModerationBlockedModal from './ModerationBlockedModal'
import SimilarQuestionModal from './SimilarQuestionModal'

interface PostComposerProps {
  target: ComposerTarget | null
  isLoggedIn: boolean
  isInstructor?: boolean
  onSubmit: (submission: ComposerSubmission) => Promise<SubmitPostResult>
  onSubmitDraft: (draftId: string, submission: ComposerSubmission) => Promise<void>
  onViewSimilar: (similarId: string) => void
  onCancel?: () => void
}

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="font-bold text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-violet-600' : 'bg-slate-200',
        )}
      >
        <span className={cn('absolute top-0.5 size-6 rounded-full bg-white shadow transition', checked ? 'left-5' : 'left-0.5')} />
      </button>
    </div>
  )
}

export default function PostComposer({ target, isLoggedIn, isInstructor = false, onSubmit, onSubmitDraft, onViewSimilar, onCancel }: PostComposerProps) {
  const [content, setContent] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(!isInstructor)
  const [isAiAssisted, setIsAiAssisted] = useState(true)
  const [isQuestion, setIsQuestion] = useState(true)
  const [aiDraft, setAiDraft] = useState<string | null>(null)
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [blockedReason, setBlockedReason] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [pendingSimilar, setPendingSimilar] = useState<{ draftId: string; similarId: string; content: string } | null>(null)

  const postType: PostType = isInstructor || !isQuestion ? 'opinion' : 'question'

  const generateDraft = async () => {
    setIsGeneratingDraft(true)
    try {
      setAiDraft(await refineWithAi(content))
    } finally {
      setIsGeneratingDraft(false)
    }
  }

  const resetComposer = () => {
    setContent('')
    setAiDraft(null)
    setIsAiAssisted(true)
    setIsQuestion(true)
  }

  const finalize = async (finalContent: string) => {
    setSubmitError('')
    setIsSubmitting(true)
    try {
      const outcome = await onSubmit({ content: finalContent, postType, isAnonymous })
      if (outcome.result === 'created') {
        resetComposer()
      } else if (outcome.result === 'similar_found') {
        setPendingSimilar({ draftId: outcome.draftId, similarId: outcome.similarId, content: finalContent })
      } else {
        setBlockedReason(outcome.reason)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '등록하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const forceSubmit = async () => {
    if (!pendingSimilar) return
    setIsSubmitting(true)
    try {
      await onSubmitDraft(pendingSimilar.draftId, { content: pendingSimilar.content, postType, isAnonymous })
      setPendingSimilar(null)
      resetComposer()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '등록하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm sm:p-6">
      {target && (
        <p className="mb-3 flex items-start gap-1.5 text-sm font-medium text-slate-400">
          <CornerDownRight className="mt-0.5 size-4 shrink-0" />
          <span>답글 대상: <span className="text-slate-600">{target.label}</span></span>
        </p>
      )}

      <textarea
        autoFocus
        rows={4}
        value={content}
        onChange={(event) => { setContent(event.target.value); setAiDraft(null) }}
        placeholder="궁금한 점을 자유롭게 입력하세요..."
        className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
      />

      <div className="mt-2 divide-y divide-slate-100">
        {!isInstructor && (
          <>
            <ToggleRow
              label={isAnonymous ? '익명' : '실명'}
              description={isAnonymous ? '이름이 공개되지 않습니다' : '이름이 공개됩니다'}
              checked={isAnonymous}
              disabled={!isLoggedIn}
              onChange={setIsAnonymous}
            />
            {!isLoggedIn && (
              <div className="border-t-0 py-2">
                <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700"><TriangleAlert className="size-4 shrink-0" />실명으로 작성하려면 Google 로그인이 필요합니다.</p>
              </div>
            )}
          </>
        )}
        <ToggleRow
          label="AI 교정"
          description={isAiAssisted ? 'AI가 글을 더 명확하게 개선합니다' : 'AI를 사용하지 않고 질문을 생성합니다'}
          checked={isAiAssisted}
          onChange={(checked) => { setIsAiAssisted(checked); setAiDraft(null) }}
        />
        {!isInstructor && (
          <ToggleRow
            label={isQuestion ? '질문' : '의견'}
            description={isQuestion ? '강의자에게 질문합니다' : '강의와 관련된 의견을 남깁니다'}
            checked={isQuestion}
            onChange={setIsQuestion}
          />
        )}
      </div>

      {submitError && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
          <TriangleAlert className="size-4 shrink-0" />{submitError}
        </p>
      )}

      {aiDraft !== null && (
        <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-violet-600"><Bot className="size-4" />AI 작성 · 직접 수정 가능합니다</p>
          <textarea
            rows={3}
            value={aiDraft}
            onChange={(event) => setAiDraft(event.target.value)}
            className="w-full resize-none rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => void generateDraft()} disabled={isGeneratingDraft} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-50">
              <RotateCcw className="size-4" />{isGeneratingDraft ? '생성 중' : '다시 생성'}
            </button>
            <Button onClick={() => void finalize(aiDraft.trim())} disabled={!aiDraft.trim() || isSubmitting}>
              <Send className="size-4" />{isSubmitting ? '등록 중' : '제출하기'}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>취소</Button>}
        {aiDraft === null && (
          <Button
            type="button"
            disabled={!content.trim() || isSubmitting || isGeneratingDraft}
            className={cn(isAiAssisted && 'bg-gradient-to-r from-violet-600 to-purple-600')}
            onClick={() => (isAiAssisted ? void generateDraft() : void finalize(content.trim()))}
          >
            {isAiAssisted && <Sparkles className="size-4" />}
            {isSubmitting ? '등록 중' : isGeneratingDraft ? '생성 중' : isAiAssisted ? 'AI로 교정하기' : '제출하기'}
          </Button>
        )}
      </div>

      <ModerationBlockedModal
        isOpen={blockedReason !== null}
        reason={blockedReason ?? undefined}
        onEdit={() => setBlockedReason(null)}
        onCancel={() => setBlockedReason(null)}
      />

      <SimilarQuestionModal
        isOpen={pendingSimilar !== null}
        similarId={pendingSimilar?.similarId ?? null}
        isSubmitting={isSubmitting}
        onViewSimilar={onViewSimilar}
        onForceSubmit={() => void forceSubmit()}
        onCancel={() => setPendingSimilar(null)}
      />
    </div>
  )
}
