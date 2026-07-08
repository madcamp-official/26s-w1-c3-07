import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import PostComposer from '../components/room/PostComposer'
import RoomHeader from '../components/room/RoomHeader'
import Button from '../components/ui/Button'
import { useCourseRoom } from '../hooks/useCourseRoom'
import { getCurrentUser, signInWithGoogle } from '../services/api'
import type { ComposerTarget } from '../types/room'
import type { User } from '../types/user'

interface WriteLocationState {
  target?: ComposerTarget
}

export default function PostWritePage() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { room, isLoading, error, reload, submitQuestion, submitReply, submitDraftPost } = useCourseRoom(courseId)
  const [user, setUser] = useState<User | null>(null)

  const target = (location.state as WriteLocationState | null)?.target ?? null
  const isInstructor = user?.role === 'instructor'

  useEffect(() => {
    void getCurrentUser().then(setUser)
  }, [])

  useEffect(() => {
    if (isInstructor && !target && courseId) navigate(`/room/${courseId}`, { replace: true })
  }, [isInstructor, target, courseId, navigate])

  if (!courseId) return null

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="border-b border-slate-100 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <BrandLogo compact to={user ? '/student/courses' : undefined} />
          {user ? (
            <span className="grid size-9 place-items-center rounded-full bg-violet-600 text-sm font-extrabold text-white">{user.avatarText}</span>
          ) : (
            <Button variant="secondary" onClick={() => void signInWithGoogle()}>Google 로그인</Button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
        {isLoading && (
          <div className="grid place-items-center py-16"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" aria-label="강의실 불러오는 중" /></div>
        )}

        {!isLoading && (error || !room) && (
          <div className="grid place-items-center px-4 py-16 text-center">
            <div>
              <p className="font-bold text-slate-700">{error ?? '강의실을 찾을 수 없습니다.'}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => void reload()}><RotateCcw className="size-4" />다시 시도</Button>
                <Button variant="secondary" onClick={() => navigate(user ? '/student/courses' : '/')}>홈으로</Button>
              </div>
            </div>
          </div>
        )}

        {!isLoading && room && (
          <>
            <RoomHeader
              title={room.title}
              date={room.date}
              lecturerName={room.lecturerName}
              participantCount={room.participantCount}
              questionCount={room.questions.length}
            />

            <div className="mt-5">
              <PostComposer
                target={target}
                isLoggedIn={Boolean(user)}
                isInstructor={isInstructor}
                onCancel={() => navigate(`/room/${courseId}`)}
                onSubmit={async (submission) => {
                  const outcome = target ? await submitReply(target.questionId, submission) : await submitQuestion(submission)
                  if (outcome.result === 'created') navigate(`/room/${courseId}`)
                  return outcome
                }}
                onSubmitDraft={async (draftId, submission) => {
                  await submitDraftPost(draftId, submission, target?.questionId ?? null)
                  navigate(`/room/${courseId}`)
                }}
                onViewSimilar={(similarId) => navigate(`/room/${courseId}?highlight=${similarId}`)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
