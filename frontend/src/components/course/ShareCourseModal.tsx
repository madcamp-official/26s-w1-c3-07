import { Check, Copy, Link as LinkIcon, RotateCcw, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { getOrCreateJoinCode, reissueJoinCode } from '../../services/api'
import type { Course } from '../../types/course'
import { cn } from '../../utils/cn'

interface ShareCourseModalProps {
  isOpen: boolean
  course: Course | null
  onClose: () => void
}

function CopyField({ value }: { value: string }) {
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // clipboard access unavailable; still show feedback for demo purposes
    }
    setIsCopied(true)
    window.setTimeout(() => setIsCopied(false), 1500)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">{value}</span>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-bold text-white transition',
          isCopied ? 'bg-emerald-500' : 'bg-violet-600 hover:bg-violet-700',
        )}
      >
        {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {isCopied ? '복사됨' : '복사'}
      </button>
    </div>
  )
}

export default function ShareCourseModal({ isOpen, course, onClose }: ShareCourseModalProps) {
  const [joinCode, setJoinCode] = useState<string | null>(course?.joinCode ?? null)
  const [isReissuing, setIsReissuing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !course) return
    setJoinCode(course.joinCode ?? null)
    setError('')
    if (course.joinCode) return

    let cancelled = false
    void getOrCreateJoinCode(course.id)
      .then((code) => { if (!cancelled) setJoinCode(code) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : '코드 발급에 실패했습니다.') })
    return () => { cancelled = true }
  }, [isOpen, course])

  if (!isOpen || !course) return null

  const handleReissue = async () => {
    setIsReissuing(true)
    setError('')
    try {
      setJoinCode(await reissueJoinCode(course.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '재발급에 실패했습니다.')
    } finally {
      setIsReissuing(false)
    }
  }

  const joinLink = `${window.location.origin}/room/${course.id}`

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white"><LinkIcon className="size-5" /></span>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">링크 공유</h2>
              <p className="text-sm text-slate-400">{course.title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="닫기">
            <X className="size-5" />
          </button>
        </header>

        <div className="mt-6 rounded-3xl border border-slate-100 bg-slate-50 p-6 text-center">
          <p className="text-sm font-bold text-slate-500">QR 코드 스캔</p>
          <div className="mt-4 inline-flex rounded-2xl bg-white p-4 shadow-sm">
            <QRCodeSVG value={joinLink} size={168} fgColor="#7c3aed" />
          </div>
          <p className="mt-4 text-sm text-slate-400">학생들이 스캔해서 바로 참여할 수 있습니다</p>
        </div>

        <div className="mt-6 space-y-2">
          <p className="text-sm font-bold text-slate-700">참여 링크</p>
          <CopyField value={joinLink} />
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">참여 코드</p>
            <button
              type="button"
              onClick={() => void handleReissue()}
              disabled={isReissuing || !joinCode}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />{isReissuing ? '재발급 중' : '재발급'}
            </button>
          </div>
          <CopyField value={joinCode ?? '발급 중...'} />
          {error && <p className="text-xs font-medium text-rose-500">{error}</p>}
        </div>
      </section>
    </div>
  )
}
