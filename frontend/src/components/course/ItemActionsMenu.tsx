import { CircleX, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

interface ItemActionsMenuProps {
  onRename?: () => void
  onMove: () => void
  onDelete: () => void
  onClose: () => void
  deleteLabel?: string
}

export default function ItemActionsMenu({ onRename, onMove, onDelete, onClose, deleteLabel = '삭제' }: ItemActionsMenuProps) {
  const isUnregister = deleteLabel !== '삭제'

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-2xl border border-slate-100 bg-white py-1.5 shadow-xl">
        {onRename && (
          <button type="button" onClick={() => { onRename(); onClose() }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50">
            <Pencil className="size-4" />이름 변경
          </button>
        )}
        <button type="button" onClick={() => { onMove(); onClose() }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold text-slate-600 hover:bg-slate-50">
          <MoreHorizontal className="size-4 rotate-90" />이동하기
        </button>
        <button type="button" onClick={() => { onDelete(); onClose() }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-bold text-rose-500 hover:bg-rose-50">
          {isUnregister ? <CircleX className="size-4" /> : <Trash2 className="size-4" />}{deleteLabel}
        </button>
      </div>
    </>
  )
}
