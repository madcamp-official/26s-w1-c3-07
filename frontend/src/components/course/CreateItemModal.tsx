import { useEffect, useState, type FormEvent } from 'react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

interface CreateItemModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateFolder: (name: string) => Promise<void>
}

export default function CreateItemModal({ isOpen, onClose, onCreateFolder }: CreateItemModalProps) {
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) setName('')
  }, [isOpen])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim()) return
    setIsSubmitting(true)
    try {
      await onCreateFolder(name.trim())
      setName('')
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} title="폴더 만들기" onClose={onClose}>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">폴더 이름</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 컴퓨터 과학" className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button type="submit" disabled={!name.trim() || isSubmitting}>{isSubmitting ? '등록 중' : '등록하기'}</Button>
        </div>
      </form>
    </Modal>
  )
}
