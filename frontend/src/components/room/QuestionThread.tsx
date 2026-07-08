import { CheckCircle2, ChevronDown, MessageSquare, Pencil, ThumbsUp, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Question } from '../../types/room'
import { cn } from '../../utils/cn'
import ReplyItem from './ReplyItem'

interface QuestionThreadProps {
  question: Question
  canResolve?: boolean
  highlightId?: string | null
  onLike: (questionId: string) => Promise<void>
  onResolve?: (questionId: string) => Promise<void>
  onReply: (parentPostId: string, label: string) => void
  onEdit?: (questionId: string, content: string) => Promise<void>
  onEditReply?: (questionId: string, replyId: string, content: string) => Promise<void>
  onDelete?: (postId: string) => void
}

export default function QuestionThread({ question, canResolve = false, highlightId = null, onLike, onResolve, onReply, onEdit, onEditReply, onDelete }: QuestionThreadProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isResolving, setIsResolving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(question.content)
  const [isSaving, setIsSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const isOpinion = question.postType === 'opinion'
  const isLecturer = question.authorRole === 'lecturer'
  // 좋아요/답글/수정 펜의 색(hover·활성·채움)을 셀 왼쪽 테두리 색(의견=하늘, 질문=보라)과 맞춤.
  const accentText = isOpinion ? 'text-cyan-600' : 'text-violet-600'
  const accentFill = isOpinion ? 'fill-cyan-600' : 'fill-violet-600'
  const accentHover = isOpinion ? 'hover:text-cyan-600' : 'hover:text-violet-600'
  // 하이라이트도 무채색 대신 셀 색의 연한 톤으로 - 눈에 더 잘 띄면서 셀 색과 통일감 있게.
  const accentHighlight = isOpinion ? 'bg-cyan-50 shadow-lg shadow-cyan-200/60 ring-2 ring-cyan-300' : 'bg-violet-50 shadow-lg shadow-violet-200/60 ring-2 ring-violet-300'

  const handleResolve = async () => {
    if (!onResolve) return
    setIsResolving(true)
    try {
      await onResolve(question.id)
    } finally {
      setIsResolving(false)
    }
  }

  const startEditing = () => {
    setDraft(question.content)
    setEditError('')
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (!onEdit || !draft.trim()) return
    setEditError('')
    setIsSaving(true)
    try {
      await onEdit(question.id, draft.trim())
      setIsEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '수정하지 못했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <article
      id={`post-${question.id}`}
      className={cn(
        'scroll-mt-6 rounded-3xl border-l-4 border-y border-r border-y-slate-100 border-r-slate-100 bg-white p-5 shadow-sm transition-all duration-700 ease-out sm:p-6',
        isOpinion ? 'border-l-cyan-400' : 'border-l-violet-400',
        question.id === highlightId && accentHighlight,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="font-bold text-slate-600">{question.authorName}</span>
          {isLecturer && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-700">Lecturer</span>}
          <span>·</span>
          <span>{question.createdAt}</span>
        </div>
        <div className="flex items-center gap-2">
          {canResolve && (
            <button
              type="button"
              onClick={() => void handleResolve()}
              disabled={isResolving}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed',
                question.isResolved ? 'bg-emerald-500 text-white' : 'border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600',
              )}
            >
              <CheckCircle2 className="size-3.5" />{question.isResolved ? '해결됨' : '해결 완료'}
            </button>
          )}
          {question.isEditable && onEdit && !isEditing && (
            <button type="button" onClick={startEditing} className={cn('rounded-lg p-1.5 text-slate-300 hover:bg-slate-50', accentHover)} aria-label="수정">
              <Pencil className="size-4" />
            </button>
          )}
          {question.canDelete && onDelete && (
            <button type="button" onClick={() => onDelete(question.id)} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500" aria-label="삭제">
              <Trash2 className="size-4" />
            </button>
          )}
          {question.replies.length > 0 && (
            <button type="button" onClick={() => setIsExpanded((current) => !current)} className="rounded-lg p-1 text-slate-300 hover:bg-slate-50 hover:text-slate-500" aria-label={isExpanded ? '접기' : '펼치기'}>
              <ChevronDown className={cn('size-5 transition', !isExpanded && '-rotate-90')} />
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="mt-2">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full resize-none rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
          {editError && <p className="mt-1.5 text-xs font-medium text-rose-500">{editError}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setIsEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-100">취소</button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!draft.trim() || isSaving}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? '저장 중' : '저장'}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-base font-bold text-slate-900">{question.content}</p>
      )}

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => void onLike(question.id)}
          className={cn('inline-flex items-center gap-1.5 text-sm font-bold transition', question.isLikedByMe ? accentText : cn('text-slate-400', accentHover))}
          aria-pressed={question.isLikedByMe}
        >
          <ThumbsUp className={cn('size-4', question.isLikedByMe && accentFill)} />{question.likeCount}
        </button>
        <button type="button" onClick={() => onReply(question.id, question.content)} className={cn('inline-flex items-center gap-1.5 text-sm font-bold text-slate-400', accentHover)}>
          <MessageSquare className="size-4" />답글
        </button>
      </div>

      {isExpanded && question.replies.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {question.replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              isHighlighted={reply.id === highlightId}
              onLike={() => void onLike(reply.id)}
              onReply={() => onReply(reply.id, reply.content)}
              onEdit={onEditReply ? (content) => onEditReply(question.id, reply.id, content) : undefined}
              onDelete={onDelete ? () => onDelete(reply.id) : undefined}
            />
          ))}
        </div>
      )}
    </article>
  )
}
