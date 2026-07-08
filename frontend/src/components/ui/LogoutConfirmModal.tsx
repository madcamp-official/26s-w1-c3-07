import { LogOut } from 'lucide-react'
import Button from './Button'

interface LogoutConfirmModalProps {
  isOpen: boolean
  isProcessing?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}

/** 로그아웃 확인창. 모든 로그아웃 버튼이 동일한 확인 UI를 쓰도록 공용 컴포넌트로 분리. */
export default function LogoutConfirmModal({ isOpen, isProcessing = false, error, onConfirm, onClose }: LogoutConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <section role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-extrabold text-slate-900">로그아웃 하시겠습니까?</h2>
        <p className="mt-2 text-sm text-slate-500">다시 로그인하면 이전 정보로 계속 이용할 수 있습니다.</p>
        {error && <p className="mt-2 text-sm font-medium text-rose-500">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>취소</Button>
          <Button onClick={onConfirm} disabled={isProcessing}><LogOut className="size-4" />{isProcessing ? '로그아웃 중' : '로그아웃'}</Button>
        </div>
      </section>
    </div>
  )
}
