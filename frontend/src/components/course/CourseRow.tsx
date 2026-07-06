import { GripVertical, MoreHorizontal } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Course, TreeItemType } from '../../types/course'
import { cn } from '../../utils/cn'
import CourseIcon from './CourseIcon'
import CourseMeta from './CourseMeta'
import { DRAG_MIME, type DragPayload } from './dragPayload'
import ItemActionsMenu from './ItemActionsMenu'

interface CourseRowProps {
  course: Course
  isInstructor?: boolean
  isInBlockedFolder?: boolean
  onRename: (itemId: string, itemType: TreeItemType, currentName: string) => void
  onMove: (itemId: string, itemType: TreeItemType, label: string) => void
  onDelete: (itemId: string, itemType: TreeItemType, label: string) => void
}

export default function CourseRow({ course, isInstructor = false, isInBlockedFolder = false, onRename, onMove, onDelete }: CourseRowProps) {
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isOwned = isInstructor || course.ownership === 'owned'
  const isInteractive = !isInBlockedFolder

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!isInteractive) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ itemId: course.id, itemType: 'course' } satisfies DragPayload))
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div draggable={isInteractive} onDragStart={handleDragStart} className="group relative flex w-full items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-violet-200 hover:shadow-md sm:p-5">
      <button type="button" onClick={() => navigate(`/room/${course.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <GripVertical className={cn('size-4 shrink-0 text-slate-200', isInteractive && 'group-hover:text-violet-300')} />
        <CourseIcon color={course.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-extrabold text-slate-900 sm:text-lg">{course.title}</span>
          <span className="mt-1.5 block"><CourseMeta participantCount={course.participantCount} questionCount={course.questionCount} updatedAt={course.updatedAt} /></span>
        </span>
      </button>

      {isInteractive && (
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
      )}
    </div>
  )
}
