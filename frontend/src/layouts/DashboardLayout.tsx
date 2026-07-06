import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import Sidebar from '../components/navigation/Sidebar'
import { getCurrentUser, switchUserRole } from '../services/api'
import type { User, UserRole } from '../types/user'

export default function DashboardLayout() {
  const [user, setUser] = useState<User | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    void getCurrentUser().then(setUser)
  }, [])

  const handleSwitchRole = (role: UserRole) => {
    void switchUserRole(role).then(setUser)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-100 lg:block">
        {user && <Sidebar user={user} onSwitchRole={handleSwitchRole} />}
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-100 bg-white px-4 lg:hidden">
        <BrandLogo compact to="/student/courses" />
        <button type="button" onClick={() => setIsMenuOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100" aria-label="메뉴 열기"><Menu /></button>
      </header>

      {isMenuOpen && user && (
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
        <Outlet key={user?.role} />
      </main>
    </div>
  )
}
