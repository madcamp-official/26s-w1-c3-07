# Supabase 연동 가이드 (프론트엔드용)

> 프론트엔드에서 Supabase에 어떻게 연결하고, URL/API 키가 뭔지, 실제로 어떤 코드를 쓰면 되는지 정리한 문서입니다.

## 목차

- [1. Supabase URL / API 키가 뭔가요?](#1-supabase-url--api-키가-뭔가요)
- [2. 이 프로젝트의 실제 값은 어디서 얻나요?](#2-이-프로젝트의-실제-값은-어디서-얻나요)
- [3. supabase-js 클라이언트 설정](#3-supabase-js-클라이언트-설정)
- [4. `.env` / `.env.example` 사용법](#4-env--envexample-사용법)
- [5. 실제로 쓸 코드 패턴](#5-실제로-쓸-코드-패턴)
- [6. 비회원 인증: `guest_token` + `x-guest-token` 헤더](#6-비회원-인증-guest_token--x-guest-token-헤더)
- [7. 아직 안 된 것 / 앞으로 할 일](#7-아직-안-된-것--앞으로-할-일)

## 1. Supabase URL / API 키가 뭔가요?

- **URL**: "우리 Supabase 프로젝트가 어디 있는지" 가리키는 주소예요. `https://<project-ref>.supabase.co` 형태.
- **anon(publishable) key**: "이 요청을 보내는 게 로그인 안 한 익명 사용자다"라고 신원을 밝히는 값이에요.

**이 두 개는 비밀번호가 아니에요.** 프론트엔드 코드에 그대로 들어가고, 브라우저 개발자도구에서 누구나 볼 수 있어요. 그래도 안전한 이유는, 실제 "누가 뭘 할 수 있는지"는 이 키가 아니라 **RLS(Row Level Security) 정책**이 결정하기 때문이에요 (자세한 건 [DB_SCHEMA.md의 RLS 정책 섹션](./DB_SCHEMA.md#rls-정책) 참고).

**절대 헷갈리면 안 되는 것**: `SUPABASE_ACCESS_TOKEN`이라는 값도 있는데, 이건 완전히 다른 거예요 — 백엔드 전용 비밀 값(계정 전체 권한)이고 `backend/.env`에만 있어요. 프론트엔드 코드에는 **절대 들어가면 안 됩니다.**

## 2. 이 프로젝트의 실제 값은 어디서 얻나요?

두 가지 방법:

1. **Supabase Dashboard**에서 직접 확인: 프로젝트(`zilvdbwoieplhrpjqnlo`) → **Project Settings → API** → "Project URL" / "anon(publishable) key"
2. **이미 검증된 값이 저장소 루트에 있음**: [`.env.example`](./.env.example) 파일에 실제 값이 그대로 들어있어요. 그대로 복사해서 쓰면 됩니다 (아래 4번 참고).

## 3. supabase-js 클라이언트 설정

```bash
npm install @supabase/supabase-js
```

클라이언트 만드는 코드 (실제로 동작 검증된 패턴, `backend/test-frontend/src/lib/supabaseClient.js` 그대로):

```js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

**주의**: Vite 프로젝트에서는 환경변수 이름이 반드시 **`VITE_`로 시작**해야 `import.meta.env`로 접근할 수 있어요. `SUPABASE_URL`처럼 접두사 없이 쓰면 값이 `undefined`가 됩니다.

## 4. `.env` / `.env.example` 사용법

- **`.env`**: 로컬 전용 파일, git에 안 올라감(`.gitignore` 처리됨). 여기에 실제 값을 넣고 로컬에서만 씀.
- **`.env.example`**: git에 커밋되는 템플릿 파일 (저장소 루트에 있음). **이 프로젝트에선 예외적으로 진짜 값을 그대로 넣어뒀어요** (anon key는 공개돼도 안전한 값이라서요 — 보통 다른 프로젝트에선 여기에 placeholder만 넣는 게 일반적이니, 이건 이 프로젝트만의 편의를 위한 선택이라고 이해하시면 돼요).

본인 프론트엔드 프로젝트 폴더에서, 저장소 루트의 `.env.example`을 복사해서 쓰면 됩니다:
```bash
cp ../.env.example .env   # 프론트엔드 프로젝트가 저장소 루트 바로 아래 폴더에 있다고 가정한 경로, 실제 위치에 맞게 조정
```

## 5. 실제로 쓸 코드 패턴

`backend/test-frontend/src/App.jsx`에서 실제로 동작 확인된 패턴들이에요.

**로그인 세션 확인 + 감지**:
```js
useEffect(() => {
  supabase.auth.getSession().then(({ data }) => setSession(data.session))

  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session)
  })

  return () => listener.subscription.unsubscribe()
}, [])
```

**Google 로그인 / 로그아웃**:
```js
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: window.location.origin },
})

await supabase.auth.signOut()
```

**테이블 조회 예시**:
```js
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', session.user.id)
  .single()
```

**⚠️ 중요**: 게시글 조회할 때는 `posts` 테이블이 아니라 **반드시 `posts_public` 뷰**를 조회하세요. `posts` 테이블엔 `guest_token`이라는 민감한 컬럼이 있어서, 그걸 그대로 노출하면 남의 글을 수정/삭제당할 수 있어요. `posts_public`은 그 컬럼만 뺀 안전한 뷰예요 (자세한 이유는 [DB_SCHEMA.md](./DB_SCHEMA.md) 참고).

```js
const { data } = await supabase
  .from('posts_public')
  .select('*')
  .eq('lecture_id', lectureId)
```

## 6. 비회원 인증: `guest_token` + `x-guest-token` 헤더

로그인 안 한 수강생(비회원)도 질문을 남길 수 있어야 하는데, 그 사람이 "본인 글"을 나중에 수정/삭제하려면 신원 확인이 필요해요. 그래서 쓰는 게 `guest_token`이에요.

- 브라우저 **`localStorage`**에 최초 1회 랜덤 값(UUID)을 생성해서 저장하고, 그 브라우저에서는 계속 재사용
- `posts.guest_token`, `post_likes`/`lecture_feedback_votes`의 `voter_key`, Presence(접속자 수 집계) 키로 전부 동일하게 재사용
- 서버(Supabase RLS)는 이 값을 **`x-guest-token`이라는 커스텀 HTTP 헤더**로 보내주면, RLS 정책이 그 헤더 값과 DB에 저장된 `guest_token`을 대조해서 "본인 글이 맞는지" 확인

**⚠️ 아직 아무 데도 구현 안 되어 있어요** — `guest_token` 생성/저장 로직도, 헤더를 실어 보내는 코드도 지금 코드베이스 어디에도 없습니다. 앞으로 만들어야 할 부분이에요 ([TODO.md #14, #15](./TODO.md#14-비회원-익명-식별자guest_token-생성-로직) 참고).

만들 때 쓸 수 있는 supabase-js API 두 가지 (실제 설치된 `@supabase/supabase-js` 소스에서 확인한 진짜 동작하는 방법):

**방법 1: 클라이언트 생성 시 고정 헤더** (guest_token이 안 바뀌는 경우에만 적합)
```js
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { 'x-guest-token': guestToken } },
})
```

**방법 2 (추천): 요청마다 체이닝으로 헤더 설정**
```js
await supabase
  .from('posts_public')
  .select('*')
  .setHeader('x-guest-token', guestToken)
```
`localStorage`에서 매번 최신 `guestToken`을 읽어서 요청 시점에 넣을 수 있어서 이 방식이 더 적합해요.

## 7. 아직 안 된 것 / 앞으로 할 일

진행 상황과 설계 고민은 [`TODO.md`](./TODO.md)에서 트래킹하고 있어요. 프론트엔드와 특히 관련된 항목:

- [#14 비회원 익명 식별자(`guest_token`) 생성 로직](./TODO.md#14-비회원-익명-식별자guest_token-생성-로직)
- [#15 `x-guest-token` 커스텀 헤더를 실제로 보내는 구현](./TODO.md#15-x-guest-token-커스텀-헤더를-실제로-보내는-구현)
- [#16 `posts_public` 뷰로 조회 대상 전환](./TODO.md#16-posts_public-뷰로-조회-대상-전환)
