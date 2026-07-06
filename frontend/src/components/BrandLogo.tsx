import { Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../utils/cn'

interface BrandLogoProps {
  compact?: boolean
  inverted?: boolean
  to?: string
}

export default function BrandLogo({ compact = false, inverted = false, to }: BrandLogoProps) {
  const content = (
    <div className="flex items-center gap-3" aria-label="Qroom 홈">
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 text-white shadow-lg shadow-violet-200',
          compact ? 'size-10' : 'size-14',
        )}
      >
        <Sparkles className={compact ? 'size-5' : 'size-7'} aria-hidden="true" />
      </span>
      <span className={cn('text-2xl font-extrabold tracking-tight', inverted ? 'text-white' : 'text-slate-900')}>
        Qroom
      </span>
    </div>
  )

  if (!to) return content

  return <Link to={to} aria-label="내 강의로 이동">{content}</Link>
}
