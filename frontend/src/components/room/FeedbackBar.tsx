import { Check, ThumbsDown, ThumbsUp, Zap } from 'lucide-react'
import type { FeedbackKey, FeedbackOption } from '../../types/room'
import { cn } from '../../utils/cn'

interface FeedbackBarProps {
  options: FeedbackOption[]
  canVote?: boolean
  onVote: (key: FeedbackKey, vote: 'like' | 'dislike') => void
  onAcknowledge?: (key: FeedbackKey) => void
}

export default function FeedbackBar({ options, canVote = true, onVote, onAcknowledge }: FeedbackBarProps) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto rounded-3xl border border-amber-100 bg-amber-50 p-4">
      <span className="inline-flex shrink-0 items-center gap-1.5 font-extrabold text-amber-600"><Zap className="size-4 fill-amber-400 text-amber-400" />실시간 피드백</span>
      {/* justify-evenly: 항목 사이 간격과 묶음 양 끝 여백을 모두 동일하게 배분(라벨/오른쪽 벽과 살짝 떨어지되 사이 간격과 같은 폭) */}
      <div className="flex flex-1 items-center justify-evenly gap-3">
      {options.map((option) => {
        const isEmpty = option.likeCount === 0 && option.dislikeCount === 0
        return (
          <div key={option.key} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700">
            <span>{option.label}</span>
            <button
              type="button"
              onClick={() => onVote(option.key, 'like')}
              disabled={!canVote}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition disabled:cursor-not-allowed',
                option.myLiked ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400',
                canVote && !option.myLiked && 'hover:text-emerald-600',
              )}
              aria-pressed={option.myLiked}
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
                option.myDisliked ? 'bg-rose-100 text-rose-700' : 'text-slate-400',
                canVote && !option.myDisliked && 'hover:text-rose-600',
              )}
              aria-pressed={option.myDisliked}
              aria-label={`${option.label} 싫어요`}
            >
              <ThumbsDown className="size-3.5" />{option.dislikeCount}
            </button>
            {!canVote && onAcknowledge && (
              <button
                type="button"
                onClick={() => onAcknowledge(option.key)}
                disabled={isEmpty}
                className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-violet-600 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-violet-50"
                aria-label={`${option.label} 반영 완료`}
                title="반영 완료 (초기화)"
              >
                <Check className="size-3.5" />
              </button>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}
