import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import Sidebar from '../components/navigation/Sidebar'
import { getCurrentUser, switchUserRole } from '../services/api'
import type { User, UserRole } from '../types/user'

// 강의자 모드에서만 의미가 있는 라우트. 수강생으로 전환하면 이 경로에 계속 머물 수 없어 "내 강의"로 보냅니다.
const INSTRUCTOR_ONLY_PATHS = ['/student/questions']

export default function DashboardLayout() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    void getCurrentUser().then((current) => {
      setUser(current)
      setIsLoading(false)
    })
  }, [])

  const handleSwitchRole = (role: UserRole) => {
    void switchUserRole(role).then((updated) => {
      setUser(updated)
      if (updated.role !== 'instructor' && INSTRUCTOR_ONLY_PATHS.includes(location.pathname)) {
        navigate('/student/courses', { replace: true })
      }
    })
  }

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" aria-label="불러오는 중" /></div>
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-100 lg:block">
        <Sidebar user={user} onSwitchRole={handleSwitchRole} />
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-100 bg-white px-4 lg:hidden">
        <BrandLogo compact to="/student/courses" />
        <button type="button" onClick={() => setIsMenuOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100" aria-label="메뉴 열기"><Menu /></button>
      </header>

      {isMenuOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden" onMouseDown={() => setIsMenuOpen(false)}>
          <aside className="h-full w-72 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="absolute left-60 top-4 z-10">
              <button type="button" onClick={() => setIsMenuOpen(false)} className="rounded-full bg-white p-2 text-slate-500 shadow" aria-label="메뉴 닫기"><X className="size-5" /></button>
            </div>
            <Sidebar user={user} onNavigate={() => setIsMenuOpen(false)} onSwitchRole={handleSwitchRole} />
          </aside>
        </div>
      )}

      <main className="min-h-screen lg:ml-72">
        <Outlet key={user.role} />
      </main>
    </div>
  )
}
