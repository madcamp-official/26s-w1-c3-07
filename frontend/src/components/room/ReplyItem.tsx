import { MessageSquare, Pencil, ThumbsUp, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { QuestionReply } from '../../types/room'
import { cn } from '../../utils/cn'

interface ReplyItemProps {
  reply: QuestionReply
  onLike?: () => void
  onReply?: () => void
  onEdit?: (content: string) => Promise<void>
  onDelete?: () => void
}

export default function ReplyItem({ reply, onLike, onReply, onEdit, onDelete }: ReplyItemProps) {
  const isLecturer = reply.authorRole === 'lecturer'
  const isOpinion = reply.postType === 'opinion'
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(reply.content)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const startEditing = () => {
    setDraft(reply.content)
    setError('')
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (!onEdit || !draft.trim()) return
    setError('')
    setIsSaving(true)
    try {
      await onEdit(draft.trim())
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '답글을 수정하지 못했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className={cn('rounded-2xl border-l-4 border-y border-r border-y-slate-100 border-r-slate-100 bg-slate-50 p-4', isLecturer ? 'border-l-rose-400' : isOpinion ? 'border-l-blue-400' : 'border-l-violet-400')}
      style={reply.depth > 0 ? { marginLeft: `${Math.min(reply.depth, 6) * 1.5}rem` } : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-slate-800">{reply.authorName}</span>
          {isLecturer && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">Lecturer</span>}
          <span className="shrink-0 text-xs text-slate-400">{reply.createdAt}</span>
        </div>
        <div className="flex items-center gap-2">
          {reply.isEditable && !isEditing && (
            <button type="button" onClick={startEditing} className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-50 hover:text-violet-600" aria-label="수정">
              <Pencil className="size-4" />
            </button>
          )}
          {reply.canDelete && onDelete && (
            <button type="button" onClick={onDelete} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500" aria-label="삭제">
              <Trash2 className="size-4" />
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
          {error && <p className="mt-1.5 text-xs font-medium text-rose-500">{error}</p>}
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
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{reply.content}</p>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onLike}
          className={cn('inline-flex items-center gap-1.5 text-xs font-bold transition', reply.isLikedByMe ? 'text-violet-600' : 'text-slate-400 hover:text-violet-600')}
          aria-pressed={reply.isLikedByMe}
        >
          <ThumbsUp className={cn('size-3.5', reply.isLikedByMe && 'fill-violet-600')} />{reply.likeCount}
        </button>
        <button type="button" onClick={onReply} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-violet-600">
          <MessageSquare className="size-3.5" />답글
        </button>
      </div>
    </div>
  )
}
