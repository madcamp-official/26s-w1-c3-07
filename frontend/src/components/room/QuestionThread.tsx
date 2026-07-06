import { ChevronDown, MessageSquare, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import type { Question } from '../../types/room'
import { cn } from '../../utils/cn'
import ReplyItem from './ReplyItem'

interface QuestionThreadProps {
  question: Question
  onLike: (questionId: string) => Promise<void>
  onReply: (questionId: string, label: string) => void
}

export default function QuestionThread({ question, onLike, onReply }: QuestionThreadProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const isOpinion = question.postType === 'opinion'

  return (
    <article className={cn('rounded-3xl border bg-white p-5 shadow-sm sm:p-6', question.isResolved ? 'border-slate-100' : isOpinion ? 'border-rose-200' : 'border-violet-200')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="font-bold text-slate-600">{question.authorName}</span>
          <span>·</span>
          <span>{question.createdAt}</span>
        </div>
        <button type="button" onClick={() => setIsExpanded((current) => !current)} className="rounded-lg p-1 text-slate-300 hover:bg-slate-50 hover:text-slate-500" aria-label={isExpanded ? '접기' : '펼치기'}>
          <ChevronDown className={cn('size-5 transition', !isExpanded && '-rotate-90')} />
        </button>
      </div>

      <p className="mt-2 text-base font-bold text-slate-900">{question.content}</p>

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => void onLike(question.id)}
          className={cn('inline-flex items-center gap-1.5 text-sm font-bold transition', question.isLikedByMe ? 'text-violet-600' : 'text-slate-400 hover:text-violet-600')}
          aria-pressed={question.isLikedByMe}
        >
          <ThumbsUp className={cn('size-4', question.isLikedByMe && 'fill-violet-600')} />{question.likeCount}
        </button>
        <button type="button" onClick={() => onReply(question.id, question.content)} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-violet-600">
          <MessageSquare className="size-4" />답글
        </button>
      </div>

      {isExpanded && question.replies.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {question.replies.map((reply) => <ReplyItem key={reply.id} reply={reply} onReply={() => onReply(question.id, reply.content)} />)}
        </div>
      )}
    </article>
  )
}
