# Supabase 연동 가이드 (프론트엔드용)

> 프론트엔드에서 Supabase에 어떻게 연결하고, URL/API 키가 무엇인지, 실제로 어떤 코드를 쓰면 되는지 정리한 문서입니다.

## 목차

- [1. Supabase URL / API 키란 무엇인가](#1-supabase-url--api-키란-무엇인가)
- [2. 이 프로젝트의 실제 값은 어디서 얻는가](#2-이-프로젝트의-실제-값은-어디서-얻는가)
- [3. supabase-js 클라이언트 설정](#3-supabase-js-클라이언트-설정)
- [4. `.env` / `.env.example` 사용법](#4-env--envexample-사용법)
- [5. 실제로 사용할 코드 패턴](#5-실제로-사용할-코드-패턴)
- [6. 트리 구조 데이터 조회 (내 강의 페이지 / 강의 페이지)](#6-트리-구조-데이터-조회-내-강의-페이지--강의-페이지)
- [7. 비회원 인증: `guest_token` + `x-guest-token` 헤더](#7-비회원-인증-guest_token--x-guest-token-헤더)
- [8. 강의자/수강생 모드 색 구분: `posts.created_mode`](#8-강의자수강생-모드-색-구분-postscreated_mode)
- [9. 테스트용 더미 데이터](#9-테스트용-더미-데이터)

## 1. Supabase URL / API 키란 무엇인가

- **URL**: 우리 Supabase 프로젝트가 있는 위치를 가리키는 주소예요. `https://<project-ref>.supabase.co` 형태입니다.
- **anon(publishable) key**: "이 요청이 우리 프로젝트/앱에서 온 게 맞다"를 나타내는 값이에요. supabase-js가 `apikey` 헤더로 **로그인 여부와 무관하게 모든 요청에 항상** 함께 실어 보냅니다. 로그인하면 `Authorization` 헤더에 사용자의 세션 토큰(JWT)이 추가로 실려서 `auth.uid()`가 그 사람으로 채워지지만, `apikey` 헤더의 anon key는 로그인 후에도 그대로 계속 보내야 해요 — "익명 사용자 전용" 값이 아닙니다.

**이 두 값은 비밀번호가 아닙니다.** 프론트엔드 코드에 그대로 들어가고, 브라우저 개발자도구에서 누구나 볼 수 있어요. 그래도 안전한 이유는, 실제로 "누가 뭘 할 수 있는지"는 이 키가 아니라 **RLS(Row Level Security) 정책**이 결정하기 때문입니다 (자세한 내용은 [DB_DESIGN.md의 RLS 정책 섹션](./DB_DESIGN.md#rls-정책) 참고).

**절대 헷갈리면 안 되는 값**: `SUPABASE_ACCESS_TOKEN`이라는 값도 있는데, 이건 완전히 다른 거예요 — 백엔드 전용 비밀 값(계정 전체 권한)이고 `backend/.env`에만 있습니다. 프론트엔드 코드에는 **절대 들어가면 안 됩니다.**

## 2. 이 프로젝트의 실제 값은 어디서 얻는가

두 가지 방법이 있어요.

1. **Supabase Dashboard**에서 직접 확인: 프로젝트(`zilvdbwoieplhrpjqnlo`) → **Project Settings → API** → "Project URL" / "anon(publishable) key"
2. **이미 검증된 값이 저장소 루트에 있음**: [`.env.example`](./.env.example) 파일에 실제 값이 그대로 들어있어요. 그대로 복사해서 쓰면 됩니다 (아래 4번 참고).

## 3. supabase-js 클라이언트 설정

```bash
npm install @supabase/supabase-js
```

클라이언트 만드는 코드예요 (실제로 동작 검증된 패턴이고, `backend/test-frontend/src/lib/supabaseClient.js`와 동일합니다).

```js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

**주의**: Vite 프로젝트에서는 환경변수 이름이 반드시 **`VITE_`로 시작**해야 `import.meta.env`로 접근할 수 있어요. `SUPABASE_URL`처럼 접두사 없이 쓰면 값이 `undefined`가 됩니다.

## 4. `.env` / `.env.example` 사용법

- **`.env`**: 로컬 전용 파일이고 git에 안 올라가요(`.gitignore` 처리됨). 여기에 실제 값을 넣고 로컬에서만 씁니다.
- **`.env.example`**: git에 커밋되는 템플릿 파일이에요(저장소 루트에 있음). **이 프로젝트에선 예외적으로 진짜 값을 그대로 넣어뒀습니다** (anon key는 공개돼도 안전한 값이라서요 — 보통 다른 프로젝트에선 여기에 placeholder만 넣는 게 일반적이니, 이건 이 프로젝트만의 편의를 위한 선택으로 이해하면 됩니다).

본인 프론트엔드 프로젝트 폴더에서, 저장소 루트의 `.env.example`을 복사해서 쓰세요.
```bash
cp ../.env.example .env   # 프론트엔드 프로젝트가 저장소 루트 바로 아래 폴더에 있다고 가정한 경로, 실제 위치에 맞게 조정
```

## 5. 실제로 사용할 코드 패턴

### 회원 관리

아래 코드는 `backend/test-frontend/src/App.jsx`에 그대로 있고, 실제로 동작 확인된 패턴들이에요.

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

**회원 탈퇴**: `delete_own_account` RPC를 호출하면 본인 `auth.users` 행이 삭제됩니다(관련 `profiles` 등도 cascade로 같이 정리됨, [README API 문서](./README.md#api-문서) 참고). 성공하면 세션도 로그아웃 처리해줘야 해요.

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

**테이블 조회 예시** (이것도 `App.jsx`에 그대로 있는, 동작 확인된 코드예요):
```js
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', session.user.id)
  .single()
```

**⚠️ 중요**: `posts`/`post_likes`/`lecture_feedback_votes` 테이블은 `anon`/`authenticated`에게 전체 SELECT 권한이 없습니다(`posts`는 아예 회수, 나머지 둘은 본인 투표 행만 조회 가능). 그래서 조회는 아래 뷰로 하세요. 아래 `posts_public`/`post_likes_counts` 예시 코드는 아직 `App.jsx`에 실제로 쓰인 적은 없고, DB 스키마/RLS 설계를 근거로 유도한 패턴이에요 — 실제로 붙여서 테스트해보고 문제 있으면 알려주세요.

- **게시글 조회**: `posts` 대신 **`posts_public`** 뷰를 씁니다. `posts` 테이블엔 `guest_token`이라는 민감한 컬럼이 있어서 그대로 노출하면 남의 글을 수정/삭제당할 수 있고, `author_id`도 익명 여부와 무관하게 노출되면 안 되기 때문이에요. `posts_public`은 `guest_token`을 완전히 빼고, `author_id`도 숨긴 뒤 익명이 아닌 글만 작성자 이름(`author_display_name`)을 보여줍니다.
- **좋아요 개수 조회**: `post_likes` 대신 **`post_likes_counts`** 뷰(`post_id`별 `like_count`).
- **실시간 피드백 좋아요/싫어요 개수 조회**: `lecture_feedback_votes` 대신 **`lecture_feedback_votes_counts`** 뷰(`lecture_id`, `feedback_type`별 `like_count`/`dislike_count`).

세 뷰 다 회원/비회원을 특정할 수 있는 값(`guest_token`, `author_id`, `voter_key`)을 빼고 공개하는 용도예요 (자세한 이유는 [DB_DESIGN.md](./DB_DESIGN.md) 참고). "내가 이미 좋아요/피드백을 눌렀는지"는 이 카운트 뷰가 아니라 `post_likes`/`lecture_feedback_votes` 테이블에 본인 `voter_key`로 직접 조회하면 됩니다(RLS가 본인 행만 보여주도록 허용되어 있음).

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

## 6. 트리 구조 데이터 조회 (내 강의 페이지 / 강의 페이지)

"내 강의"/"강의" 페이지에서 서버에 물어봐야 하는 건 크게 세 가지예요. (1) 강의 페이지에 접속했을 때 해당 `lecture_id`의 모든 `posts`, (2) 강의자 모드로 "내 강의"에 접속했을 때 내가 만든 모든 노드, (3) 수강생 모드로 "내 강의"에 접속했을 때 내가 만든 노드와 즐겨찾기한 노드들의 서브트리입니다. 이 중 (1)·(2)는 평평한 필터 조회라 RPC 없이 바로 조회하면 되고, (3)만 재귀 조회가 필요해서 RPC를 써야 해요.

**⚠️ 아직 프론트 코드에 구현되어 있지 않습니다** — 아래 RPC/RLS는 백엔드 쪽에서 이미 만들어 원격 DB에 반영해뒀지만, 프론트 코드에서 실제로 이 패턴을 쓰는 곳은 아직 없어요([TODO.md 프론트엔드 > 트리 구조 데이터 조회 관련](./TODO.md#트리-구조-데이터-조회-관련) 참고).

### (1) 강의 페이지 — 직접 조회

위 [5번 "테이블 조회"](#테이블-조회)에서 이미 쓴 것과 같은 패턴이에요(`posts_public`을 `lecture_id`로 필터).

```js
const { data } = await supabase
  .from('posts_public')
  .select('*')
  .eq('lecture_id', lectureId)
```

`posts.lecture_id`가 답글까지 포함해 모든 행에 직접 저장되어 있어서, 트리 depth와 무관하게 평평한 조회로 끝납니다.

### (2) 강의자 모드 "내 강의" — 직접 조회

```js
const { data } = await supabase
  .from('nodes')
  .select('*')
  .eq('created_by', userId)
  .eq('created_mode', 'lecturer')
```

### (3) 수강생 모드 "내 강의" — `get_my_favorite_subtrees()` RPC 필요

`nodes`는 `parent_id` 자기참조로 깊이 무제한 트리를 이루기 때문에, "즐겨찾기한 노드 자신 + 그 아래 전체 서브트리"를 구하려면 재귀 조회가 필요해서 RPC를 씁니다. 필요한 데이터는 다음 세 가지의 조합이에요.

**a. 내가 만든 노드(수강생 모드 개인 정리 폴더)**: 직접 조회
```js
const { data: created } = await supabase
  .from('nodes')
  .select('*')
  .eq('created_by', userId)
  .eq('created_mode', 'student')
```

**b. 내 즐겨찾기 목록(`node_id` ↔ `anchor_id` 매핑)**: 직접 조회 (RLS로 본인 행만 보임)
```js
const { data: myFavorites } = await supabase
  .from('favorites')
  .select('node_id, anchor_id')
```

**c. 즐겨찾기한 노드들의 서브트리**: RPC 호출
```js
const { data: favoriteRows } = await supabase.rpc('get_my_favorite_subtrees')
// 각 행: { id, parent_id, type, name, created_by, created_mode, created_at, anchor_node_id }
```

**⚠️ 주의: `created`와 `favoriteRows`를 하나의 `Map`으로 합쳐서 `id` 기준으로 중복 제거하면 안 됩니다.** 폴더 A와 그 하위 강의 B를 각각 따로 즐겨찾기한 경우, B는 "A의 서브트리 안 자손"이면서 동시에 "B 자신의 즐겨찾기 루트"로 **화면 두 자리에 각각 독립적으로 나타나야** 하는데, 전역 `id`로 합치면 하나로 뭉개져 버려요. 그래서 `favoriteRows`는 `anchor_node_id`(어느 즐겨찾기 루트에서 나온 행인지)로 그룹핑해서, 즐겨찾기 루트별로 독립된 서브트리를 각각 조립해야 합니다.

```js
function groupByAnchor(favoriteRows) {
  const byAnchor = new Map()
  for (const row of favoriteRows) {
    if (!byAnchor.has(row.anchor_node_id)) byAnchor.set(row.anchor_node_id, [])
    byAnchor.get(row.anchor_node_id).push(row)
  }
  return byAnchor
}

function buildTree(flatNodes) {
  const byId = new Map(flatNodes.map(n => [n.id, { ...n, children: [] }]))
  const roots = []
  for (const node of byId.values()) {
    const parent = byId.get(node.parent_id)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

// created는 그 자체로 이미 하나의 진짜 트리(내 소유 nodes.parent_id 체인)라 buildTree(created)로 바로 조립.
// 즐겨찾기는 anchor마다 독립적으로 조립해서, favorites에서 얻은 anchor_id 위치에 각각 붙임(서로 합치지 않음).
const favoriteRootsByAnchor = new Map() // anchor_id -> 붙일 서브트리 배열 (null이면 최상위)
for (const [anchorNodeId, rows] of groupByAnchor(favoriteRows)) {
  const [subtreeRoot] = buildTree(rows) // rows엔 anchor 자기 자신도 포함되어 있어서 루트 하나만 나옴
  const { anchor_id } = myFavorites.find(m => m.node_id === anchorNodeId)
  if (!favoriteRootsByAnchor.has(anchor_id)) favoriteRootsByAnchor.set(anchor_id, [])
  favoriteRootsByAnchor.get(anchor_id).push(subtreeRoot)
}
```

React에서 렌더링할 때 `key`도 전역 `id`가 아니라 `${anchorNodeId}-${node.id}`처럼 "어느 anchor에서 나온 사본인지"까지 포함해야 같은 노드가 두 자리에 있을 때 key 충돌이 안 나요.

세 요청 다 로그인 시 한꺼번에 받아두지 말고, 모드 전환/페이지 진입 시점마다 그 모드에 맞는 것만 요청하면 됩니다.

## 7. 비회원 인증: `guest_token` + `x-guest-token` 헤더

로그인 안 한 수강생(비회원)도 질문을 남길 수 있어야 하는데, 그 사람이 "본인 글"을 나중에 수정/삭제하려면 신원 확인이 필요해요. 그래서 쓰는 게 `guest_token`입니다.

- 브라우저 **`localStorage`**에 최초 1회 랜덤 값(UUID)을 생성해서 저장하고, 그 브라우저에서는 계속 재사용해요.
- `posts.guest_token`, `post_likes`/`lecture_feedback_votes`의 `voter_key`, Presence(접속자 수 집계) 키로 전부 동일하게 재사용합니다.
- 서버(Supabase RLS)는 이 값을 **`x-guest-token`이라는 커스텀 HTTP 헤더**로 보내주면, RLS 정책이 그 헤더 값과 DB에 저장된 `guest_token`을 대조해서 "본인 글이 맞는지" 확인해요.

**⚠️ 아직 아무 데도 구현 안 되어 있습니다** — `guest_token` 생성/저장 로직도, 헤더를 실어 보내는 코드도 지금 코드베이스 어디에도 없어요. 앞으로 만들어야 할 부분입니다 ([TODO.md 프론트엔드 > guest_token 관련](./TODO.md#guest_token-관련-1) 참고).

**구현 방식: 요청마다 체이닝으로 헤더 설정**

```js
await supabase
  .from('posts_public')
  .select('*')
  .setHeader('x-guest-token', guestToken)
```

supabase 클라이언트는 앱 시작할 때 딱 한 번만 만들고(`supabaseClient.js`), 실제 요청을 보내는 시점에 `localStorage`에서 최신 `guestToken`을 읽어서 `.setHeader()`로 그때그때 붙이는 방식이에요.

**왜 이 방식인지**: `createClient(...)` 옵션(`global.headers`)으로 헤더를 고정하는 방법도 있지만, 그건 클라이언트를 만드는 시점에 값이 한 번 박혀버려요. `guest_token`은 앱이 로드된 *이후에* `localStorage`에서 읽히는 값이라 클라이언트 생성 시점엔 아직 없을 수 있고, 로그인 여부에 따라 이 헤더가 필요 없는 요청도 있어서(회원은 `author_id`로 처리) 요청마다 동적으로 판단해야 합니다. 그래서 매 요청 시점에 값을 읽어 붙이는 `.setHeader()` 방식으로 갑니다.

## 8. 강의자/수강생 모드 색 구분: `posts.created_mode`

같은 계정이라도 강의자 모드로 쓴 글인지 수강생 모드로 쓴 글인지에 따라 화면 색을 다르게 표시해야 하는데(`author_id`가 강의 제작자와 같은지만으론 구분 안 됨), 그 판단은 `posts.created_mode` 컬럼 값(`'lecturer'` | `'student'`)만 보면 됩니다. 글 작성 시 이 값을 실어 보내는 건 프론트 로직에서 알아서 처리하면 되고요.

- **`created_mode: 'lecturer'`로 보냈는데 실제 그 강의를 만든 계정이 아니면 INSERT 자체가 거부됩니다**(RLS가 `auth.uid()`로 검증). 모드 상태 관리 버그로 이 값이 잘못 실릴 경우 조용히 무시되는 게 아니라 요청이 실패하니, 에러 핸들링에 유의하세요. 자세한 제약 내용은 [DB_DESIGN.md](./DB_DESIGN.md) 참고.

## 9. 테스트용 더미 데이터

`backend/supabase/seed.sql`에 실제 스키마에 맞춘 더미 데이터가 원격 DB에 반영되어 있어요(강의 폴더/강의, 질문/답글, 좋아요, 실시간 피드백 등). [`DUMMY_DATA.md`](./DUMMY_DATA.md)에서 확인할 수 있는데, 계정별·모드별로 "내 강의" 페이지에 어떤 강의/폴더 트리가 보이는지(강의 입장 코드, 즐겨찾기 관계 포함)뿐 아니라, 일부 강의(트리와 그래프, 데이터베이스 설계 입문)에 실제로 등록되어 있는 질문/답글 트리 구조도 정리되어 있으니 강의 페이지 테스트할 때도 참고하세요.
