import { TriangleAlert } from 'lucide-react'
import Button from '../ui/Button'

interface ModerationBlockedModalProps {
  isOpen: boolean
  onEdit: () => void
  onCancel: () => void
}

export default function ModerationBlockedModal({ isOpen, onEdit, onCancel }: ModerationBlockedModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onCancel}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="moderation-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-600"><TriangleAlert className="size-5" /></span>
          <div>
            <h2 id="moderation-title" className="text-lg font-extrabold text-slate-900">부적절한 질문이 감지되었습니다</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">질문에 부적절한 표현이나 강의와 관련 없는 내용이 포함되어 있습니다.<br />내용을 수정한 후 다시 제출해 주세요.</p>
          </div>
        </div>
        <div className="mt-6 space-y-2">
          <Button onClick={onEdit} className="w-full">질문 수정하기</Button>
          <button type="button" onClick={onCancel} className="w-full py-2 text-sm font-bold text-slate-400 hover:text-slate-600">취소</button>
        </div>
      </section>
    </div>
  )
}
