# Supabase 연동 가이드 (프론트엔드용)

> 프론트엔드에서 Supabase에 어떻게 연결하고, URL/API 키가 무엇인지, 실제로 어떤 코드를 쓰면 되는지 정리한 문서입니다.

## 목차

- [1. Supabase URL / API 키란 무엇인가](#1-supabase-url--api-키란-무엇인가)
- [2. 이 프로젝트의 실제 값은 어디서 얻는가](#2-이-프로젝트의-실제-값은-어디서-얻는가)
- [3. supabase-js 클라이언트 설정](#3-supabase-js-클라이언트-설정)
- [4. `.env` / `.env.example` 사용법](#4-env--envexample-사용법)
- [5. 실제로 사용할 코드 패턴](#5-실제로-사용할-코드-패턴)
- [6. 트리 구조 데이터 조회 (내 강의 페이지 / 강의 페이지)](#6-트리-구조-데이터-조회-내-강의-페이지--강의-페이지)
- [7. 강의 공유 코드(`join_code`) 조회/발급/재발급](#7-강의-공유-코드join_code-조회발급재발급)
- [8. 비회원 인증: `guest_token` + `x-guest-token` 헤더](#8-비회원-인증-guest_token--x-guest-token-헤더)
- [9. 강의자/수강생 모드 색 구분: `posts_public.created_mode`](#9-강의자수강생-모드-색-구분-posts_publiccreated_mode)
- [10. 테스트용 더미 데이터](#10-테스트용-더미-데이터)

## 1. Supabase URL / API 키란 무엇인가

- **URL**: 우리 Supabase 프로젝트가 있는 위치를 가리키는 주소예요. `https://<project-ref>.supabase.co` 형태입니다.
- **anon(publishable) key**: "이 요청이 우리 프로젝트/앱에서 온 게 맞다"를 나타내는 값이에요. supabase-js가 `apikey` 헤더로 **로그인 여부와 무관하게 모든 요청에 항상** 함께 실어 보냅니다. 로그인하면 `Authorization` 헤더에 사용자의 세션 토큰(JWT)이 추가로 실려서 `auth.uid()`가 그 사람으로 채워지지만, `apikey` 헤더의 anon key는 로그인 후에도 그대로 계속 보내야 해요 — "익명 사용자 전용" 값이 아닙니다.

**이 두 값은 비밀번호가 아닙니다.** 프론트엔드 코드에 그대로 들어가고, 브라우저 개발자도구에서 누구나 볼 수 있어요. 그래도 안전한 이유는, 실제로 "누가 뭘 할 수 있는지"는 이 키가 아니라 **RLS(Row Level Security) 정책**이 결정하기 때문입니다 (자세한 내용은 [DB_DESIGN.md의 접근 제어 섹션](./DB_DESIGN.md#접근-제어-rls-정책-및-테이블-권한) 참고).

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

- **게시글 조회**: `posts` 대신 **`posts_public`** 뷰를 씁니다. `posts` 테이블엔 `guest_token`이라는 민감한 컬럼이 있어서 그대로 노출하면 남의 글을 수정/삭제당할 수 있고, `author_id`도 익명 여부와 무관하게 노출되면 안 되기 때문이에요. `posts_public`은 `guest_token`을 완전히 빼고, `author_id`도 숨긴 뒤 익명이 아닌 글만 작성자 이름(`author_display_name`)을 보여줍니다. `is_mine`(boolean) 컬럼도 있는데, "이 글이 내가 쓴 글인지"를 `author_id`/`guest_token` 원본 값 노출 없이 알려주는 계산 컬럼이에요 — 수정/삭제 버튼을 조건부로 보여줄 때 이 값으로 판단하면 됩니다(실제 수정/삭제 권한과 정확히 같은 조건이라 "버튼은 보이는데 실제로는 막히는" 일이 없어요). 강의자/수강생 모드 색 구분에 필요한 `created_mode`도 이 뷰에 포함돼 있습니다(자세한 건 [9번](#9-강의자수강생-모드-색-구분-posts_publiccreated_mode) 참고).
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

"내 강의"/"강의" 페이지에서 서버에 물어봐야 하는 건 크게 세 가지예요. (1) 강의 페이지에 접속했을 때 해당 `lecture_id`의 모든 `posts`, (2) 강의자 모드로 "내 강의"에 접속했을 때 내가 만든 모든 노드, (3) 수강생 모드로 "내 강의"에 접속했을 때 내가 만든 노드와 즐겨찾기한 노드들의 서브트리입니다. 이 중 (1)·(2)는 비재귀 필터 조회라 RPC 없이 바로 조회하면 되고, (3)만 재귀 조회가 필요해서 RPC를 써야 해요.

**✅ `frontend` 브랜치에 이미 실제 연동이 들어가 있습니다** — `frontend/src/services/api.ts`의 `getCourseFolders()`/`getStandaloneCourses()`가 아래 내용대로 `nodes`/`favorites`/`get_my_favorite_subtrees()`를 실제로 조회해서 `CourseFolder`/`Course` 트리로 조립하도록 이미 구현돼 있어요(`nodeToItem`/`buildFolderTree`/`buildFavoriteRoots` 함수 참고). 아래는 그 구현이 따르고 있는 설계를 설명하는 내용이고, 남은 간극(아래 "남은 간극" 문단)만 아직 안 채워져 있습니다.

### (1) 강의 페이지 — 직접 조회

위 [5번 "테이블 조회"](#테이블-조회)에서 이미 쓴 것과 같은 패턴이에요(`posts_public`을 `lecture_id`로 필터).

```js
const { data } = await supabase
  .from('posts_public')
  .select('*')
  .eq('lecture_id', lectureId)
```

`posts.lecture_id`가 답글까지 포함해 모든 행에 직접 저장되어 있어서, 트리 depth와 무관하게 비재귀 조회로 끝납니다.

### (2)·(3) "내 강의" — `getCourseFolders()`/`getStandaloneCourses()`가 반환해야 할 모양

`frontend/src/types/course.ts`를 보면 최종적으로 필요한 모양이 이미 정해져 있어요.

```ts
interface CourseFolder {
  id: string
  name: string
  ownership: 'owned' | 'registered'
  children: CourseFolder[]
  courses: Course[]
}
// Course는 여기에 title/색(color)/일정 등이 추가된 잎(leaf) 노드
```

즉 `nodes`의 flat 행 목록을 그대로 넘기면 안 되고, **`node_type`(`type`)에 따라 폴더는 `children`/`courses`를 가진 `CourseFolder`로, 강의는 `Course`로 나눠서 중첩 트리로 조립**해야 해요. 아래 헬퍼 하나로 강의자 모드(2)·수강생 모드(3) 둘 다 처리할 수 있습니다.

```js
function toItem(node, ownership) {
  return node.type === 'lecture'
    ? { id: node.id, title: node.name, ownership, color: ownership === 'owned' ? 'purple' : 'blue' /* + owned면 lectures 조인 필드, 아래 "남은 간극" 참고 */ }
    : { id: node.id, name: node.name, ownership, children: [], courses: [] }
}

// flatNodes: 같은 부모-자식 관계(parent_id)를 이루는 노드 목록 하나
// 반환값: 최상위 폴더 배열(folders)과 최상위 강의 배열(rootCourses) — getCourseFolders/getStandaloneCourses가 각각 이 둘을 나눠서 돌려주면 됨
function buildFolderTree(flatNodes, ownership) {
  const byId = new Map(flatNodes.map(n => [n.id, toItem(n, ownership)]))
  const folders = []
  const rootCourses = []
  for (const node of flatNodes) {
    const item = byId.get(node.id)
    const parent = node.parent_id ? byId.get(node.parent_id) : null
    const bucket = parent ? (node.type === 'lecture' ? parent.courses : parent.children) : (node.type === 'lecture' ? rootCourses : folders)
    bucket.push(item)
  }
  return { folders, rootCourses }
}
```

**(2) 강의자 모드**: 내가 만든 노드가 전부 `owned`라 이대로 끝이에요.
```js
const { data: nodes } = await supabase.from('nodes').select('*').eq('created_by', userId).eq('created_mode', 'lecturer')
const { folders, rootCourses } = buildFolderTree(nodes, 'owned')
```

**(3) 수강생 모드**: `created`(내가 만든 개인 정리 폴더, 전부 `owned`)와 즐겨찾기 서브트리(전부 `registered`)를 따로 조립한 다음, `favorites.anchor_id` 위치에 끼워 넣어야 해요. 수강생은 `nodes.type = 'lecture'`인 노드를 만들 수 없으므로(`nodes`의 `check` 제약 참고) `created`는 항상 폴더뿐입니다.

```js
const { data: created } = await supabase.from('nodes').select('*').eq('created_by', userId).eq('created_mode', 'student')
const { folders: ownedFolders } = buildFolderTree(created, 'owned') // rootCourses는 늘 빈 배열

const { data: myFavorites } = await supabase.from('favorites').select('node_id, anchor_id')
const { data: favoriteRows } = await supabase.rpc('get_my_favorite_subtrees')
// 각 행: { id, parent_id, type, name, created_by, created_mode, created_at, anchor_node_id }
```

**⚠️ 주의: `favoriteRows`는 `anchor_node_id`(어느 즐겨찾기 루트에서 나온 행인지)로 그룹핑해서, 즐겨찾기 루트별로 독립된 서브트리를 각각 조립해야 합니다.** 폴더 A와 그 하위 강의 B를 각각 따로 즐겨찾기한 경우, B는 "A의 서브트리 안 자손"이면서 동시에 "B 자신의 즐겨찾기 루트"로 **화면 두 자리에 각각 독립적으로 나타나야** 하는데, `anchor_node_id` 구분 없이 하나로 뭉치면 하나로 뭉개져 버려요.

```js
function groupByAnchor(rows) {
  const byAnchor = new Map()
  for (const row of rows) {
    if (!byAnchor.has(row.anchor_node_id)) byAnchor.set(row.anchor_node_id, [])
    byAnchor.get(row.anchor_node_id).push(row)
  }
  return byAnchor
}

// 즐겨찾기 루트를 실제로 붙여넣을 위치(favorites.anchor_id)별로 정리
const registeredRootsByAnchorId = new Map() // anchor_id(null이면 최상위) -> CourseFolder | Course 배열
for (const [anchorNodeId, rows] of groupByAnchor(favoriteRows)) {
  const { folders: [folderRoot], rootCourses: [courseRoot] } = buildFolderTree(rows, 'registered')
  const registeredRoot = folderRoot ?? courseRoot // 즐겨찾기 루트가 폴더인지 강의인지에 따라 둘 중 하나만 나옴
  const { anchor_id } = myFavorites.find(m => m.node_id === anchorNodeId)
  if (!registeredRootsByAnchorId.has(anchor_id)) registeredRootsByAnchorId.set(anchor_id, [])
  registeredRootsByAnchorId.get(anchor_id).push(registeredRoot)
}

// registered 루트를 owned 트리의 anchor_id 위치(폴더면 .children, 강의면 .courses)에 끼워넣기
function attachFavorites(folder) {
  folder.children.forEach(attachFavorites)
  for (const root of registeredRootsByAnchorId.get(folder.id) ?? []) {
    const bucket = 'children' in root ? folder.children : folder.courses
    bucket.push(root)
  }
}
ownedFolders.forEach(attachFavorites)

const topLevel = registeredRootsByAnchorId.get(null) ?? [] // anchor_id가 null인 즐겨찾기(최상위에 둔 것)
const folders = [...ownedFolders, ...topLevel.filter(root => 'children' in root)]
const rootCourses = topLevel.filter(root => 'title' in root)
```

`getCourseFolders()`는 이 `folders`를, `getStandaloneCourses()`는 이 `rootCourses`를 돌려주면 돼요.

**남은 간극**

- `date`/`startTime`/`endTime`/`location`/`capacity`는 **`registered`(즐겨찾기) 강의에는 필요 없습니다.** 이 값을 실제로 읽는 곳은 강의 수정 폼(`CreateCoursePage.tsx`)의 프리필뿐인데, 수정 기능 자체가 `ownership === 'owned'` 강의에만 열려 있어서(남의 강의는 수정 불가) `registered` 강의는 애초에 아무도 이 값을 안 봅니다. `owned` 강의는 이미 `nodes.select('*, lectures(start_time, end_time, location, max_participants)')`로 조인해서 채우고 있으니 이대로 두면 됩니다 — `get_my_favorite_subtrees()`에 `lectures` 조인을 추가할 필요는 없습니다.
- **`questionCount`(프론트 라벨은 "게시글 {n}개") — ✅ 프론트 구현 완료.** `posts_counts` 뷰(`lecture_id`별 게시글 개수)를 트리 조립 후 한 번에 조회해 채워 넣습니다(`services/api.ts`의 `fillQuestionCounts()`, `findCourseByJoinCode()`의 단일 강의 조회 경로도 동일 처리).
  ```js
  const lectureIds = [...folders /* 재귀로 모은 course id 전부 */, ...rootCourses].map(c => c.id)
  const { data: counts } = await supabase.from('posts_counts').select('lecture_id, post_count').in('lecture_id', lectureIds)
  const countByLectureId = new Map(counts.map(c => [c.lecture_id, c.post_count]))
  // 각 Course에 questionCount: countByLectureId.get(course.id) ?? 0 매핑
  ```
- **`participantCount`는 여전히 별도 설계가 필요합니다.** 이 값은 정적으로 저장된 값이 아니라 Realtime **Presence**로 그때그때 세는 값이라([DB_DESIGN.md의 "실시간 접속자 수" 섹션](./DB_DESIGN.md#실시간-접속자-수-강의별) 참고), 이 트리 조회 시점에는 애초에 못 채우고 강의실 페이지에 들어가야만 알 수 있습니다. 목록 화면에서 보여주려면 별도 설계가 필요해서 아직 미해결입니다.

### 이동/이름변경/삭제/생성 — `services/api.ts`의 mock 규칙과 실제 백엔드 매핑

`frontend/src/services/api.ts`의 mock 함수들이 이미 정확한 권한 규칙을 주석으로 명시해뒀고, 그 규칙은 전부 아래처럼 이미 있는 RLS/트리거로 그대로 옮겨집니다 — **새로 막을 건 없고, mock 로직을 실제 쿼리로만 바꾸면 됩니다.**

| mock 함수 | 규칙(주석 그대로) | 실제 Supabase 호출 |
|---|---|---|
| `moveCourseItem` (owned 폴더/강의) | 강의자는 소유권 제한 없이 자유 이동 | `nodes` `update`로 `parent_id` 변경. `nodes_update_own` + `enforce_nodes_parent_ownership`이 "내 것만, 같은 모드끼리만" 강제 |
| `moveCourseItem` (registered 개별 강의) | "등록된 개별 강의는 보라 폴더로 이동 가능(소유권 유지)" | `nodes.parent_id`가 아니라 **`favorites` `update`로 `anchor_id` 변경**. `favorites_update_anchor_must_be_own_student_folder`가 "내 소유 폴더로만" 강제 |
| `moveCourseItem` (registered 폴더) | "등록된 폴더 자체는 이동 불가" | 프론트에서 애초에 시도 자체를 안 함(UI에서 이미 막혀 있음) |
| `renameCourseItem` | "강의자가 공유한 항목은 이름 변경 불가" | owned 항목만 `nodes` `update`(`name`). registered 항목은 애초에 UI에서 버튼이 안 보여야 함 — `nodes_update_own`도 어차피 남의 노드라 막음 |
| `deleteCourseItem` | "내가 만든 건 완전 삭제, 등록된 건 등록만 취소" | owned → `nodes` `delete`(cascade로 하위까지 정리). registered → `favorites` `delete`(해당 즐겨찾기 행만 삭제, 원본 노드는 그대로) |
| `createRootFolder` | 새 폴더 생성 | `nodes` `insert`(`type: 'folder'`, `created_mode`는 현재 모드) |
| `createCourse`/`updateCourse` | 강의 생성/수정(강의자만) | `nodes` `insert`/`update`(`type: 'lecture'`, `created_mode: 'lecturer'`) + `lectures` `insert`/`update` |
| `registerCourseByCode` | 코드로 강의/폴더 등록 | `favorites` `insert`(`node_id`: 코드로 찾은 노드, `anchor_id: null` — 항상 최상위에 등록되고, 이후 `moveCourseItem`으로 정리) |

세 요청(포스트/강의자 모드/수강생 모드) 다 로그인 시 한꺼번에 받아두지 말고, 모드 전환/페이지 진입 시점마다 그 모드에 맞는 것만 요청하면 됩니다.

**`registerCourseByCode`와 `joinCourse`는 서로 다른 값을 받습니다** — 둘 다 "코드"라고 부르지만 실제로는 다른 식별자예요. `joinCourse`(강의 코드 입력 후 바로 입장, 목록엔 등록 안 함)는 4자리 숫자(`lecture_join_codes.code`)를 받아 그 코드로 `lecture_id`를 찾습니다. `registerCourseByCode`(내 강의 목록에 등록)는 강의 UUID(`nodes.id`)를 직접 입력받아 `nodes`를 바로 조회합니다 — `lecture_join_codes`를 거치지 않습니다. `services/api.ts`에서 전자는 `findCourseByJoinCode()`(4자리 정규식 검증), 후자는 `findCourseById()`(UUID 정규식 검증)로 분리되어 있습니다.

## 7. 강의 공유 코드(`join_code`) 조회/발급/재발급

**✅ 프론트 구현 완료** — `services/api.ts`의 `getOrCreateJoinCode()`/`reissueJoinCode()`가 두 RPC를 감싸고, `ShareCourseModal.tsx`가 모달을 열 때 `course.joinCode`가 없으면 자동 발급하고 "재발급" 버튼도 제공합니다.

강의 페이지의 "강의 코드 공유" 버튼은 `lecture_join_codes` 테이블을 **직접 INSERT/UPDATE로 건드릴 수 없습니다** — 발급/재발급은 반드시 RPC를 통해야 하고, 파기(강의 종료 등으로 코드를 없애는 것)만 테이블에 직접 DELETE하면 됩니다. 자세한 이유(4자리 코드 충돌 재시도, 테이블 권한 회수)는 [DB_DESIGN.md의 `get_or_create_join_code()`/`reissue_join_code()` 설명](./DB_DESIGN.md#get_or_create_join_code) 참고.

**코드 조회(이미 발급된 코드를 그냥 보여줄 때)**: `lecture_join_codes`는 전체 공개 SELECT라 누구나 직접 조회할 수 있습니다. 강의자든 수강생이든 코드가 이미 있으면 이 조회만으로 충분해요.

```js
const { data } = await supabase
  .from('lecture_join_codes')
  .select('code')
  .eq('lecture_id', lectureId)
  .maybeSingle()
// data가 없으면 아직 발급 전 — 아래 발급 RPC를 호출해야 함
```

**강의 코드 공유 버튼(발급 또는 조회를 한 번에)**: 버튼을 누르면 있으면 반환, 없으면 그 자리에서 발급까지 처리하는 `get_or_create_join_code`를 호출하면 됩니다. 강의를 만든 계정(강의자)이 아니면 에러가 나므로, 이 버튼은 강의 소유자에게만 노출하세요.

```js
const { data: code, error } = await supabase.rpc('get_or_create_join_code', {
  p_lecture_id: lectureId,
})
if (error) {
  alert('코드 발급 실패: ' + error.message)
  return
}
// code는 4자리 문자열(예: '0427')
```

**재발급 버튼**: 기존 코드를 강제로 폐기하고 새 코드를 받고 싶을 때만 `reissue_join_code`를 씁니다(단순 조회에는 쓰지 마세요 — 매번 새 코드가 발급됩니다). 호출 방식은 동일합니다.

```js
const { data: newCode, error } = await supabase.rpc('reissue_join_code', {
  p_lecture_id: lectureId,
})
```

**주의할 점**:
- `p_lecture_id`는 `lectures.id`(=`nodes.id`)입니다. `lecture_join_codes.code`가 아니에요.
- 강의 소유자가 아닌 계정으로 두 RPC를 호출하면 에러가 나는 게 정상입니다(권한 체크). "발급 실패" 알림을 에러 종류 구분 없이 그냥 띄워도 되지만, 소유자 확인 버그와 헷갈리지 않도록 에러 메시지를 그대로 보여주는 걸 추천합니다.
- 코드 파기(강의 종료 시 등)는 RPC가 아니라 `supabase.from('lecture_join_codes').delete().eq('lecture_id', lectureId)`를 직접 호출하면 됩니다(RLS가 소유자만 허용).

## 8. 비회원 인증: `guest_token` + `x-guest-token` 헤더

로그인 안 한 수강생(비회원)도 질문을 남길 수 있어야 하는데, 그 사람이 "본인 글"을 나중에 수정/삭제하려면 신원 확인이 필요해요. 그래서 쓰는 게 `guest_token`입니다.

- 브라우저 **`localStorage`**에 최초 1회 랜덤 값(UUID)을 생성해서 저장하고, 그 브라우저에서는 계속 재사용해요.
- `posts.guest_token`, `post_likes`/`lecture_feedback_votes`의 `voter_key`, Presence(접속자 수 집계) 키로 전부 동일하게 재사용합니다.
- 서버(Supabase RLS)는 이 값을 **`x-guest-token`이라는 커스텀 HTTP 헤더**로 보내주면, RLS 정책이 그 헤더 값과 DB에 저장된 `guest_token`을 대조해서 "본인 글이 맞는지" 확인해요.

**✅ `frontend` 브랜치에 이미 구현되어 있습니다** — `services/guestToken.ts`의 `getGuestToken()`이 최초 호출 시 `localStorage`에 UUID를 생성/저장하고 재사용하며, `services/api.ts`의 `withGuestHeader()` 헬퍼가 비회원 요청에만 `.setHeader('x-guest-token', ...)`을 붙입니다. `posts` insert/update, `posts_public` 조회(`is_mine` 계산에 필요), `post_likes` insert/delete, `lecture_feedback_votes` select/insert/delete 전 경로에 적용되어 있어요. **주의**: `posts_public`을 조회하는 모든 경로에 이 헤더가 빠짐없이 붙어야 `is_mine`이 정확히 계산됩니다 — 한 곳이라도 빠지면 게스트가 방금 쓴 글의 수정 버튼이 안 보이는 버그가 생깁니다.

**구현 방식: 요청마다 체이닝으로 헤더 설정**

```js
await supabase
  .from('posts_public')
  .select('*')
  .setHeader('x-guest-token', guestToken)
```

supabase 클라이언트는 앱 시작할 때 딱 한 번만 만들고(`supabaseClient.js`), 실제 요청을 보내는 시점에 `localStorage`에서 최신 `guestToken`을 읽어서 `.setHeader()`로 그때그때 붙이는 방식이에요.

**왜 이 방식인지**: `createClient(...)` 옵션(`global.headers`)으로 헤더를 고정하는 방법도 있지만, 그건 클라이언트를 만드는 시점에 값이 한 번 박혀버려요. `guest_token`은 앱이 로드된 *이후에* `localStorage`에서 읽히는 값이라 클라이언트 생성 시점엔 아직 없을 수 있고, 로그인 여부에 따라 이 헤더가 필요 없는 요청도 있어서(회원은 `author_id`로 처리) 요청마다 동적으로 판단해야 합니다. 그래서 매 요청 시점에 값을 읽어 붙이는 `.setHeader()` 방식으로 갑니다.

## 9. 강의자/수강생 모드 색 구분: `posts_public.created_mode`

같은 계정이라도 강의자 모드로 쓴 글인지 수강생 모드로 쓴 글인지에 따라 화면 색을 다르게 표시해야 하는데(`author_id`가 강의 제작자와 같은지만으론 구분 안 됨), 그 판단은 조회한 **`posts_public`**(`posts`가 아님, [5번 "테이블 조회"](#테이블-조회) 참고) 행의 `created_mode` 컬럼 값(`'lecturer'` | `'student'`)만 보면 됩니다.

- **`created_mode: 'lecturer'`로 글을 쓰는데 실제 그 강의를 만든 계정이 아니면 거부됩니다.** 지금은 클라이언트가 `posts`에 직접 insert하고 RLS(`auth.uid()`로 검증)가 이걸 막는 구조지만, [`SUBMIT_POST_PLAN.md`](./SUBMIT_POST_PLAN.md)에 정리된 대로 글 작성 자체가 곧 **`submit-post` Edge Function**을 통해서만 가능하도록 바뀔 예정이에요(아직 계획 단계, RLS도 함수도 실제로 바뀌지 않았음 — 지금은 여전히 클라이언트 직접 insert). 그 전환이 끝나면 `created_mode`를 실어 보내는 방식이 `posts.insert(...)` 호출에서 `submit-post` 요청 바디의 필드로 바뀔 뿐, "본인이 만든 강의가 아니면 거부"라는 동작 자체는 그대로 유지됩니다. 모드 상태 관리 버그로 이 값이 잘못 실릴 경우 조용히 무시되는 게 아니라 요청이 실패하니, 에러 핸들링에 유의하세요. 자세한 제약 내용은 [DB_DESIGN.md](./DB_DESIGN.md) 참고.

**✅ `frontend` 브랜치에 이미 구현되어 있습니다** — `services/api.ts`의 `postAuthorRole()`이 `posts_public.created_mode`를 그대로 읽어 `'lecturer'`/`'student'`/(익명이면)`'anonymous'`를 정확히 판별하고, `getQuestionsFromDb()`의 select 절에도 `created_mode`가 포함되어 있습니다. 이전에는 이 뷰에 `created_mode`가 없어서 "실명 + 표시 이름이 강의 소유자 이름과 일치"라는 근사치를 썼었는데(강의 소유자 실명 자체를 `profiles` RLS 때문에 알아낼 수 없어 사실상 항상 실패했음), 뷰에 컬럼이 추가되면서 근사치를 걷어내고 정확한 판별로 교체했습니다.

**"내 글만 수정하기" 버튼도 `is_mine`으로 정확히 구현되어 있습니다** — `QuestionReply.isEditable`을 `posts_public.is_mine` 값으로 그대로 채웁니다(`updateReply()`의 수정 성공 직후 응답만 예외적으로 `true` 하드코딩 — 그 시점의 호출 주체 자체가 작성자이므로). **주의할 점 하나**: `is_mine`은 비회원의 경우 `x-guest-token` 헤더 값과 DB의 `guest_token`을 대조해서 계산되므로, `posts_public`을 조회하는 요청에도 [8번](#8-비회원-인증-guest_token--x-guest-token-헤더)의 `.setHeader('x-guest-token', ...)`을 빠짐없이 붙여야 합니다 — 이 헤더가 빠지면 게스트가 방금 쓴 자기 글에도 `is_mine`이 항상 `false`로 나와 수정 버튼이 안 보이는 버그가 생깁니다(실제로 겪었던 버그).

**🚨 백엔드 버그(실측 확인, 프론트에서 고칠 수 없음): 본인 글이라도 답글 "수정하기"가 실제로는 항상 실패합니다.** `is_mine`이 `true`라서 버튼은 정확히 뜨는데, 막상 수정을 시도하면 `posts` UPDATE 요청이 **401 `permission denied for table posts` (Postgres 에러 코드 `42501`, hint: `GRANT SELECT ON public.posts TO anon`)**로 실패합니다. RLS 정책(`posts_update_own`)이나 `x-guest-token` 헤더 문제가 아니라(둘 다 정상 확인함), `posts` 테이블 자체의 SELECT 권한이 `anon`/`authenticated`에서 완전히 회수돼 있고([DB_DESIGN.md의 `revoke select on posts` 참고](./DB_DESIGN.md#접근-제어-rls-정책-및-테이블-권한)) `posts`에 SELECT 정책도 하나도 없는 상태(전부 `posts_public` 뷰로 우회)라서 생기는 문제로 보입니다. PostgreSQL은 UPDATE/DELETE의 `USING`/`WITH CHECK` 절을 평가할 때 대상 테이블에 대한 SELECT 권한이 있어야 하는데, GRANT 자체가 없어 이 평가가 아예 막혀서 RLS 정책 통과 여부와 무관하게 모든 UPDATE가 거부되는 것으로 추정됩니다. 재현: 실제 브라우저에서 게스트로 답글을 작성한 직후 "수정하기"를 눌러 저장하면 매번 재현됨(Playwright 스크립트로 네트워크 탭까지 확인함). **요청사항**: `posts`에 최소한의 SELECT GRANT(`grant select on posts to anon, authenticated`)를 다시 부여하되, 실제 노출은 계속 RLS로 제어해 주세요 — 지금처럼 GRANT 자체를 회수하면 조회뿐 아니라 UPDATE/DELETE까지 함께 막힙니다.

## 10. 테스트용 더미 데이터

`backend/supabase/seed.sql`에 실제 스키마에 맞춘 더미 데이터가 원격 DB에 반영되어 있어요(강의 폴더/강의, 질문/답글, 좋아요, 실시간 피드백 등). [`DUMMY_DATA.md`](./DUMMY_DATA.md)에서 확인할 수 있는데, 계정별·모드별로 "내 강의" 페이지에 어떤 강의/폴더 트리가 보이는지(강의 입장 코드, 즐겨찾기 관계 포함)뿐 아니라, 일부 강의(트리와 그래프, 데이터베이스 설계 입문)에 실제로 등록되어 있는 질문/답글 트리 구조도 정리되어 있으니 강의 페이지 테스트할 때도 참고하세요.

