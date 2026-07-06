import { ArrowLeft, Folder } from 'lucide-react'
import { useState } from 'react'
import type { CourseFolder, TreeItemType } from '../../types/course'
import { cn } from '../../utils/cn'
import Button from '../ui/Button'

interface MoveItemModalProps {
  isOpen: boolean
  itemId: string | null
  itemType: TreeItemType | null
  itemLabel: string
  folders: CourseFolder[]
  onClose: () => void
  onMove: (targetFolderId: string | null) => Promise<void>
}

function countItems(folder: CourseFolder): number {
  return folder.children.length + folder.courses.length
}

function isDescendantOrSelf(folder: CourseFolder, id: string): boolean {
  if (folder.id === id) return true
  return folder.children.some((child) => isDescendantOrSelf(child, id))
}

function findFolderPath(folders: CourseFolder[], id: string, path: CourseFolder[] = []): CourseFolder[] | null {
  for (const folder of folders) {
    if (folder.id === id) return [...path, folder]
    const found = findFolderPath(folder.children, id, [...path, folder])
    if (found) return found
  }
  return null
}

export default function MoveItemModal({ isOpen, itemId, itemType, itemLabel, folders, onClose, onMove }: MoveItemModalProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentPath = currentFolderId ? findFolderPath(folders, currentFolderId) : null
  const currentFolder = currentPath?.at(-1) ?? null
  const visibleFolders = (currentFolder ? currentFolder.children : folders).filter((folder) => !(itemType === 'folder' && itemId && isDescendantOrSelf(folder, itemId)))

  if (!isOpen) return null

  const handleClose = () => {
    setCurrentFolderId(null)
    onClose()
  }

  const handleMove = async () => {
    setIsSubmitting(true)
    try {
      await onMove(currentFolderId)
      setCurrentFolderId(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={handleClose}>
      <section role="dialog" aria-modal="true" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <span className="flex gap-1.5">
            <span className="size-3 rounded-full bg-rose-400" />
            <span className="size-3 rounded-full bg-amber-400" />
            <span className="size-3 rounded-full bg-emerald-400" />
          </span>
          <button
            type="button"
            onClick={() => setCurrentFolderId(currentPath && currentPath.length > 1 ? currentPath[currentPath.length - 2].id : null)}
            disabled={!currentFolderId}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="상위 폴더로"
          >
            <ArrowLeft className="size-4" />
          </button>
          <span className="rounded-lg bg-white px-3 py-1 text-sm font-bold text-slate-700 shadow-sm">
            {currentFolder ? currentFolder.name : '최상위 (루트)'}
          </span>
        </header>

        <div className="grid min-h-64 grid-cols-3 gap-4 p-6 sm:grid-cols-4">
          {visibleFolders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setCurrentFolderId(folder.id)}
              className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-center hover:bg-violet-50"
            >
              <Folder className={cn('size-10', folder.ownership === 'owned' ? 'text-violet-500' : 'text-blue-500')} />
              <span className="w-full truncate text-sm font-bold text-slate-700">{folder.name}</span>
              <span className="text-xs text-slate-400">{countItems(folder)}개</span>
            </button>
          ))}
          {visibleFolders.length === 0 && (
            <p className="col-span-full grid place-items-center text-sm text-slate-300">하위 폴더가 없습니다</p>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <div className="text-xs text-slate-400">
            <p>폴더를 클릭하면 안으로 들어갑니다</p>
            <p>이동할 항목: <span className="font-bold text-slate-600">{itemLabel}</span></p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleClose}>취소</Button>
            <Button onClick={() => void handleMove()} disabled={isSubmitting}>{isSubmitting ? '이동 중' : '여기로 이동'}</Button>
          </div>
        </footer>
      </section>
    </div>
  )
}
