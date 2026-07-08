import { Check, Copy, KeyRound, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../utils/cn'

interface RegistrationCodeModalProps {
  isOpen: boolean
  label: string
  code: string | null
  onClose: () => void
}

export default function RegistrationCodeModal({ isOpen, label, code, onClose }: RegistrationCodeModalProps) {
  const [isCopied, setIsCopied] = useState(false)

  if (!isOpen || !code) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // clipboard access unavailable; still show feedback for demo purposes
    }
    setIsCopied(true)
    window.setTimeout(() => setIsCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white"><KeyRound className="size-5" /></span>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">등록 코드</h2>
              <p className="text-sm text-slate-400">{label}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="닫기">
            <X className="size-5" />
          </button>
        </header>

        <p className="mt-6 text-sm text-slate-400">
          이 코드를 공유하면 다른 사람이 "코드로 등록하기"에서 붙여넣어 내 강의 목록에 저장할 수 있습니다.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">{code}</span>
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
      </section>
    </div>
  )
}
