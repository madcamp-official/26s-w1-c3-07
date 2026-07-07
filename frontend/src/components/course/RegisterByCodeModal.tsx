import { Plus, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

interface RegisterByCodeModalProps {
  isOpen: boolean
  onClose: () => void
  onRegister: (code: string) => Promise<unknown>
}

export default function RegisterByCodeModal({ isOpen, onClose, onRegister }: RegisterByCodeModalProps) {
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!code.trim()) return
    setIsSubmitting(true)
    setMessage('')
    try {
      await onRegister(code.trim())
      setCode('')
      onClose()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '강의를 등록하지 못했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} title="코드로 등록하기" onClose={onClose}>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-slate-400"><Plus className="size-4 text-violet-500" />내 강의 목록에 저장됩니다</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600">
          <span className="size-1.5 rounded-full bg-violet-500" />목록 저장
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="flex gap-2">
          <input
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="예: 123e4567-e89b-12d3-a456-426614174000"
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
          />
          <Button type="button" variant="secondary" className="shrink-0"><Search className="size-4" />검색</Button>
        </div>
        {message && <p className="text-xs font-medium text-rose-500" aria-live="polite">{message}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">취소</Button>
          <Button type="submit" disabled={!code.trim() || isSubmitting} className="flex-1">{isSubmitting ? '등록 중' : '내 강의에 등록'}</Button>
        </div>
      </form>
    </Modal>
  )
}
