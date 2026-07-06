import { ThumbsUp } from 'lucide-react'
import type { QuestionReply } from '../../types/room'
import { cn } from '../../utils/cn'

interface ReplyItemProps {
  reply: QuestionReply
  onReply?: () => void
}

export default function ReplyItem({ reply, onReply }: ReplyItemProps) {
  const isLecturer = reply.authorRole === 'lecturer'
  const isOpinion = reply.postType === 'opinion'

  return (
    <div className={cn('rounded-2xl border-l-4 border-y border-r border-y-slate-100 border-r-slate-100 bg-slate-50 p-4', isOpinion ? 'border-l-rose-500' : 'border-l-violet-500', reply.depth > 0 && 'ml-6 sm:ml-10')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={cn('font-extrabold', isLecturer ? 'text-blue-700' : 'text-slate-800')}>{reply.authorName}</span>
          {isLecturer && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">Lecturer</span>}
          {reply.isEditable && <span className="text-xs font-medium text-slate-400">수정하기</span>}
        </div>
        <span className="shrink-0 text-xs text-slate-400">{reply.createdAt}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{reply.content}</p>
      <button type="button" onClick={onReply} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-violet-600">
        <ThumbsUp className="size-3.5" />{reply.likeCount}
        <span className="text-slate-300">·</span>
        답글
      </button>
    </div>
  )
}
