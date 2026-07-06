# TODO

## 목차

- [백엔드](#백엔드)
  - [guest_token 관련](#guest_token-관련)
    - [1. `guest_token` 무효화 조건](#1-guest_token-무효화-조건-강의-종료-후)
  - [AI 보조 기능 관련 (Edge Function vs Express 서버 미결정)](#ai-보조-기능-관련-edge-function-vs-express-서버-미결정)
    - [2. 유사도 검사 비교 대상 범위](#2-유사도-검사-비교-대상-범위-미해결-게시글만-답글도-포함)
    - [3. 유사도 비교를 위한 벡터 컬럼 추가 여부 결정](#3-유사도-비교를-위한-벡터-컬럼-추가-여부-결정)
    - [4. AI 보조 기능 서버 아키텍처 결정](#4-ai-보조-기능-서버-아키텍처-결정-edge-function-vs-express)
  - [Realtime 관련](#realtime-관련)
    - [5. `max_participants`(최다 참여 인원) 강제 여부 결정](#5-max_participants최다-참여-인원-강제-여부-결정)
  - [join_code 관련](#join_code-관련)
    - [6. `lecture_join_codes` 파기 시점/주체 결정](#6-lecture_join_codes-파기delete-시점주체-결정)
  - [기타 사항](#기타-사항)
    - [7. 강의 폴더 트리 조회 (내 강의 페이지 / 강의 페이지)](#7-강의-폴더-트리-조회-내-강의-페이지--강의-페이지)
- [프론트엔드](#프론트엔드)
  - [guest_token 관련](#guest_token-관련-1)
- [해결된 것 (참고용 기록)](#해결된-것-참고용-기록)

## 백엔드

### guest_token 관련

#### 1. `guest_token` 무효화 조건 (강의 종료 후)

`posts_update_own`/`posts_delete_own`, `post_likes`/`lecture_feedback_votes` 관련 정책 전부에 "강의 종료 시각(`lectures.end_time`) 이후엔 `guest_token` 무효화" 조건이 아직 안 들어감.

**관련해서 검토한 것들:**

- **`posts.author_id`/`guest_token` 동시 null 허용 여부**: 지금 스키마는 `author_id`와 `guest_token`이 동시에 값을 가지는 것도 막지 않음(회원 글에 의미 없는 `guest_token`이 같이 들어가도 통과됨) — 데이터 정합성 관점에서 `check (not (author_id is not null and guest_token is not null))` 추가를 고려할 만함. 다만 **무효화를 "guest_token을 null로 지우는 방식"으로 갈 거라면, `(author_id is null and guest_token is null)` 상태(무효화된 비회원 글)는 반드시 허용해야 함** — 위 CHECK는 "둘 다 값이 있는 경우"만 막으므로 이 상태와 충돌 안 함.
- **무효화 구현 방식 두 가지**:
  1. **`pg_cron` 배치**: 주기적으로(예: 5~15분마다) `update posts set guest_token = null where guest_token is not null and lecture_id in (select node_id from lectures where end_time < now() - interval '1 hour')` 같은 걸 반복 실행. 멱등적이라 반복 실행해도 안전하지만, `pg_cron` 확장을 켜야 하고 폴링 주기만큼 무효화가 지연될 수 있음.
  2. **RLS 조건에 시각 비교를 직접 추가 (배치 job 불필요, 추천)**: 데이터를 지우지 않고 `posts_update_own`/`posts_delete_own`/`post_likes_*`/`lecture_feedback_votes_*` 정책의 `guest_token` 매칭 조건에 `now() < (해당 강의 end_time) + interval '1 hour'`를 추가. 매 요청 시점에 실제 시각으로 판단하니 지연 없이 정확하고, `pg_cron` 같은 별도 스케줄 인프라가 필요 없음.
  
  아직 어느 방식으로 갈지, 그리고 `check` 제약을 추가할지 결정 안 됨.

### AI 보조 기능 관련 (Edge Function vs Express 서버 미결정)

#### 2. 유사도 검사 비교 대상 범위 (미해결 게시글만? 답글도 포함?)

README엔 "글 작성 시(답글 포함) 미해결 게시글들과의 유사도 검사"라고 되어 있는데, 비교 대상이 미해결 게시글(최상위 글)들만인지 그 밑 답글 내용까지 포함할지 미정. 결정에 따라 유사도 검사 API가 LLM에 넘기는 데이터 범위가 달라짐.

#### 3. 유사도 비교를 위한 벡터 컬럼 추가 여부 결정

원래 기획 단계에서는 세션당 질문 수가 적을 것으로 예상해 임베딩(pgvector) 대신 "기존 질문 목록을 프롬프트에 통째로 넣고 LLM이 판단"하는 방식으로 시작하기로 했음. `posts`에 `embedding vector` 컬럼 + pgvector 확장을 추가해서 임베딩 기반 유사도 검색으로 갈지, 아니면 계속 LLM 프롬프트 방식으로 갈지 아직 결정 안 됨. 강의당 질문 수가 예상보다 많아지면 프롬프트에 다 넣기엔 비효율적이라 재검토가 필요할 수 있음.

#### 4. AI 보조 기능 서버 아키텍처 결정 (Edge Function vs Express)

AI 교정, 부적절한 내용 필터링, 유사 질문 자동 탐지(#2, #3) 기능을 처리할 서버를 **Supabase Edge Function**으로 만들지, **별도 Express 서버**를 새로 띄울지 아직 결정 안 됨. 현재는 Express 백엔드 서버 없이 Supabase만으로 구성되어 있음(`DB_DESIGN.md` 배포 현황 참고). 이 결정에 따라 배포 방식, 인증 처리(Edge Function은 Supabase 세션과 통합이 쉬움), LLM API 키 보관 위치 등이 달라짐.

### Realtime 관련

#### 5. `max_participants`(최다 참여 인원) 강제 여부 결정

컬럼만 있고 실제 입장 제한 로직/참여자 카운트 테이블이 없음. 정보 표시용인지 실제 강제해야 하는지 확인 필요 (강제한다면 Realtime **Presence** 또는 별도 카운트 확인 로직 추가 필요, `DB_DESIGN.md`의 "실시간 접속자 수" 섹션 참고).

### join_code 관련

#### 6. `lecture_join_codes` 파기(DELETE) 시점/주체 결정

강의 종료 시 자동으로 지울지(예: `pg_cron`), 강의자가 수동으로 파기하기 전까진 남겨둘지. 안 지워져도 입장 시 `lectures.end_time` 확인이 안전망이라 급한 이슈는 아님.

### 기타 사항

#### 7. 강의 폴더 트리 조회 (내 강의 페이지 / 강의 페이지)

"내 강의"/"강의" 페이지에서 서버에 물어봐야 하는 건 3가지: (1) 강의자 모드로 "내 강의" 접속 시 내가 만든 모든 노드, (2) 수강생 모드로 "내 강의" 접속 시 내가 만든 노드 + 내가 즐겨찾기한 노드 + 그 즐겨찾기 노드들을 조상으로 갖는 모든 노드, (3) 강의 페이지 접속 시 해당 `lecture_id`의 모든 `posts`. 이 중 (1)·(3)은 평평한 필터 조회라 RPC 없이 프론트에서 바로 쿼리하면 되고, (2)만 "즐겨찾기한 노드의 모든 자손"이 depth 무제한 재귀라 RPC가 필요함.

**(1) 강의자 모드 — RPC 불필요, 프론트에서 직접 쿼리**
```js
const { data } = await supabase
  .from('nodes')
  .select('*')
  .eq('created_by', userId)
  .eq('created_mode', 'lecturer')
```

**(3) 강의 페이지 — RPC 불필요, 프론트에서 직접 쿼리**
```js
const { data } = await supabase
  .from('posts_public')
  .select('*')
  .eq('lecture_id', lectureId)
```
`posts.lecture_id`가 답글까지 포함해 모든 행에 직접 박혀 있어서 트리 depth와 무관하게 평평한 조회로 끝남.

**(2) 수강생 모드 — RPC 필요**: `nodes`는 `parent_id` 자기참조로 깊이 무제한 트리를 이루는데, "즐겨찾기한 노드 자신 + 그 아래 전체 서브트리"를 구하려면 재귀 CTE가 필요하고 Supabase 기본 REST API(중첩 조회)로는 깊이 무제한을 표현할 수 없음. 반환 형태는 **평평한 행 목록**(`setof nodes`) 방식으로 결정 — 중첩 JSON 트리 방식은 재귀 CTE 안에서 집계 함수(`jsonb_agg` 등)를 바로 못 써서 CTE 밖에 depth 역순으로 훑는 별도 조립 루프가 필요해 훨씬 복잡한데, 지금은 이 트리를 조립해서 쓰는 화면이 "내 강의" 하나뿐이라 그 복잡도를 감수할 이득이 없음. 아직 함수/마이그레이션 미작성.

```sql
create or replace function get_node_descendants(root_ids uuid[])
returns setof nodes
language sql
stable
as $$
  with recursive descendants as (
    select n.*, 0 as depth from nodes n where n.id = any(root_ids)
    union all
    select n.*, d.depth + 1 from nodes n
    join descendants d on n.parent_id = d.id
    where d.depth < 50  -- 무한루프/과도한 재귀 방지 가드
  )
  select id, parent_id, node_type, name, created_by, created_mode, created_at from descendants;
$$;
```

- `nodes_select_all`이 이미 전체 공개(`using (true)`)라 이 RPC는 `SECURITY DEFINER`가 필요 없음(REST로도 어차피 읽을 수 있는 데이터를 재귀 조회 형태로만 대신 해주는 것).
- base case가 `root_ids`(즐겨찾기 node_id 목록)에 속한 노드 자신도 포함하므로, "즐겨찾기 노드 자신 + 서브트리"가 한 번의 호출로 다 나옴.
- 프론트는 (a) `nodes`에서 `created_by = 나 and created_mode = 'student'`로 내가 만든 노드, (b) `my_nodes`에서 내 즐겨찾기 `node_id` 목록, (c) 그 목록으로 위 RPC 호출 — 이 세 결과를 합쳐서(id 기준 중복 제거) 클라이언트에서 트리로 조립. 별도 라이브러리 없이 아래처럼 조립 가능(부모가 조회 결과 안에 없으면 자동으로 최상위 취급 — 즐겨찾기한 노드의 실제 조상은 우리가 안 가져왔으므로 이 fallback이 정확히 원하는 동작).
  ```js
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
  ```

Edge Function은 필요 없음 — 순수 DB 조회라 SQL(RPC)로 완결되고, Edge Function을 끼우면 네트워크 홉만 늘어남 (Edge Function은 LLM 호출처럼 SQL로 못 하는 로직에만 쓸 것, #4 참고).

프론트 요청 시점은 로그인 시 한꺼번에 받아두지 않고, 모드 전환/페이지 진입 시점마다 그 모드에 맞는 것만 요청 (안 쓰일 수도 있는 요청을 미리 낭비하지 않고, 세션 중 변경사항도 재요청 때 자연히 반영됨).

## 프론트엔드

### guest_token 관련

정확히 언제/어떻게 생성하는지(강의 최초 입장 시 1회 생성 등) 확정 필요. `localStorage`에 저장하고 재사용. 이후 `posts`, `post_likes`, `lecture_feedback_votes` 관련 요청을 보낼 때마다 이 값을 `x-guest-token` 헤더로 실어 보내도록 구현 (supabase-js 클라이언트에 요청별 커스텀 헤더 설정, `SUPABASE_GUIDE.md` 참고).

## 해결된 것 (참고용 기록)

- `posts.status`가 답글에는 항상 `null`이어야 하는 문제 → `check ((parent_id is null) = (status is not null))`로 해결.
- RLS 정책 전반 → `DB_DESIGN.md`의 "RLS 정책" 섹션에 정리 완료.
- `posts`의 `check (author_id is not null or is_anonymous = true)`와 `author_id`의 `on delete set null` 충돌 → `trg_anonymize_posts_before_profile_delete` 트리거로 해결.
- Supabase 프로젝트 연결 및 초기 스키마 마이그레이션 적용 → `backend/supabase/migrations/20260705062713_init_schema.sql`.
- 강의자가 게시글 미해결↔해결됨 전환(`posts_lecturer_update_status`), 실시간 피드백 초기화(`feedback_lecturer_reset`), 게시글 status는 강의자만 변경 가능(`trg_block_status_change`), 강의자 글 삭제 권한(`posts_lecturer_delete`), `guest_token` 제외 공개 뷰(`posts_public`) → `backend/supabase/migrations/20260705064427_lecturer_permissions.sql`.
- 회원 탈퇴 버튼 + RPC(`delete_own_account`) → `backend/supabase/migrations/20260705090000_delete_own_account_rpc.sql`, `backend/test-frontend`에 반영. 탈퇴 시 cascade로 발동되는 `anonymize_posts_before_profile_delete` 트리거가 `search_path` 문제로 실패하던 버그는 `20260705132633_fix_anonymize_posts_search_path.sql`로 수정.
- `voter_key`(회원/비회원 겸용 단일 컬럼)를 `user_id`/`guest_token` 두 컬럼으로 분리하지 않고 현재 구조 그대로 유지하기로 결정. 회원 탈퇴 시에도 좋아요/피드백 투표 기록을 삭제하지 않고 그대로 보존하는 쪽을 택함 (자동 정리보다 기록 보존 우선).
- 강의자 게시글 작성 제한(`restrict_lecturer_post_rules` 트리거 + `x-mode` 헤더)을 `posts.created_mode` 컬럼 + 테이블 `check` 제약 + RLS 정책 조합으로 재설계. 강의를 만든 계정이 수강생 모드로 자기 강의에 들어오면 일반 수강생처럼 글을 쓸 수 있어야 하고, 동시에 화면에서 강의자/수강생 글을 색으로 구분해야 해서 그 순간의 모드를 글에 직접 저장하는 방식으로 변경 → `backend/supabase/migrations/20260706075425_posts_created_mode_replaces_trigger.sql`.
- `voter_key` 노출 문제: `post_likes`/`lecture_feedback_votes`의 테이블 SELECT를 "본인 투표 행만" 조회 가능하도록 좁히고, 집계(개수)는 `voter_key` 없이 `post_likes_counts`/`lecture_feedback_votes_counts` 뷰로 따로 공개하는 것으로 결정. 같은 마이그레이션에서 `profiles`도 본인만 조회 가능하게 좁히고, `posts` 테이블 자체 SELECT는 회수해 `posts_public` 뷰(비익명 글만 `profiles.name` 조건부 노출)로만 조회하게 변경 → `backend/supabase/migrations/20260706093000_restrict_public_read_access.sql`, `DB_DESIGN.md`의 "RLS 정책"/"뷰" 섹션 참고.
- "해결된 게시글에 질문 답글이 달리면 자동 미해결 전환"과 status 트리거의 충돌 → `reopen_resolved_post_on_question_reply` 트리거(`AFTER INSERT on posts`)가 재귀 CTE로 트리 최상위 게시글을 찾아 자동 전환. `trg_block_status_change_by_non_lecturer`는 `app.bypass_status_lock` 트랜잭션 로컬 플래그가 켜져 있으면 통과하도록 수정(이건 `auth.uid()` 기반 검사라 `SECURITY DEFINER`로는 못 우회함). 반면 자동 전환 함수 자체는 `posts` 직접 SELECT가 회수돼 있고 이 UPDATE를 실행하는 수강생이 기존 RLS 어디에도 안 걸려서, 이건 `SECURITY DEFINER`로 우회 → `backend/supabase/migrations/20260706101235_reopen_resolved_post_on_question_reply.sql`, `20260706101723_reopen_resolved_post_security_definer.sql`.
- `profiles` 컬럼 이름을 단순화: `display_name` → `name`, `last_mode` → `mode`. `posts_public` 뷰와 체크 제약은 컬럼을 attnum으로 참조해 자동으로 따라가고, `handle_new_user()` 함수만 새 컬럼명에 맞춰 갱신 → `backend/supabase/migrations/20260706110000_profiles_rename_columns.sql`.
- 즐겨찾기(`my_nodes`)가 남의 수강생 모드 개인 정리 폴더까지 등록 가능했던 문제 발견 → 강의자 모드로 만든 노드만 즐겨찾기 가능하도록 `RESTRICTIVE` RLS 정책 추가, 더미 데이터도 이 규칙에 맞게 수정(B/C가 수강생 모드로 만들었던 "운영체제"/"수학" 폴더를 강의자 모드로 바꾸고 그 밑에 강의들을 옮김) → `backend/supabase/migrations/20260706122114_my_nodes_only_favorite_lecturer_mode.sql`.
