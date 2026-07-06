import { ThumbsDown, ThumbsUp, Zap } from 'lucide-react'
import type { FeedbackKey, FeedbackOption } from '../../types/room'
import { cn } from '../../utils/cn'

interface FeedbackBarProps {
  options: FeedbackOption[]
  canVote?: boolean
  onVote: (key: FeedbackKey, vote: 'like' | 'dislike') => void
}

export default function FeedbackBar({ options, canVote = true, onVote }: FeedbackBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-amber-100 bg-amber-50 p-4">
      <span className="inline-flex items-center gap-1.5 font-extrabold text-amber-600"><Zap className="size-4 fill-amber-400 text-amber-400" />실시간 피드백</span>
      {options.map((option) => (
        <div key={option.key} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700">
          <span>{option.label}</span>
          <button
            type="button"
            onClick={() => onVote(option.key, 'like')}
            disabled={!canVote}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition disabled:cursor-not-allowed',
              option.myVote === 'like' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400',
              canVote && option.myVote !== 'like' && 'hover:text-emerald-600',
            )}
            aria-pressed={option.myVote === 'like'}
            aria-label={`${option.label} 좋아요`}
          >
            <ThumbsUp className="size-3.5" />{option.likeCount}
          </button>
          <button
            type="button"
            onClick={() => onVote(option.key, 'dislike')}
            disabled={!canVote}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition disabled:cursor-not-allowed',
              option.myVote === 'dislike' ? 'bg-rose-100 text-rose-700' : 'text-slate-400',
              canVote && option.myVote !== 'dislike' && 'hover:text-rose-600',
            )}
            aria-pressed={option.myVote === 'dislike'}
            aria-label={`${option.label} 싫어요`}
          >
            <ThumbsDown className="size-3.5" />{option.dislikeCount}
          </button>
        </div>
      ))}
    </div>
  )
}
