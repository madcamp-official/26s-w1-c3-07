import { FileText } from 'lucide-react'
import type { ItemColor } from '../../types/course'
import { cn } from '../../utils/cn'

export default function CourseIcon({ color }: { color: ItemColor }) {
  return (
    <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', color === 'purple' ? 'bg-violet-100 text-violet-600' : 'bg-blue-50 text-blue-600')}>
      <FileText className="size-5" />
    </span>
  )
}
