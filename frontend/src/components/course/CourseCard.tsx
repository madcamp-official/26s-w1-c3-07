import { GripVertical, MoreHorizontal } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Course, TreeItemType } from '../../types/course'
import CourseIcon from './CourseIcon'
import CourseMeta from './CourseMeta'
import { DRAG_MIME, type DragPayload } from './dragPayload'
import ItemActionsMenu from './ItemActionsMenu'

interface CourseCardProps {
  course: Course
  isInstructor?: boolean
  onRename: (itemId: string, itemType: TreeItemType, currentName: string) => void
  onMove: (itemId: string, itemType: TreeItemType, label: string) => void
  onDelete: (itemId: string, itemType: TreeItemType, label: string) => void
}

export default function CourseCard({ course, isInstructor = false, onRename, onMove, onDelete }: CourseCardProps) {
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isOwned = isInstructor || course.ownership === 'owned'

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ itemId: course.id, itemType: 'course' } satisfies DragPayload))
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div draggable onDragStart={handleDragStart} className="group relative flex min-w-0 items-start gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md sm:p-6">
      <button type="button" onClick={() => navigate(`/room/${course.id}`)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <GripVertical className="mt-3 size-4 shrink-0 text-slate-200 transition group-hover:text-violet-300" />
        <CourseIcon color={course.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-extrabold text-slate-900">{course.title}</span>
          <span className="mt-5 block"><CourseMeta participantCount={course.participantCount} questionCount={course.questionCount} /></span>
        </span>
      </button>

      <div className="relative shrink-0 opacity-0 transition group-hover:opacity-100">
        <button type="button" onClick={() => setIsMenuOpen((current) => !current)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="강의 메뉴">
          <MoreHorizontal className="size-4" />
        </button>
        {isMenuOpen && (
          <ItemActionsMenu
            onRename={isOwned ? () => onRename(course.id, 'course', course.title) : undefined}
            onMove={() => onMove(course.id, 'course', course.title)}
            onDelete={() => onDelete(course.id, 'course', course.title)}
            onClose={() => setIsMenuOpen(false)}
            deleteLabel={isOwned ? '삭제' : '등록취소'}
          />
        )}
      </div>
    </div>
  )
}
