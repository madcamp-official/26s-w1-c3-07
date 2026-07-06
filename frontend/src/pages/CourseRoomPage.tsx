import { Plus, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FeedbackBar from '../components/room/FeedbackBar'
import QuestionThread from '../components/room/QuestionThread'
import RoomHeader from '../components/room/RoomHeader'
import BrandLogo from '../components/BrandLogo'
import Sidebar from '../components/navigation/Sidebar'
import Button from '../components/ui/Button'
import { useCourseRoom } from '../hooks/useCourseRoom'
import { getCurrentUser, switchUserRole } from '../services/api'
import type { QuestionFilter } from '../types/room'
import type { User, UserRole } from '../types/user'
import { cn } from '../utils/cn'

export default function CourseRoomPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const { room, isLoading, error, reload, likeQuestion, voteFeedback } = useCourseRoom(courseId)
  const [user, setUser] = useState<User | null>(null)
  const [filter, setFilter] = useState<QuestionFilter>('unresolved')

  useEffect(() => {
    void getCurrentUser().then(setUser)
  }, [])

  const handleSwitchRole = (role: UserRole) => {
    void switchUserRole(role).then(setUser)
  }

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" aria-label="강의실 불러오는 중" /></div>
  }

  if (error || !room) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p className="font-bold text-slate-700">{error ?? '강의실을 찾을 수 없습니다.'}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => void reload()}><RotateCcw className="size-4" />다시 시도</Button>
            <Button variant="secondary" onClick={() => navigate(user ? '/student/courses' : '/')}>홈으로</Button>
          </div>
        </div>
      </div>
    )
  }

  const unresolvedCount = room.questions.filter((question) => !question.isResolved).length
  const resolvedCount = room.questions.length - unresolvedCount
  const visibleQuestions = room.questions.filter((question) => (filter === 'unresolved' ? !question.isResolved : question.isResolved))

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {user && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-100 lg:block">
          <Sidebar user={user} onSwitchRole={handleSwitchRole} />
        </aside>
      )}

      <header className="border-b border-slate-100 bg-white px-4 py-4 sm:px-6 lg:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <BrandLogo compact to={user ? '/student/courses' : undefined} />
          {user ? (
            <span className="grid size-9 place-items-center rounded-full bg-violet-600 text-sm font-extrabold text-white">{user.avatarText}</span>
          ) : (
            <Button variant="secondary" onClick={() => navigate('/')}>Google 로그인</Button>
          )}
        </div>
      </header>

      <div className={cn('mx-auto max-w-4xl px-4 pt-6 sm:px-6', user && 'lg:ml-72')}>
        <RoomHeader
          title={room.title}
          date={room.date}
          lecturerName={room.lecturerName}
          participantCount={room.participantCount}
          questionCount={room.questions.length}
        />

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="inline-flex rounded-2xl bg-slate-100 p-1">
            <button type="button" onClick={() => setFilter('unresolved')} className={cn('rounded-xl px-4 py-2 text-sm font-bold transition', filter === 'unresolved' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600')}>
              미해결 · {unresolvedCount}
            </button>
            <button type="button" onClick={() => setFilter('resolved')} className={cn('rounded-xl px-4 py-2 text-sm font-bold transition', filter === 'resolved' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600')}>
              해결됨 · {resolvedCount}
            </button>
          </div>
          <Button onClick={() => navigate(`/room/${courseId}/write`)} className="rounded-full"><Plus className="size-5" />글 작성하기</Button>
        </div>

        <div className="mt-5 space-y-4">
          {visibleQuestions.length === 0 && (
            <p className="rounded-3xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm font-medium text-slate-400">
              {filter === 'unresolved' ? '아직 미해결 질문이 없습니다.' : '해결된 질문이 없습니다.'}
            </p>
          )}
          {visibleQuestions.map((question) => (
            <QuestionThread
              key={question.id}
              question={question}
              onLike={likeQuestion}
              onReply={(questionId, label) => navigate(`/room/${courseId}/write`, { state: { target: { questionId, label } } })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
