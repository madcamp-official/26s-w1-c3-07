import { BookOpen, Hash, Search, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import Button from '../components/ui/Button'
import { getCurrentUser, joinCourse, signInWithGoogle } from '../services/api'

export default function LandingPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)

  useEffect(() => {
    void getCurrentUser().then((user) => {
      if (user) navigate('/student/courses', { replace: true })
    })
  }, [navigate])

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const course = await joinCourse(code)
      navigate(`/room/${course.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '강의를 찾지 못했습니다.')
    }
  }

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true)
    try {
      await signInWithGoogle()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google 로그인에 실패했습니다.')
      setIsSigningIn(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-white to-violet-50 px-4 py-10 text-slate-900">
      <section className="w-full max-w-xl rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl shadow-slate-200/60 sm:p-10">
        <div className="flex flex-col items-center text-center">
          <BrandLogo />
          <p className="mt-4 text-lg text-slate-400">AI 기반 익명 강의 질문 플랫폼</p>
        </div>

        <form onSubmit={submitCode} className="mt-8 rounded-3xl border border-violet-100 bg-violet-50 p-5">
          <label htmlFor="lecture-code" className="flex items-center gap-2 font-extrabold text-violet-700"><Hash className="size-5" />강의로 바로 입장</label>
          <div className="mt-4 flex gap-3">
            <input id="lecture-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="코드 입력 (예: 1456)" className="min-w-0 flex-1 rounded-2xl border-2 border-violet-200 bg-white px-4 py-3.5 outline-none placeholder:text-slate-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
            <Button type="submit" aria-label="강의 검색" className="px-4"><Search className="size-5" /></Button>
          </div>
          <p className="mt-1 min-h-5 text-xs font-medium text-violet-600" aria-live="polite">{message}</p>
        </form>

        <Button onClick={() => void handleGoogleSignIn()} disabled={isSigningIn} variant="secondary" className="mt-6 w-full py-4 text-base">
          <span className="text-lg font-black text-blue-500">G</span>{isSigningIn ? '이동 중...' : 'Google로 계속하기'}
        </Button>

        <div className="mt-10 rounded-3xl border border-violet-100 bg-violet-50 p-5">
          <p className="font-bold text-violet-700">로그인 후 역할 전환 가능</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 font-bold text-slate-700"><UserRound className="size-4" />수강생</span>
            <span className="text-slate-300">↔</span>
            <span className="flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 font-bold text-white"><BookOpen className="size-4" />강의자</span>
          </div>
          <p className="mt-3 text-sm text-violet-500">게스트는 수강생으로만 참여할 수 있습니다.</p>
        </div>
      </section>
      <p className="text-center text-sm text-slate-400">계속 진행하면 <a href="#terms" className="font-bold text-violet-600 hover:underline">이용약관</a>에 동의하는 것으로 간주됩니다.</p>
    </main>
  )
}
