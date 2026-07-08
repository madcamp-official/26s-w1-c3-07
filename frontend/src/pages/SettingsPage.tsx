import { CheckCircle2, LogOut, Pencil, TriangleAlert, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import LogoutConfirmModal from '../components/ui/LogoutConfirmModal'
import { deleteAccount, getCurrentUser, signOut, updateUserName } from '../services/api'
import type { User } from '../types/user'

export default function SettingsPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [nickname, setNickname] = useState('')
  const [isEditingNickname, setIsEditingNickname] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [isSaved, setIsSaved] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isProcessingAccountAction, setIsProcessingAccountAction] = useState(false)
  const [accountActionError, setAccountActionError] = useState('')

  useEffect(() => {
    void getCurrentUser().then((current) => {
      if (!current) return
      setUser(current)
      setNickname(current.name)
    })
  }, [])

  const startEditingNickname = () => {
    setError('')
    setIsSaved(false)
    setIsEditingNickname(true)
  }

  const cancelEditingNickname = () => {
    setNickname(user?.name ?? '')
    setIsEditingNickname(false)
    setError('')
  }

  const saveNickname = async () => {
    if (!nickname.trim() || nickname.trim() === user?.name) {
      setIsEditingNickname(false)
      return
    }
    setError('')
    setIsSaving(true)
    try {
      const updated = await updateUserName(nickname)
      setUser(updated)
      setIsEditingNickname(false)
      setIsSaved(true)
      window.setTimeout(() => setIsSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '닉네임을 변경하지 못했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = async () => {
    setIsProcessingAccountAction(true)
    try {
      await signOut()
      navigate('/')
    } catch (err) {
      setAccountActionError(err instanceof Error ? err.message : '로그아웃하지 못했습니다.')
      setIsProcessingAccountAction(false)
    }
  }

  const handleDeleteAccount = async () => {
    setIsProcessingAccountAction(true)
    try {
      await deleteAccount()
      navigate('/')
    } catch (err) {
      setAccountActionError(err instanceof Error ? err.message : '탈퇴하지 못했습니다.')
      setIsProcessingAccountAction(false)
    }
  }

  if (!user) {
    return <div className="grid min-h-screen place-items-center"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" aria-label="설정 불러오는 중" /></div>
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white px-4 py-5 sm:px-6 xl:px-10">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">설정</h1>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-7 sm:px-6 xl:px-10">
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-extrabold text-slate-900">프로필</h2>

          <div className="mt-5 flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-violet-600 text-xl font-extrabold text-white">{user.avatarText}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-400">닉네임</p>
              {isEditingNickname ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    autoFocus
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveNickname()
                      if (event.key === 'Escape') cancelEditingNickname()
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-violet-300 px-3 py-2 text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-violet-200"
                  />
                  <Button onClick={() => void saveNickname()} disabled={isSaving || !nickname.trim()}>{isSaving ? '저장 중' : '저장'}</Button>
                  <Button variant="ghost" onClick={cancelEditingNickname}>취소</Button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <span className="truncate text-lg font-extrabold text-slate-900">{user.name}</span>
                  <button type="button" onClick={startEditingNickname} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-violet-600" aria-label="닉네임 변경">
                    <Pencil className="size-4" />
                  </button>
                </div>
              )}
              {error && <p className="mt-1.5 text-sm font-medium text-rose-500">{error}</p>}
              {isSaved && !isEditingNickname && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold text-emerald-600"><CheckCircle2 className="size-4" />닉네임이 변경되었습니다.</p>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="text-sm font-medium text-slate-400">이메일</p>
            <p className="mt-1 text-base font-bold text-slate-700">{user.email}</p>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-extrabold text-slate-900">계정</h2>

          <button
            type="button"
            onClick={() => setIsLogoutConfirmOpen(true)}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 text-left font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <LogOut className="size-5 text-slate-400" />로그아웃
          </button>

          <button
            type="button"
            onClick={() => setIsDeleteConfirmOpen(true)}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-rose-100 px-4 py-3.5 text-left font-bold text-rose-500 transition hover:border-rose-300 hover:bg-rose-50"
          >
            <UserX className="size-5" />회원 탈퇴
          </button>
        </section>
      </div>

      <LogoutConfirmModal
        isOpen={isLogoutConfirmOpen}
        isProcessing={isProcessingAccountAction}
        error={accountActionError}
        onConfirm={() => void handleLogout()}
        onClose={() => setIsLogoutConfirmOpen(false)}
      />

      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => setIsDeleteConfirmOpen(false)}>
          <section role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><TriangleAlert className="size-5 text-rose-500" />정말 탈퇴하시겠습니까?</h2>
            <p className="mt-2 text-sm text-slate-500">탈퇴하면 내 강의, 질문, 답글을 포함한 모든 정보가 삭제되며 되돌릴 수 없습니다.</p>
            {accountActionError && <p className="mt-2 text-sm font-medium text-rose-500">{accountActionError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsDeleteConfirmOpen(false)}>취소</Button>
              <Button onClick={() => void handleDeleteAccount()} disabled={isProcessingAccountAction} className="bg-rose-600 hover:bg-rose-700"><UserX className="size-4" />{isProcessingAccountAction ? '탈퇴하는 중' : '탈퇴하기'}</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
