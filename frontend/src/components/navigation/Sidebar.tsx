import { BookOpen, MessageCircleQuestion, Settings, UserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { User, UserRole } from '../../types/user'
import { cn } from '../../utils/cn'
import BrandLogo from '../BrandLogo'

interface SidebarProps {
  user: User
  onNavigate?: () => void
  onSwitchRole?: (role: UserRole) => void
  showRoleSwitch?: boolean
}

const studentNavigation = [
  { label: '내 강의', to: '/courses', Icon: BookOpen },
  { label: '설정', to: '/settings', Icon: Settings },
]

const instructorNavigation = [
  { label: '내 강의', to: '/courses', Icon: BookOpen },
  { label: '미해결 질문', to: '/questions', Icon: MessageCircleQuestion },
  { label: '설정', to: '/settings', Icon: Settings },
]

export default function Sidebar({ user, onNavigate, onSwitchRole, showRoleSwitch = true }: SidebarProps) {
  const navigation = user.role === 'instructor' ? instructorNavigation : studentNavigation

  return (
    <div className="flex h-full flex-col bg-white px-5 py-7">
      <BrandLogo compact to="/courses" />

      <div className="mt-7 flex items-center gap-3 rounded-3xl border border-violet-100 bg-violet-50 p-4">
        <span className="grid size-11 place-items-center rounded-full bg-violet-600 font-extrabold text-white">{user.avatarText}</span>
        <span className="font-extrabold text-slate-800">{user.name}{user.role === 'instructor' && <span className="ml-1.5 text-xs font-bold text-violet-500">Lecturer</span>}</span>
      </div>

      <nav className="mt-6 space-y-1">
        {navigation.map(({ label, to, Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => cn('flex items-center gap-3 rounded-2xl px-4 py-3.5 font-bold transition', isActive ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800')}>
            <Icon className="size-5" />{label}
          </NavLink>
        ))}
      </nav>

      {showRoleSwitch && (
        <div className="mt-auto border-t border-slate-100 pt-6">
          <p className="mb-3 text-xs font-bold text-slate-400">역할 전환</p>
          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => onSwitchRole?.('student')}
              className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition', user.role === 'student' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600')}
            >
              <UserRound className="size-4" />수강생
            </button>
            <button
              type="button"
              onClick={() => onSwitchRole?.('instructor')}
              className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition', user.role === 'instructor' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600')}
            >
              <BookOpen className="size-4" />강의자
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
