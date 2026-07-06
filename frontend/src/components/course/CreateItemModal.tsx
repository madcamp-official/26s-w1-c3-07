import { useEffect, useState, type FormEvent } from 'react'
import { BookOpen, Folder } from 'lucide-react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { cn } from '../../utils/cn'

type ItemType = 'folder' | 'course'

interface CreateItemModalProps {
  isOpen: boolean
  initialType?: ItemType
  allowCourse?: boolean
  onClose: () => void
  onCreateFolder: (name: string) => Promise<void>
  onCreateCourse: (title: string) => Promise<void>
}

export default function CreateItemModal({ isOpen, initialType = 'folder', allowCourse = true, onClose, onCreateFolder, onCreateCourse }: CreateItemModalProps) {
  const [type, setType] = useState<ItemType>(initialType)
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) setType(allowCourse ? initialType : 'folder')
  }, [isOpen, initialType, allowCourse])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) return
    setIsSubmitting(true)
    try {
      if (type === 'folder') await onCreateFolder(name.trim())
      else await onCreateCourse(name.trim())
      setName('')
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} title={allowCourse ? '폴더/강의 등록' : '폴더 만들기'} onClose={onClose}>
      <form onSubmit={submit} className="mt-6 space-y-5">
        {allowCourse && (
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'folder' as const, label: '폴더', Icon: Folder },
              { value: 'course' as const, label: '강의', Icon: BookOpen },
            ]).map(({ value, label, Icon }) => (
              <button key={value} type="button" onClick={() => setType(value)} className={cn('flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 font-bold transition', type === value ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-violet-200')}>
                <Icon className="size-4" />{label}
              </button>
            ))}
          </div>
        )}
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">{type === 'folder' ? '폴더 이름' : '강의 이름'}</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={type === 'folder' ? '예: 컴퓨터 과학' : '예: 자료구조 입문'} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button type="submit" disabled={!name.trim() || isSubmitting}>{isSubmitting ? '등록 중' : '등록하기'}</Button>
        </div>
      </form>
    </Modal>
  )
}
