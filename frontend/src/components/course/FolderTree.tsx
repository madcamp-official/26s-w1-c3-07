import { ChevronDown, ChevronRight, Folder, MoreHorizontal, Plus } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import type { CourseFolder, TreeItemType } from '../../types/course'
import { cn } from '../../utils/cn'
import { DRAG_MIME, type DragPayload } from './dragPayload'
import CourseRow from './CourseRow'
import ItemActionsMenu from './ItemActionsMenu'

interface FolderNodeProps {
  folder: CourseFolder
  depth?: number
  isInstructor?: boolean
  onAddSubfolder: (parentId: string) => void
  onEditCourse?: (courseId: string) => void
  onRename: (itemId: string, itemType: TreeItemType, currentName: string) => void
  onMove: (itemId: string, itemType: TreeItemType, label: string) => void
  onDelete: (itemId: string, itemType: TreeItemType, label: string, isOwned: boolean) => void
  onDrop: (payload: DragPayload, targetFolderId: string | null) => void
  renamingId: string | null
  renameValue: string
  onRenameValueChange: (value: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
}

function FolderNode({ folder, depth = 0, isInstructor = false, onAddSubfolder, onEditCourse, onRename, onMove, onDelete, onDrop, renamingId, renameValue, onRenameValueChange, onRenameSubmit, onRenameCancel }: FolderNodeProps) {
  const [isExpanded, setIsExpanded] = useState(folder.expandedByDefault ?? true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const hasChildren = folder.children.length > 0 || folder.courses.length > 0
  const Chevron = isExpanded ? ChevronDown : ChevronRight
  const isOwned = isInstructor || folder.ownership === 'owned'
  const isRenaming = renamingId === folder.id

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!isOwned) {
      event.preventDefault()
      return
    }
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ itemId: folder.id, itemType: 'folder' } satisfies DragPayload))
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(DRAG_MIME)) return
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(true)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
    const raw = event.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    const payload = JSON.parse(raw) as DragPayload
    if (payload.itemId === folder.id) return
    if (!isOwned) return
    onDrop(payload, folder.id)
  }

  return (
    <li id={`folder-${folder.id}`}>
      <div
        draggable={isOwned}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn('group/folder relative flex items-center gap-2 rounded-xl pr-2 scroll-mt-24', depth > 0 ? 'ml-6' : '', isDragOver && 'bg-violet-50 ring-2 ring-violet-300')}
      >
        <button
          type="button"
          onClick={() => hasChildren && setIsExpanded((current) => !current)}
          className="flex flex-1 items-center gap-2 rounded-xl py-2 pr-3 text-left font-bold text-slate-700 hover:bg-white"
          aria-expanded={hasChildren ? isExpanded : undefined}
        >
          <Chevron className={cn('size-4', hasChildren ? 'text-slate-300' : 'invisible')} />
          <Folder className={cn('size-5', isOwned ? 'text-violet-500' : 'text-blue-500')} />
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onRenameValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onRenameSubmit()
                if (event.key === 'Escape') onRenameCancel()
              }}
              onBlur={onRenameSubmit}
              className="min-w-0 flex-1 rounded-lg border border-violet-300 px-2 py-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-violet-200"
            />
          ) : (
            <span>{folder.name}</span>
          )}
        </button>

        {!isRenaming && (
          <div className="flex items-center gap-1 opacity-0 transition group-hover/folder:opacity-100">
            {isOwned && (
              <button type="button" onClick={() => onAddSubfolder(folder.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-violet-600" aria-label="하위 폴더 추가">
                <Plus className="size-4" />
              </button>
            )}
            <div className="relative">
              <button type="button" onClick={() => setIsMenuOpen((current) => !current)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="폴더 메뉴">
                <MoreHorizontal className="size-4" />
              </button>
              {isMenuOpen && (
                <ItemActionsMenu
                  onRename={isOwned ? () => onRename(folder.id, 'folder', folder.name) : undefined}
                  onMove={isOwned ? () => onMove(folder.id, 'folder', folder.name) : undefined}
                  onDelete={() => onDelete(folder.id, 'folder', folder.name, isOwned)}
                  onClose={() => setIsMenuOpen(false)}
                  deleteLabel={isOwned ? '삭제' : '등록취소'}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className={depth > 0 ? 'ml-6' : ''}>
          {folder.courses.length > 0 && (
            <div className="my-2 ml-8 space-y-3">
              {folder.courses.map((course) => (
                <CourseRow key={course.id} course={course} isInstructor={isInstructor} isInBlockedFolder={!isOwned} onEdit={onEditCourse} onMove={onMove} onDelete={onDelete} />
              ))}
            </div>
          )}
          {folder.children.length > 0 && (
            <ul className="space-y-0.5">
              {folder.children.map((child) => (
                <FolderNode
                  key={child.id}
                  folder={child}
                  depth={depth + 1}
                  isInstructor={isInstructor}
                  onAddSubfolder={onAddSubfolder}
                  onEditCourse={onEditCourse}
                  onRename={onRename}
                  onMove={onMove}
                  onDelete={onDelete}
                  onDrop={onDrop}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  onRenameValueChange={onRenameValueChange}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

interface FolderTreeProps {
  folders: CourseFolder[]
  isInstructor?: boolean
  onAddSubfolder: (parentId: string) => void
  onEditCourse?: (courseId: string) => void
  onRename: (itemId: string, itemType: TreeItemType, currentName: string) => void
  onMove: (itemId: string, itemType: TreeItemType, label: string) => void
  onDelete: (itemId: string, itemType: TreeItemType, label: string, isOwned: boolean) => void
  onDrop: (payload: DragPayload, targetFolderId: string | null) => void
  renamingId: string | null
  renameValue: string
  onRenameValueChange: (value: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
}

export default function FolderTree({ folders, isInstructor = false, onAddSubfolder, onEditCourse, onRename, onMove, onDelete, onDrop, renamingId, renameValue, onRenameValueChange, onRenameSubmit, onRenameCancel }: FolderTreeProps) {
  return (
    <ul className="space-y-1">
      {folders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          isInstructor={isInstructor}
          onAddSubfolder={onAddSubfolder}
          onEditCourse={onEditCourse}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
          onDrop={onDrop}
          renamingId={renamingId}
          renameValue={renameValue}
          onRenameValueChange={onRenameValueChange}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
        />
      ))}
    </ul>
  )
}
