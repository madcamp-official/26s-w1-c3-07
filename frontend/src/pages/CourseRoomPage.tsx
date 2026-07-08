import { LogOut, Menu, Plus, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import FeedbackBar from '../components/room/FeedbackBar'
import QuestionThread from '../components/room/QuestionThread'
import RoomHeader from '../components/room/RoomHeader'
import BrandLogo from '../components/BrandLogo'
import CourseJoinForm from '../components/course/CourseJoinForm'
import Sidebar from '../components/navigation/Sidebar'
import Button from '../components/ui/Button'
import LogoutConfirmModal from '../components/ui/LogoutConfirmModal'
import ShareCourseModal from '../components/course/ShareCourseModal'
import { useCourseRoom } from '../hooks/useCourseRoom'
import { getCurrentUser, signInWithGoogle, signOut, switchUserRole } from '../services/api'
import type { QuestionFilter } from '../types/room'
import type { User } from '../types/user'
import { cn } from '../utils/cn'

export default function CourseRoomPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { room, isLoading, error, actionError, participantCount, admissionStatus, reload, likeQuestion, voteFeedback, resetFeedback, resolveQuestion, editQuestion, editReply, deletePost, toggleRegistration } = useCourseRoom(courseId)
  const [user, setUser] = useState<User | null>(null)
  const [filter, setFilter] = useState<QuestionFilter>('unresolved')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  // 로그아웃해도 홈으로 튕기지 않고 이 강의 페이지에 그대로 머무름(강의실은 비회원도 열람 가능).
  // user만 null로 바꾸면 헤더가 비회원 상태로 갱신됨. (로그인도 OAuth redirectTo가 현재 URL이라 그대로 복귀)
  const handleLogout = async () => {
    setIsLoggingOut(true)
    setLogoutError(null)
    try {
      await signOut()
      setUser(null)
      setIsLogoutConfirmOpen(false)
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : '로그아웃하지 못했습니다.')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const highlightId = searchParams.get('highlight')
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null)
  const isInstructor = user?.role === 'instructor'

  useEffect(() => {
    void getCurrentUser().then(setUser)
  }, [])

  // 강의자 모드인데 본인이 만들지 않은 강의실에 들어온 경우 자동으로 수강생 모드로 전환.
  // room.isOwnedByMe가 확정된 뒤에만 판단하고, 전환 후엔 user.role이 'student'가 되어
  // 이 조건이 다시 참이 되지 않으므로 반복 호출되지 않음.
  useEffect(() => {
    if (!user || user.role !== 'instructor' || !room) return
    if (room.isOwnedByMe) return
    void switchUserRole('student').then(setUser)
  }, [user, room])

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
  // 강의자 모드는 피드백 바에 체크 버튼이 하나 더 붙어 한 줄에 맞추려면 넓어야 해서 1050px 유지.
  // 수강생 모드는 그 버튼이 없어 원래(더 좁은) 폭으로 줄일 수 있음.
  const contentMaxWidth = isInstructor ? 'max-w-[1050px]' : 'max-w-4xl'

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {user && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-100 lg:block">
          <Sidebar user={user} showRoleSwitch={false} />
        </aside>
      )}

      {/* 좁은 화면(모바일)에서 햄버거로 여는 사이드바 드로어 - 내 강의/설정 등으로 이동. DashboardLayout과 동일 패턴 */}
      {user && isMenuOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden" onMouseDown={() => setIsMenuOpen(false)}>
          <aside className="h-full w-72 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="absolute left-60 top-4 z-10">
              <button type="button" onClick={() => setIsMenuOpen(false)} className="rounded-full bg-white p-2 text-slate-500 shadow" aria-label="메뉴 닫기"><X className="size-5" /></button>
            </div>
            <Sidebar user={user} onNavigate={() => setIsMenuOpen(false)} showRoleSwitch={false} />
          </aside>
        </div>
      )}

      {/*
        강의 페이지 상단 헤더 - 글 작성하기 페이지처럼 아래 콘텐츠 영역과 분리된 별도의 흰색 바.
        - 왼쪽: 비회원은 홈('/') 링크 로고. 회원은 데스크톱엔 사이드바가 있어 로고 생략, 모바일에서만 로고(내 강의로).
        - 가운데: 수강생 모드 회원만 강의 코드 입력창(다른 강의 바로 입장). 강의자 모드는 비움.
        - 오른쪽: 비회원=로그인, 회원 데스크톱=로그아웃, 회원 모바일=햄버거(사이드바 드로어).
      */}
      <header className={cn('border-b border-slate-100 bg-white px-4 py-4 sm:px-6', user && 'lg:pl-72')}>
        <div
          className={cn(
            'mx-auto flex flex-wrap items-center gap-x-3 gap-y-2',
            contentMaxWidth,
            // 코드 입력창이 있을 때만 3열 그리드(왼쪽 1fr / 가운데 최대 29.87rem / 오른쪽 1fr)로
            // 배치해 가운데를 정중앙에 두면서도 max-w까지 실제로 늘어나게 함. flex-1 3분할로는
            // 양옆과 똑같이 나눠 가지느라 가운데가 max-w까지 못 늘어나서 그리드로 바꿈.
            !isInstructor && 'sm:grid sm:grid-cols-[1fr_minmax(0,29.87rem)_1fr] sm:flex-nowrap',
          )}
        >
          {/* 왼쪽: 비회원은 홈 로고, 회원은 모바일에서만 로고(데스크톱은 사이드바에 있음) */}
          <div className="order-1 flex items-center sm:order-none">
            {user ? (
              <div className="shrink-0 lg:hidden"><BrandLogo compact to="/courses" /></div>
            ) : (
              <div className="shrink-0"><BrandLogo compact to="/" /></div>
            )}
          </div>

          {/* 가운데: 강의 코드 입력창. 강의자 모드는 자기 강의 관리 화면이라 다른 강의로 바로 입장하는 기능이 필요 없어 숨김. 좁은 화면에선 아래 줄로 넘어가 전체 폭 사용 */}
          {!isInstructor && (
            <div className="order-3 w-full sm:order-none sm:justify-self-center"><CourseJoinForm compact /></div>
          )}

          <div
            className={cn(
              'order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-none',
              // 그리드(수강생 모드)일 때만 justify-self-end로 위치를 잡고, 그때만 기본 ml-auto를
              // 꺼야 함(안 그러면 justify-self가 무시되는 강의자 모드의 일반 flex 레이아웃에서
              // sm:ml-0가 ml-auto를 덮어써 로그아웃 버튼이 오른쪽 끝까지 안 밀리는 버그가 있었음).
              !isInstructor && 'sm:ml-0 sm:justify-self-end',
            )}
          >
            {user ? (
              <>
                <div className="hidden lg:block"><Button variant="secondary" onClick={() => setIsLogoutConfirmOpen(true)}><LogOut className="size-4" />로그아웃</Button></div>
                <button type="button" onClick={() => setIsMenuOpen(true)} className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden" aria-label="메뉴 열기"><Menu /></button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => void signInWithGoogle()}>Google 로그인</Button>
            )}
          </div>
        </div>
      </header>

      <div className={cn('px-4 pt-6 sm:px-6', user && 'lg:pl-72')}>
        <div className={cn('mx-auto', contentMaxWidth)}>
          <RoomHeader
            title={room.title}
            date={room.date}
            lecturerName={room.lecturerName}
            participantCount={participantCount}
            questionCount={room.questions.length}
            onShare={isInstructor ? () => setIsShareOpen(true) : undefined}
            isFavorited={room.isFavorited}
            isTogglingFavorite={isTogglingFavorite}
            onToggleFavorite={
              user && !isInstructor
                ? async () => {
                    setIsTogglingFavorite(true)
                    try {
                      await toggleRegistration()
                    } finally {
                      setIsTogglingFavorite(false)
                    }
                  }
                : undefined
            }
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

      <LogoutConfirmModal
        isOpen={isLogoutConfirmOpen}
        isProcessing={isLoggingOut}
        error={logoutError}
        onConfirm={() => void handleLogout()}
        onClose={() => setIsLogoutConfirmOpen(false)}
      />
    </div>
  )
}
