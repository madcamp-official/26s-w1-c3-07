# Supabase 연동 가이드 (프론트엔드용)

> 프론트엔드에서 Supabase에 어떻게 연결하고, URL/API 키가 뭔지, 실제로 어떤 코드를 쓰면 되는지 정리한 문서입니다.

## 목차

- [1. Supabase URL / API 키가 뭔가요?](#1-supabase-url--api-키가-뭔가요)
- [2. 이 프로젝트의 실제 값은 어디서 얻나요?](#2-이-프로젝트의-실제-값은-어디서-얻나요)
- [3. supabase-js 클라이언트 설정](#3-supabase-js-클라이언트-설정)
- [4. `.env` / `.env.example` 사용법](#4-env--envexample-사용법)
- [5. 실제로 쓸 코드 패턴](#5-실제로-쓸-코드-패턴)
- [6. 비회원 인증: `guest_token` + `x-guest-token` 헤더](#6-비회원-인증-guest_token--x-guest-token-헤더)
- [7. 강의자/수강생 모드 색 구분: `posts.created_mode`](#7-강의자수강생-모드-색-구분-postscreated_mode)
- [8. 테스트용 더미 데이터](#8-테스트용-더미-데이터)

## 1. Supabase URL / API 키가 뭔가요?

- **URL**: "우리 Supabase 프로젝트가 어디 있는지" 가리키는 주소예요. `https://<project-ref>.supabase.co` 형태.
- **anon(publishable) key**: "이 요청을 보내는 게 로그인 안 한 익명 사용자다"라고 신원을 밝히는 값이에요.

**이 두 개는 비밀번호가 아니에요.** 프론트엔드 코드에 그대로 들어가고, 브라우저 개발자도구에서 누구나 볼 수 있어요. 그래도 안전한 이유는, 실제 "누가 뭘 할 수 있는지"는 이 키가 아니라 **RLS(Row Level Security) 정책**이 결정하기 때문이에요 (자세한 건 [DB_DESIGN.md의 RLS 정책 섹션](./DB_DESIGN.md#rls-정책) 참고).

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

### 회원 관리

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

**회원 탈퇴**: `delete_own_account` RPC를 호출하면 본인 `auth.users` 행이 삭제돼요(관련 `profiles` 등도 cascade로 같이 정리됨, [README API 문서](./README.md#api-문서) 참고). 성공하면 세션도 로그아웃 처리해줘야 해요.

```js
const handleWithdraw = async () => {
  if (!window.confirm('정말로 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return

  const { error } = await supabase.rpc('delete_own_account')
  if (error) {
    alert('탈퇴 실패: ' + error.message)
    return
  }
  await supabase.auth.signOut()
}
```

### 테이블 조회

**테이블 조회 예시**:
```js
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', session.user.id)
  .single()
```

**⚠️ 중요**: `posts`/`post_likes`/`lecture_feedback_votes` 테이블은 `anon`/`authenticated`에게 전체 SELECT 권한이 없어요(`posts`는 아예 회수, 나머지 둘은 본인 투표 행만 조회 가능). 그래서 조회는 아래 뷰로 하세요:

- **게시글 조회**: `posts` 대신 **`posts_public`** 뷰. `posts` 테이블엔 `guest_token`이라는 민감한 컬럼이 있어서 그대로 노출하면 남의 글을 수정/삭제당할 수 있고, `author_id`도 익명 여부와 무관하게 노출되면 안 되기 때문이에요. `posts_public`은 `guest_token`을 완전히 빼고, `author_id`도 숨긴 뒤 익명이 아닌 글만 작성자 이름(`author_display_name`)을 보여줘요.
- **좋아요 개수 조회**: `post_likes` 대신 **`post_likes_counts`** 뷰(`post_id`별 `like_count`).
- **실시간 피드백 좋아요/싫어요 개수 조회**: `lecture_feedback_votes` 대신 **`lecture_feedback_votes_counts`** 뷰(`lecture_id`, `feedback_type`별 `like_count`/`dislike_count`).

세 뷰 다 회원/비회원을 특정할 수 있는 값(`guest_token`, `author_id`, `voter_key`)을 빼고 공개하는 용도예요 (자세한 이유는 [DB_DESIGN.md](./DB_DESIGN.md) 참고). "내가 이미 좋아요/피드백을 눌렀는지"는 이 카운트 뷰가 아니라 `post_likes`/`lecture_feedback_votes` 테이블에 본인 `voter_key`로 직접 조회하면 돼요(RLS가 본인 행만 보여주도록 허용되어 있음).

```js
const { data } = await supabase
  .from('posts_public')
  .select('*')
  .eq('lecture_id', lectureId)

const { data: likeCounts } = await supabase
  .from('post_likes_counts')
  .select('*')
  .eq('post_id', postId)
```

## 6. 비회원 인증: `guest_token` + `x-guest-token` 헤더

로그인 안 한 수강생(비회원)도 질문을 남길 수 있어야 하는데, 그 사람이 "본인 글"을 나중에 수정/삭제하려면 신원 확인이 필요해요. 그래서 쓰는 게 `guest_token`이에요.

- 브라우저 **`localStorage`**에 최초 1회 랜덤 값(UUID)을 생성해서 저장하고, 그 브라우저에서는 계속 재사용
- `posts.guest_token`, `post_likes`/`lecture_feedback_votes`의 `voter_key`, Presence(접속자 수 집계) 키로 전부 동일하게 재사용
- 서버(Supabase RLS)는 이 값을 **`x-guest-token`이라는 커스텀 HTTP 헤더**로 보내주면, RLS 정책이 그 헤더 값과 DB에 저장된 `guest_token`을 대조해서 "본인 글이 맞는지" 확인

**⚠️ 아직 아무 데도 구현 안 되어 있어요** — `guest_token` 생성/저장 로직도, 헤더를 실어 보내는 코드도 지금 코드베이스 어디에도 없습니다. 앞으로 만들어야 할 부분이에요 ([TODO.md 프론트엔드 > guest_token 관련](./TODO.md#guest_token-관련-1) 참고).

**구현 방식: 요청마다 체이닝으로 헤더 설정**

```js
await supabase
  .from('posts_public')
  .select('*')
  .setHeader('x-guest-token', guestToken)
```

supabase 클라이언트는 앱 시작할 때 딱 한 번만 만들고(`supabaseClient.js`), 실제 요청을 보내는 시점에 `localStorage`에서 최신 `guestToken`을 읽어서 `.setHeader()`로 그때그때 붙이는 방식이에요.

**왜 이 방식인지**: `createClient(...)` 옵션(`global.headers`)으로 헤더를 고정하는 방법도 있지만, 그건 클라이언트를 만드는 시점에 값이 한 번 박혀버려요. `guest_token`은 앱이 로드된 *이후에* `localStorage`에서 읽히는 값이라 클라이언트 생성 시점엔 아직 없을 수 있고, 로그인 여부에 따라 이 헤더가 필요 없는 요청도 있어서(회원은 `author_id`로 처리) 요청마다 동적으로 판단해야 해요. 그래서 매 요청 시점에 값을 읽어 붙이는 `.setHeader()` 방식으로 가요.

## 7. 강의자/수강생 모드 색 구분: `posts.created_mode`

같은 계정이라도 강의자 모드로 쓴 글인지 수강생 모드로 쓴 글인지에 따라 화면에서 색을 다르게 표시해야 해요 (강의를 만든 계정이 수강생 모드로 자기 강의에 들어와서 글을 쓰는 경우도 있으므로, `author_id`가 강의 제작자와 같은지만으론 구분이 안 됨). 그래서 헤더가 아니라 **글 작성 시 `posts.created_mode` 컬럼에 값을 직접 넣는 방식**으로 처리해요.

- 게시글/답글 INSERT 시 `created_mode` 컬럼에 `'lecturer'` 또는 `'student'` 값을 같이 보내야 해요.
  ```js
  await supabase
    .from('posts')
    .insert({ ...기타컬럼, created_mode: currentMode }) // 'lecturer' | 'student'
  ```
- **안 보내면 DB 기본값(`'student'`)이 적용**돼요.
- `created_mode = 'lecturer'`로 보내려면 실제로 그 강의를 만든 계정이어야만 통과돼요(RLS가 `auth.uid()`로 검증). 남의 강의에서 `created_mode: 'lecturer'`를 보내면 INSERT 자체가 거부됩니다. 자세한 제약 내용은 [DB_DESIGN.md](./DB_DESIGN.md) 참고.

## 8. 테스트용 더미 데이터

`backend/supabase/seed.sql`에 실제 스키마에 맞춘 더미 데이터가 원격 DB에 반영되어 있어요(강의 폴더/강의, 질문/답글, 좋아요, 실시간 피드백 등). 계정별로 어떤 강의/폴더가 어떻게 보이는지, 강의 입장 코드는 [`DUMMY_DATA.md`](./DUMMY_DATA.md) 참고하세요.
