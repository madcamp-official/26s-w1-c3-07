import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { joinCourse } from '../../services/api'
import Button from '../ui/Button'

interface CourseJoinFormProps {
  compact?: boolean
}

export default function CourseJoinForm({ compact = false }: CourseJoinFormProps) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')

    try {
      const course = await joinCourse(code)
      navigate(`/room/${course.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '강의를 찾지 못했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={compact ? 'w-full' : 'w-full max-w-xl'}>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          aria-label="강의 코드"
          placeholder="코드 입력 후 바로 입장"
          className="min-w-0 flex-1 rounded-2xl border-2 border-violet-200 bg-white px-4 py-3 text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
        />
        <Button type="submit" variant="secondary" disabled={isSubmitting} className="shrink-0 border-violet-100 text-violet-500">
          {isSubmitting ? '확인 중' : '확인'}
        </Button>
      </div>
      <p className="mt-1 min-h-5 text-xs font-medium text-violet-600" aria-live="polite">{message}</p>
    </form>
  )
}
