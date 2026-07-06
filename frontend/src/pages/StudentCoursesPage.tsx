import { Plus, RotateCcw } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import CourseCard from '../components/course/CourseCard'
import CourseJoinForm from '../components/course/CourseJoinForm'
import CreateItemModal from '../components/course/CreateItemModal'
import { DRAG_MIME, type DragPayload } from '../components/course/dragPayload'
import FolderTree from '../components/course/FolderTree'
import MoveItemModal from '../components/course/MoveItemModal'
import RegisterByCodeModal from '../components/course/RegisterByCodeModal'
import Button from '../components/ui/Button'
import { useStudentCourses } from '../hooks/useStudentCourses'
import type { SortOrder, TreeItemType } from '../types/course'
import { cn } from '../utils/cn'

const sortOptions: Array<{ value: SortOrder; label: string }> = [
  { value: 'created', label: '생성순' },
  { value: 'alphabetical', label: '사전순' },
]

interface ItemTarget {
  itemId: string
  itemType: TreeItemType
  label: string
}

export default function StudentCoursesPage() {
  const { user, folders, courses, isLoading, error, sortOrder, setSortOrder, addFolder, addCourse, registerCourse, moveItem, renameItem, deleteItem, reload } = useStudentCourses()
  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [createInitialType, setCreateInitialType] = useState<'folder' | 'course' | null>(null)
  const [moveTarget, setMoveTarget] = useState<ItemTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ItemTarget | null>(null)
  const [renameTarget, setRenameTarget] = useState<ItemTarget | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [isRootDragOver, setIsRootDragOver] = useState(false)
  const isInstructor = user?.role === 'instructor'

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" aria-label="강의 목록 불러오는 중" /></div>
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div><p className="font-bold text-slate-700">{error}</p><Button onClick={() => void reload()} className="mt-4"><RotateCcw className="size-4" />다시 시도</Button></div>
      </div>
    )
  }

  const startRename = (itemId: string, itemType: TreeItemType, currentName: string) => {
    setRenameTarget({ itemId, itemType, label: currentName })
    setRenameValue(currentName)
  }

  const submitRename = async () => {
    const target = renameTarget
    setRenameTarget(null)
    const trimmed = renameValue.trim()
    if (!target || !trimmed || trimmed === target.label) return
    await renameItem({ itemId: target.itemId, itemType: target.itemType, name: trimmed })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteItem({ itemId: deleteTarget.itemId, itemType: deleteTarget.itemType })
    setDeleteTarget(null)
  }

  const handleRootDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsRootDragOver(false)
    const raw = event.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    const payload = JSON.parse(raw) as DragPayload
    await moveItem({ itemId: payload.itemId, itemType: payload.itemType, targetFolderId: null })
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white px-4 py-5 sm:px-6 xl:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <h1 className="shrink-0 pt-2 text-2xl font-extrabold tracking-tight text-slate-900">내 강의</h1>
          {!isInstructor && <div className="w-full xl:max-w-xl"><CourseJoinForm /></div>}
          {isInstructor ? (
            <Button onClick={() => setCreateInitialType('course')} className="self-start rounded-full"><Plus className="size-5" />강의 만들기</Button>
          ) : (
            <Button onClick={() => setIsRegisterOpen(true)} className="self-start rounded-full"><Plus className="size-5" />폴더/강의 등록</Button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 xl:px-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {isInstructor ? (
            <div />
          ) : (
            <div className="flex flex-wrap items-center gap-5 text-sm text-slate-400">
              <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-violet-500" />내가 만든 폴더</span>
              <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-blue-500" />내가 등록한 폴더</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="dashed" onClick={() => setCreateInitialType('folder')} className="rounded-full"><Plus className="size-4" />루트 폴더 만들기</Button>
            <div className="flex rounded-2xl bg-slate-100 p-1">
              {sortOptions.map((option) => (
                <button key={option.value} type="button" onClick={() => setSortOrder(option.value)} className={cn('rounded-xl px-4 py-2 text-sm font-bold transition', sortOrder === option.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600')}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <section
          className={cn('mt-7 rounded-2xl transition', isRootDragOver && 'bg-violet-50 ring-2 ring-violet-300')}
          aria-label="강의 폴더"
          onDragOver={(event) => { if (event.dataTransfer.types.includes(DRAG_MIME)) { event.preventDefault(); setIsRootDragOver(true) } }}
          onDragLeave={() => setIsRootDragOver(false)}
          onDrop={(event) => void handleRootDrop(event)}
        >
          <FolderTree
            folders={folders}
            isInstructor={isInstructor}
            onAddSubfolder={() => setCreateInitialType('folder')}
            onRename={startRename}
            onMove={(itemId, itemType, label) => setMoveTarget({ itemId, itemType, label })}
            onDelete={(itemId, itemType, label) => setDeleteTarget({ itemId, itemType, label })}
            onDrop={(payload, targetFolderId) => void moveItem({ itemId: payload.itemId, itemType: payload.itemType, targetFolderId })}
            renamingId={renameTarget?.itemId ?? null}
            renameValue={renameValue}
            onRenameValueChange={setRenameValue}
            onRenameSubmit={() => void submitRename()}
            onRenameCancel={() => setRenameTarget(null)}
          />
        </section>

        <section className="mt-10 border-t border-slate-100 pt-8" aria-label="루트 강의">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                isInstructor={isInstructor}
                onRename={startRename}
                onMove={(itemId, itemType, label) => setMoveTarget({ itemId, itemType, label })}
                onDelete={(itemId, itemType, label) => setDeleteTarget({ itemId, itemType, label })}
              />
            ))}
          </div>
        </section>
      </div>

      <CreateItemModal
        isOpen={createInitialType !== null}
        initialType={createInitialType ?? 'folder'}
        allowCourse={isInstructor}
        onClose={() => setCreateInitialType(null)}
        onCreateFolder={addFolder}
        onCreateCourse={addCourse}
      />
      <RegisterByCodeModal isOpen={isRegisterOpen} onClose={() => setIsRegisterOpen(false)} onRegister={registerCourse} />
      <MoveItemModal
        isOpen={moveTarget !== null}
        itemId={moveTarget?.itemId ?? null}
        itemType={moveTarget?.itemType ?? null}
        itemLabel={moveTarget?.label ?? ''}
        folders={folders}
        onClose={() => setMoveTarget(null)}
        onMove={async (targetFolderId) => {
          if (!moveTarget) return
          await moveItem({ itemId: moveTarget.itemId, itemType: moveTarget.itemType, targetFolderId })
          setMoveTarget(null)
        }}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => setDeleteTarget(null)}>
          <section role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-extrabold text-slate-900">삭제하시겠습니까?</h2>
            <p className="mt-2 text-sm text-slate-500"><span className="font-bold text-slate-700">{deleteTarget.label}</span>을(를) 삭제하면 되돌릴 수 없습니다.</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>취소</Button>
              <Button onClick={() => void handleDelete()} className="bg-rose-600 hover:bg-rose-700">삭제</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
