import { Plus, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import FeedbackBar from '../components/room/FeedbackBar'
import QuestionThread from '../components/room/QuestionThread'
import RoomHeader from '../components/room/RoomHeader'
import BrandLogo from '../components/BrandLogo'
import Sidebar from '../components/navigation/Sidebar'
import Button from '../components/ui/Button'
import ShareCourseModal from '../components/course/ShareCourseModal'
import { useCourseRoom } from '../hooks/useCourseRoom'
import { getCurrentUser, signInWithGoogle } from '../services/api'
import type { QuestionFilter } from '../types/room'
import type { User } from '../types/user'
import { cn } from '../utils/cn'

export default function CourseRoomPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { room, isLoading, error, actionError, participantCount, admissionStatus, reload, likeQuestion, voteFeedback, resetFeedback, resolveQuestion, editQuestion, editReply, deletePost } = useCourseRoom(courseId)
  const [user, setUser] = useState<User | null>(null)
  const [filter, setFilter] = useState<QuestionFilter>('unresolved')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)

  const highlightId = searchParams.get('highlight')
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null)
  const isInstructor = user?.role === 'instructor'

  useEffect(() => {
    void getCurrentUser().then(setUser)
  }, [])

  useEffect(() => {
    if (!highlightId || !room) return
    // highlight 대상은 최상위 글일 수도, 답글일 수도 있음 - 어느 쪽이든 그 답글이 속한
    // 최상위 글의 해결 여부를 기준으로 탭을 맞춰야 함(답글 자체엔 isResolved가 없음).
    const owner = room.questions.find((question) => question.id === highlightId || question.replies.some((reply) => reply.id === highlightId))
    if (owner) setFilter(owner.isResolved ? 'resolved' : 'unresolved')

    setActiveHighlightId(highlightId)
    const scrollTimer = window.setTimeout(() => {
      document.getElementById(`post-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    // 강조는 도착했다는 걸 잠깐 알려주는 용도라, 계속 남아있지 않고 잠시 후 은은하게 사라짐.
    const fadeTimer = window.setTimeout(() => setActiveHighlightId(null), 2600)
    return () => {
      window.clearTimeout(scrollTimer)
      window.clearTimeout(fadeTimer)
    }
  }, [highlightId, room])

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
            <Button variant="secondary" onClick={() => navigate(user ? '/courses' : '/')}>홈으로</Button>
          </div>
        </div>
      </div>
    )
  }

  if (admissionStatus === 'pending') {
    return <div className="grid min-h-screen place-items-center"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" aria-label="입장 가능 여부 확인 중" /></div>
  }

  if (admissionStatus === 'full') {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p className="font-bold text-slate-700">정원이 다 찼습니다.</p>
          <p className="mt-1 text-sm text-slate-400">최대 참여 인원을 초과해 입장할 수 없습니다.</p>
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => navigate(user ? '/courses' : '/')}>홈으로</Button>
          </div>
        </div>
      </div>
    )
  }

  const unresolvedCount = room.questions.filter((question) => !question.isResolved).length
  const resolvedCount = room.questions.length - unresolvedCount
  const visibleQuestions = room.questions.filter((question) => (filter === 'unresolved' ? !question.isResolved : question.isResolved))
  const sortedFeedbackOptions = [...room.feedbackOptions].sort((a, b) => (b.likeCount - b.dislikeCount) - (a.likeCount - a.dislikeCount))

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {user && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-100 lg:block">
          <Sidebar user={user} showRoleSwitch={false} />
        </aside>
      )}

      <header className="border-b border-slate-100 bg-white px-4 py-4 sm:px-6 lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <BrandLogo compact to={user ? '/courses' : undefined} />
          {user ? (
            <span className="grid size-9 place-items-center rounded-full bg-violet-600 text-sm font-extrabold text-white">{user.avatarText}</span>
          ) : (
            <Button variant="secondary" onClick={() => void signInWithGoogle()}>Google 로그인</Button>
          )}
        </div>
      </header>

      <div className={cn('px-4 pt-6 sm:px-6', user && 'lg:pl-72')}>
        <div className="mx-auto max-w-6xl">
          <RoomHeader
            title={room.title}
            date={room.date}
            lecturerName={room.lecturerName}
            participantCount={participantCount}
            questionCount={room.questions.length}
            onShare={isInstructor ? () => setIsShareOpen(true) : undefined}
          />

          <div className="mt-5">
            <FeedbackBar
              options={sortedFeedbackOptions}
              canVote={!isInstructor}
              onVote={(key, vote) => void voteFeedback(key, vote)}
              onAcknowledge={isInstructor ? (key) => void resetFeedback(key) : undefined}
            />
            {actionError && <p className="mt-2 text-sm font-medium text-rose-500">{actionError}</p>}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="inline-flex rounded-2xl bg-slate-100 p-1">
              <button type="button" onClick={() => setFilter('unresolved')} className={cn('rounded-xl px-4 py-2 text-sm font-bold transition', filter === 'unresolved' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600')}>
                미해결 · {unresolvedCount}
              </button>
              <button type="button" onClick={() => setFilter('resolved')} className={cn('rounded-xl px-4 py-2 text-sm font-bold transition', filter === 'resolved' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600')}>
                해결됨 · {resolvedCount}
              </button>
            </div>
            {!isInstructor && (
              <Button onClick={() => navigate(`/room/${courseId}/write`)} className="rounded-full"><Plus className="size-5" />글 작성하기</Button>
            )}
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
                canResolve={isInstructor}
                highlightId={activeHighlightId}
                onLike={likeQuestion}
                onResolve={resolveQuestion}
                onReply={(questionId, label) => navigate(`/room/${courseId}/write`, { state: { target: { questionId, label } } })}
                onEdit={editQuestion}
                onEditReply={editReply}
                onDelete={setDeleteTargetId}
              />
            ))}
          </div>
        </div>
      </div>

      {deleteTargetId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => setDeleteTargetId(null)}>
          <section role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-extrabold text-slate-900">삭제하시겠습니까?</h2>
            <p className="mt-2 text-sm text-slate-500">삭제하면 되돌릴 수 없습니다. 답글이 달려 있다면 함께 삭제됩니다.</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteTargetId(null)} disabled={isDeleting}>취소</Button>
              <Button
                onClick={async () => {
                  setIsDeleting(true)
                  try {
                    await deletePost(deleteTargetId)
                    setDeleteTargetId(null)
                  } finally {
                    setIsDeleting(false)
                  }
                }}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-700"
              >
                {isDeleting ? '삭제 중' : '삭제'}
              </Button>
            </div>
          </section>
        </div>
      )}

      <ShareCourseModal
        isOpen={isShareOpen}
        course={{
          id: room.id,
          title: room.title,
          questionCount: room.questions.length,
          color: 'purple',
          ownership: 'owned',
        }}
        onClose={() => setIsShareOpen(false)}
      />
    </div>
  )
}
