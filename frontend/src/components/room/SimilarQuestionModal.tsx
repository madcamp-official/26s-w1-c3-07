import { CircleHelp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getSimilarQuestionPreview } from '../../services/api'
import Button from '../ui/Button'

interface SimilarQuestionModalProps {
  isOpen: boolean
  similarId: string | null
  isSubmitting: boolean
  onViewSimilar: (similarId: string) => void
  onForceSubmit: () => void
  onCancel: () => void
}

export default function SimilarQuestionModal({ isOpen, similarId, isSubmitting, onViewSimilar, onForceSubmit, onCancel }: SimilarQuestionModalProps) {
  const [preview, setPreview] = useState<{ content: string; authorName: string } | null>(null)

  useEffect(() => {
    if (!isOpen || !similarId) {
      setPreview(null)
      return
    }
    void getSimilarQuestionPreview(similarId).then(setPreview)
  }, [isOpen, similarId])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onCancel}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="similar-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-600"><CircleHelp className="size-5" /></span>
          <div>
            <h2 id="similar-title" className="text-lg font-extrabold text-slate-900">이미 비슷한 질문이 있어요</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">이미 등록된 질문과 내용이 비슷해요. 먼저 확인해 보시겠어요?</p>
          </div>
        </div>

        {preview && (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-400">{preview.authorName}</p>
            <p className="mt-1 text-sm text-slate-700">{preview.content}</p>
          </div>
        )}

        <div className="mt-6 space-y-2">
          {similarId && (
            <Button variant="secondary" onClick={() => onViewSimilar(similarId)} className="w-full">그 질문 보러가기</Button>
          )}
          <Button onClick={onForceSubmit} disabled={isSubmitting} className="w-full">{isSubmitting ? '등록 중' : '그래도 제출할게요'}</Button>
          <button type="button" onClick={onCancel} className="w-full py-2 text-sm font-bold text-slate-400 hover:text-slate-600">취소</button>
        </div>
      </section>
    </div>
  )
}
