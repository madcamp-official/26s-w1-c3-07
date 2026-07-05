import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [session])

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) alert('로그인 실패: ' + error.message)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const handleWithdraw = async () => {
    if (!window.confirm('정말로 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return

    const { error } = await supabase.rpc('delete_own_account')
    if (error) {
      alert('탈퇴 실패: ' + error.message)
      return
    }
    await supabase.auth.signOut()
  }

  return (
    <div className="page">
      <div className="card">
        <div className="logo-badge">Q</div>
        <h1>Qroom</h1>
        <p className="tagline">AI 기반 익명 강의 질문 플랫폼</p>

        {!session ? (
          <>
            <form
              className="code-form"
              onSubmit={(e) => {
                e.preventDefault()
                alert(`강의 코드 "${code}" 입장 기능은 아직 미구현입니다.`)
              }}
            >
              <input
                type="text"
                placeholder="코드 입력 (예: 1436)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={4}
              />
              <button type="submit" aria-label="입장">
                →
              </button>
            </form>

            <button className="google-btn" onClick={handleGoogleLogin}>
              <span className="g-icon">G</span> Google로 계속하기
            </button>

            <p className="hint">로그인 후 역할 전환 가능</p>
          </>
        ) : (
          <div className="logged-in">
            <p className="hint">로그인됨</p>
            <div className="profile-box">
              <div>
                <strong>{profile?.display_name ?? session.user.email}</strong>
              </div>
              <div className="mode-badge">
                모드: {profile?.last_mode ?? 'student'}
              </div>
              <div className="uid">uid: {session.user.id}</div>
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              로그아웃
            </button>
            <button className="withdraw-btn" onClick={handleWithdraw}>
              회원 탈퇴
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
