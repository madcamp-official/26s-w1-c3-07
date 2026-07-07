# TODO

## 목차

- [🚨 posts UPDATE/DELETE가 SELECT 권한 부재로 항상 실패](#-posts-updatedelete가-select-권한-부재로-항상-실패-긴급)
- [🚨 강의자의 실시간 피드백 초기화가 조용히 0건 삭제됨](#-강의자의-실시간-피드백-초기화가-조용히-0건-삭제됨-긴급)
- [guest_token 관련](#guest_token-관련)
  - [1. `guest_token` 무효화 조건](#1-guest_token-무효화-조건-강의-종료-후)
- [AI 보조 기능 관련](#ai-보조-기능-관련)
  - [2. 유사도 검사 비교 대상 범위](#2-유사도-검사-비교-대상-범위-미해결-게시글만-답글도-포함)
  - [3. 유사도 비교를 위한 벡터 컬럼 추가 여부 결정](#3-유사도-비교를-위한-벡터-컬럼-추가-여부-결정)
  - [4. AI 보조 기능 서버 아키텍처 결정](#4-ai-보조-기능-서버-아키텍처-결정-edge-function-확정)
- [Realtime 관련](#realtime-관련)
  - [5. `max_participants`(최다 참여 인원) 강제 여부 결정](#5-max_participants최다-참여-인원-강제-여부-결정)
- [join_code 관련](#join_code-관련)
  - [6. `lecture_join_codes` 파기 시점/주체 결정](#6-lecture_join_codes-파기delete-시점주체-결정)
- [해결된 것 (참고용 기록)](#해결된-것-참고용-기록)

## 🚨 `posts` UPDATE/DELETE가 SELECT 권한 부재로 항상 실패 (긴급)

**증상**: 본인이 쓴 답글도 "수정하기" 버튼은 정확히 뜨는데(`is_mine` 판별은 정상), 실제로 수정을 시도하면 항상 실패함. 실브라우저(Playwright)로 재현 확인.

**원인**: `posts` UPDATE 요청이 `401 permission denied for table posts`(Postgres 코드 `42501`, hint: `GRANT SELECT ON public.posts TO anon`)로 거부됨. RLS 정책(`posts_update_own`)이나 `x-guest-token` 헤더 문제가 아님(둘 다 정상 동작 확인) — `posts` 테이블 자체의 SELECT 권한이 `anon`/`authenticated`에서 완전히 회수돼 있고(`revoke select on posts from anon, authenticated`) `posts`에 SELECT 정책도 전혀 없는 상태(전부 `posts_public` 뷰로 우회)라서, PostgreSQL이 UPDATE/DELETE의 `USING`/`WITH CHECK` 절을 평가하는 데 필요한 최소 SELECT 권한 자체가 없어 UPDATE/DELETE가 RLS 통과 여부와 무관하게 항상 막히는 것으로 추정됨.

**영향 범위**: `posts_update_own`/`posts_delete_own`/`posts_lecturer_update_status`/`posts_lecturer_delete`/`posts_update_lecturer_mode_matches_owner`를 쓰는 모든 경로(답글 수정, 글 삭제, 강의자 상태 전환·삭제) 전부 같은 이유로 실패할 가능성이 높음. 답글 수정만 실측했고 나머지는 미확인이나 근본 원인이 같으므로 함께 점검 필요.

**요청사항**: `posts`에 최소한의 SELECT GRANT를 다시 부여(`grant select on posts to anon, authenticated`)하되, 실제 조회 노출은 계속 RLS(SELECT 정책을 만들지 않거나 `using (false)`로 막아두기)로 제어. GRANT 자체를 회수하는 방식은 조회뿐 아니라 UPDATE/DELETE까지 함께 막아버림.

## 🚨 강의자의 실시간 피드백 초기화가 조용히 0건 삭제됨 (긴급)

**증상**: 강의자 계정으로 로그인해서 실시간 피드백 항목의 "반영 완료(초기화)" 버튼을 눌러도 좋아요/싫어요 개수가 그대로 남음. 에러 메시지는 전혀 뜨지 않음(버튼도 정상 클릭됨).

**재현 및 검증 과정**: 실제 강의자 계정(A, `6785527b-6fd4-4c61-b8ba-f1dcd0692c03`, 소유 강의 `f0000000-0000-0000-0000-000000000003`)으로 로그인해 브라우저 Network 탭에서 확인한 결과:
- `DELETE .../lecture_feedback_votes?lecture_id=eq...&feedback_type=eq.cold` 요청이 **204 No Content로 "성공"** 응답을 받음 (에러 없음)
- 하지만 `Prefer: return=representation`을 붙여 같은 요청을 재현하면 **실제로 삭제된 행이 0건**(빈 배열) — PostgREST는 매치되는 행이 0개여도 에러 없이 204를 반환하므로, 프론트 입장에서는 "성공"과 "조용한 무동작"을 구분할 수 없음
- Supabase SQL Editor에서 `service_role`로 직접 확인한 결과, 이 강의의 `cold` 피드백에 실제 투표 데이터가 존재하고(`voter_key: d0000000-...`, `value: 1`), `lecture_feedback_votes_lecturer_reset` 정책의 `exists(...)` 조건도 이 강의자 UUID로 **`true`**로 정상 평가됨(`pg_policies`로 정책 정의 자체도 확인, 오타나 논리 오류 없음)
- 그런데 `set local role authenticated`로 RLS가 적용되는 컨텍스트를 재현해서 **완전히 동일한 조건**(`lecture_feedback_votes_delete_own` OR `lecture_feedback_votes_lecturer_reset`의 `using`절 그대로)으로 SELECT하면 **0건**이 나옴 — 즉 `service_role`(RLS 우회)에서는 조건이 참인데, RLS가 적용되는 `authenticated` role 컨텍스트에서는 같은 조건이 거짓으로 평가됨
- `current_setting('request.headers', true)::json ->> 'x-guest-token'` 캐스팅이 헤더 부재 시 에러를 던지는지도 SQL Editor에서 별도 검증했으나 정상적으로 `null` 반환(이 가설은 배제됨)

**결론**: 프론트 코드·요청 헤더·정책 정의 자체엔 문제가 없음이 확인됐고, `authenticated` role + RLS 조합에서만 재현되는 문제로 좁혀짐(원인 미확정). Postgres 실행 로그(`statement:` 레벨)를 직접 봐야 정확한 원인을 확정할 수 있음 — 이 부분은 대시보드 UI 로그 탐색으로는 특정 요청을 찾기 까다로워 세션 내에서 완결하지 못함.

**요청사항**: 아래 SQL을 Supabase SQL Editor에서 실행해 재현해보고(DELETE 없이 SELECT로 안전하게 확인 가능), 실제로 0건이 나오는지, 나온다면 `auth.uid()`가 이 세션에서 기대한 값을 반환하는지부터 점검 필요.
```sql
set local role authenticated;
set local request.jwt.claims = '{"sub": "6785527b-6fd4-4c61-b8ba-f1dcd0692c03", "role": "authenticated"}';

select auth.uid(); -- 기대값: 6785527b-6fd4-4c61-b8ba-f1dcd0692c03 (이게 null이거나 다르면 원인 확정)

select *
from lecture_feedback_votes
where lecture_id = 'f0000000-0000-0000-0000-000000000003'
  and feedback_type = 'cold'
  and exists (
    select 1 from lectures join nodes on nodes.id = lectures.id
    where lectures.id = lecture_feedback_votes.lecture_id and nodes.created_by = auth.uid()
  );

reset role;
```
`auth.uid()`가 `null`로 나온다면, `set local request.jwt.claims`로 세션을 흉내낸 방식 자체가 `auth.uid()` 헬퍼가 기대하는 형식과 달라서 생긴 재현 아티팩트일 수 있음 — 이 경우 실제 PostgREST 요청 시점의 Postgres 로그(`statement:` 라인)를 직접 대조해야 함.

## guest_token 관련

### 1. `guest_token` 무효화 조건 (강의 종료 후)

`posts_update_own`/`posts_delete_own`, `post_likes`/`lecture_feedback_votes` 관련 정책 전부에 "강의 종료 시각(`lectures.end_time`) 이후엔 `guest_token` 무효화" 조건이 아직 안 들어감.

`posts.author_id`/`guest_token` 동시 null 허용 여부는 이미 결정·구현 완료(자세한 내용은 [해결된 것](#해결된-것-참고용-기록) 참고) — `posts_author_id_guest_token_exclusive` 체크 제약으로 "둘 다 값을 갖는 경우"만 막고, `(author_id is null and guest_token is null)` 상태(무효화된 비회원 글)는 그대로 허용됨. 아래는 여전히 미결정인 무효화 시점/방식 관련 검토 내용.

**관련해서 검토한 것들:**

- **무효화 구현 방식 두 가지**:
  1. **`pg_cron` 배치**: 주기적으로(예: 5~15분마다) `update posts set guest_token = null where guest_token is not null and lecture_id in (select node_id from lectures where end_time < now() - interval '1 hour')` 같은 걸 반복 실행. 멱등적이라 반복 실행해도 안전하지만, `pg_cron` 확장을 켜야 하고 폴링 주기만큼 무효화가 지연될 수 있음.
  2. **RLS 조건에 시각 비교를 직접 추가 (배치 job 불필요, 추천)**: 데이터를 지우지 않고 `posts_update_own`/`posts_delete_own`/`post_likes_*`/`lecture_feedback_votes_*` 정책의 `guest_token` 매칭 조건에 `now() < (해당 강의 end_time) + interval '1 hour'`를 추가. 매 요청 시점에 실제 시각으로 판단하니 지연 없이 정확하고, `pg_cron` 같은 별도 스케줄 인프라가 필요 없음.
  
  아직 어느 방식으로 갈지 결정 안 됨.

## AI 보조 기능 관련

### 2. 유사도 검사 비교 대상 범위 (미해결 게시글만? 답글도 포함?)

README엔 "글 작성 시(답글 포함) 미해결 게시글들과의 유사도 검사"라고 되어 있는데, 비교 대상이 미해결 게시글(최상위 글)들만인지 그 밑 답글 내용까지 포함할지 미정. 결정에 따라 유사도 검사 API가 LLM에 넘기는 데이터 범위가 달라짐.

### 3. 유사도 비교를 위한 벡터 컬럼 추가 여부 결정

원래 기획 단계에서는 세션당 질문 수가 적을 것으로 예상해 임베딩(pgvector) 대신 "기존 질문 목록을 프롬프트에 통째로 넣고 LLM이 판단"하는 방식으로 시작하기로 했음. `posts`에 `embedding vector` 컬럼 + pgvector 확장을 추가해서 임베딩 기반 유사도 검색으로 갈지, 아니면 계속 LLM 프롬프트 방식으로 갈지 아직 결정 안 됨. 강의당 질문 수가 예상보다 많아지면 프롬프트에 다 넣기엔 비효율적이라 재검토가 필요할 수 있음.

### 4. AI 보조 기능 서버 아키텍처 결정 (Edge Function 확정)

**Supabase Edge Function으로 확정.** 별도 Express 서버는 띄우지 않음. AI 교정/적절성 검사/유사 질문 탐지(#2, #3)와 글 제출 자체를 하나의 Edge Function(`submit-post`)으로 통합하는 설계를 [`SUBMIT_POST_PLAN.md`](./SUBMIT_POST_PLAN.md)에 정리함 — 요청/응답 계약, 5가지 결과 분기(정상 생성/적절성 거부/유사 질문 발견/교정 반환), 무상태(stateless) 설계 이유까지 확정.

이 설계의 핵심은 클라이언트가 검사를 우회해 `posts`에 직접 쓰지 못하게 막는 것 — **`posts` INSERT를 `anon`/`authenticated`에서 완전히 회수하고, 글 생성은 오직 `submit-post`(service_role, RLS 우회)를 통해서만 가능하도록 전환할 계획**. `service_role`은 `BYPASSRLS`라 REVOKE와 무관하게 계속 insert 가능. 기존 3개 더미 함수(`ai-correct`/`ai-moderate`/`ai-similarity`)는 삭제하고 `submit-post` 하나로 통합.

**아직 실제로 적용된 건 아님** — RLS 변경(`posts_insert_anyone`/`posts_insert_lecturer_mode_matches_owner` 삭제)도, `submit-post` 함수 코드도 아직 만들어서 push하지 않았음. 지금은 계획 단계이고, `posts` insert는 지금도 여전히 클라이언트가 직접 할 수 있음. UPDATE/DELETE 관련 RLS(글 수정/삭제)는 이번 변경 범위 밖이라 그대로 유지.

여전히 미결정: #2(유사도 비교 범위)/#3(벡터 컬럼 여부) — `submit-post`의 `checkSimilarity`는 지금 설계상 더미(항상 통과)라 이 결정이 늦어져도 프론트 연동에는 지장 없음.

## Realtime 관련

### 5. `max_participants`(최다 참여 인원) 강제 여부 결정

컬럼만 있고 실제 입장 제한 로직/참여자 카운트 테이블이 없음. 정보 표시용인지 실제 강제해야 하는지 확인 필요 (강제한다면 Realtime **Presence** 또는 별도 카운트 확인 로직 추가 필요, `DB_DESIGN.md`의 "실시간 접속자 수" 섹션 참고).

## join_code 관련

### 6. `lecture_join_codes` 파기(DELETE) 시점/주체 결정

강의 종료 시 자동으로 지울지(예: `pg_cron`), 강의자가 수동으로 파기하기 전까진 남겨둘지. 안 지워져도 입장 시 `lectures.end_time` 확인이 안전망이라 급한 이슈는 아님.

## 해결된 것 (참고용 기록)

- `posts.status`가 답글에는 항상 `null`이어야 하는 문제 → `check ((parent_id is null) = (status is not null))`로 해결.
- RLS 정책 전반 → `DB_DESIGN.md`의 "접근 제어 (RLS 정책 및 테이블 권한)" 섹션에 정리 완료.
- `posts`의 `check (author_id is not null or is_anonymous = true)`와 `author_id`의 `on delete set null` 충돌 → `trg_anonymize_posts_before_profile_delete` 트리거로 해결.
- Supabase 프로젝트 연결 및 초기 스키마 마이그레이션 적용 → `backend/supabase/migrations/20260705062713_init_schema.sql`.
- 강의자가 게시글 미해결↔해결됨 전환(`posts_lecturer_update_status`), 실시간 피드백 초기화(`feedback_lecturer_reset`), 게시글 status는 강의자만 변경 가능(`trg_block_status_change`), 강의자 글 삭제 권한(`posts_lecturer_delete`), `guest_token` 제외 공개 뷰(`posts_public`) → `backend/supabase/migrations/20260705064427_lecturer_permissions.sql`.
- 회원 탈퇴 버튼 + RPC(`delete_own_account`) → `backend/supabase/migrations/20260705090000_delete_own_account_rpc.sql`, `backend/test-frontend`에 반영. 탈퇴 시 cascade로 발동되는 `anonymize_posts_before_profile_delete` 트리거가 `search_path` 문제로 실패하던 버그는 `20260705132633_fix_anonymize_posts_search_path.sql`로 수정.
- `voter_key`(회원/비회원 겸용 단일 컬럼)를 `user_id`/`guest_token` 두 컬럼으로 분리하지 않고 현재 구조 그대로 유지하기로 결정. 회원 탈퇴 시에도 좋아요/피드백 투표 기록을 삭제하지 않고 그대로 보존하는 쪽을 택함 (자동 정리보다 기록 보존 우선).
- 강의자 게시글 작성 제한(`restrict_lecturer_post_rules` 트리거 + `x-mode` 헤더)을 `posts.created_mode` 컬럼 + 테이블 `check` 제약 + RLS 정책 조합으로 재설계. 강의를 만든 계정이 수강생 모드로 자기 강의에 들어오면 일반 수강생처럼 글을 쓸 수 있어야 하고, 동시에 화면에서 강의자/수강생 글을 색으로 구분해야 해서 그 순간의 모드를 글에 직접 저장하는 방식으로 변경 → `backend/supabase/migrations/20260706075425_posts_created_mode_replaces_trigger.sql`.
- `voter_key` 노출 문제: `post_likes`/`lecture_feedback_votes`의 테이블 SELECT를 "본인 투표 행만" 조회 가능하도록 좁히고, 집계(개수)는 `voter_key` 없이 `post_likes_counts`/`lecture_feedback_votes_counts` 뷰로 따로 공개하는 것으로 결정. 같은 마이그레이션에서 `profiles`도 본인만 조회 가능하게 좁히고, `posts` 테이블 자체 SELECT는 회수해 `posts_public` 뷰(비익명 글만 `profiles.name` 조건부 노출)로만 조회하게 변경 → `backend/supabase/migrations/20260706093000_restrict_public_read_access.sql`, `DB_DESIGN.md`의 "접근 제어 (RLS 정책 및 테이블 권한)"/"뷰" 섹션 참고.
- "해결된 게시글에 질문 답글이 달리면 자동 미해결 전환"과 status 트리거의 충돌 → `reopen_resolved_post_on_question_reply` 트리거(`AFTER INSERT on posts`)가 재귀 CTE로 트리 최상위 게시글을 찾아 자동 전환. `trg_block_status_change_by_non_lecturer`는 `app.bypass_status_lock` 트랜잭션 로컬 플래그가 켜져 있으면 통과하도록 수정(이건 `auth.uid()` 기반 검사라 `SECURITY DEFINER`로는 못 우회함). 반면 자동 전환 함수 자체는 `posts` 직접 SELECT가 회수돼 있고 이 UPDATE를 실행하는 수강생이 기존 RLS 어디에도 안 걸려서, 이건 `SECURITY DEFINER`로 우회 → `backend/supabase/migrations/20260706101235_reopen_resolved_post_on_question_reply.sql`, `20260706101723_reopen_resolved_post_security_definer.sql`.
- `profiles` 컬럼 이름을 단순화: `display_name` → `name`, `last_mode` → `mode`. `posts_public` 뷰와 체크 제약은 컬럼을 attnum으로 참조해 자동으로 따라가고, `handle_new_user()` 함수만 새 컬럼명에 맞춰 갱신 → `backend/supabase/migrations/20260706110000_profiles_rename_columns.sql`.
- 즐겨찾기(`my_nodes`)가 남의 수강생 모드 개인 정리 폴더까지 등록 가능했던 문제 발견 → 강의자 모드로 만든 노드만 즐겨찾기 가능하도록 `RESTRICTIVE` RLS 정책 추가, 더미 데이터도 이 규칙에 맞게 수정(B/C가 수강생 모드로 만들었던 "운영체제"/"수학" 폴더를 강의자 모드로 바꾸고 그 밑에 강의들을 옮김) → `backend/supabase/migrations/20260706122114_my_nodes_only_favorite_lecturer_mode.sql`.
- **트리 구조 데이터 조회(내 강의 페이지 / 강의 페이지)** — 서버에 물어봐야 하는 건 3가지: (1) 강의자 모드 "내 강의" 접속 시 내가 만든 모든 노드, (2) 수강생 모드 "내 강의" 접속 시 내가 만든 노드 + 즐겨찾기한 노드들의 서브트리, (3) 강의 페이지 접속 시 해당 `lecture_id`의 모든 `posts`. (1)·(3)은 평평한 필터 조회라 RPC 없이 프론트에서 직접 쿼리(`nodes.eq(created_by, userId).eq(created_mode, 'lecturer')`, `posts_public.eq(lecture_id, lectureId)`)하면 되고, (2)만 재귀가 필요해 RPC로 뺌.
  - 처음엔 `get_node_descendants(root_ids)` RPC로 즐겨찾기 서브트리를 가져온 뒤, `created`(내가 만든 노드) + 이 결과를 **하나의 `byId` Map으로 합쳐서** 중복 제거하고 트리를 조립하는 방식을 생각했으나, 검토 중 문제 발견: 폴더 A와 그 하위 강의 B를 각각 따로 즐겨찾기한 경우, B는 "A의 서브트리 안의 자손"이자 "B 자신의 즐겨찾기 루트"로 **두 자리에 각각 독립적으로 나타나야 하는데**, 전역 `id` 기준으로 합치면 하나로 뭉개져 버림(자기 자신을 즐겨찾기하는 경우엔 오히려 `created_mode` 필터 덕분에 겹칠 일이 없다는 것도 확인함).
  - 그래서 `get_node_descendants` 대신 `get_my_favorite_subtrees()` RPC로 교체: 즐겨찾기 루트(`my_nodes.node_id`)마다 재귀로 서브트리를 구하되, 결과 행마다 `anchor_node_id`(어느 즐겨찾기 루트에서 나온 행인지)를 태그하고, `union`이 아니라 `union all`로 중복 행을 일부러 유지. 프론트는 `anchor_node_id`로 그룹핑해서 즐겨찾기 루트별로 독립된 서브트리를 조립·렌더링하고(React `key`도 전역 `id`가 아니라 "어느 anchor에서 나온 사본인지"까지 포함해야 충돌 안 남), 서로 다른 anchor의 결과를 하나의 `byId` Map으로 합치지 않음. 즐겨찾기가 정리된 개인 폴더(`folder_id`)는 이 RPC에 안 담고, 프론트가 `my_nodes`를 직접 조회해서(RLS로 본인 행만 허용) 얻음.
  - 이 설계를 뒷받침하기 위해 두 가지 RLS/제약도 같이 정리: `nodes.parent_id`가 가리키는 부모와 `created_by`/`created_mode`가 항상 일치하도록 강제하는 `enforce_nodes_parent_ownership` 트리거(안 그러면 남의 트리 밑에 내 노드를 끼워 넣거나 내 강의자/수강생 모드 트리가 섞일 수 있었음), `my_nodes.folder_id`가 실제로 내가 수강생 모드로 만든 폴더인지 확인하는 `RESTRICTIVE` RLS 정책 → `backend/supabase/migrations/20260706150816_nodes_parent_ownership_mode_match.sql`, `20260706154459_my_nodes_folder_must_be_own_student_folder.sql`, `20260706154910_unify_my_nodes_policy_names.sql`, `20260706161208_get_my_favorite_subtrees_rpc.sql`.
  - Edge Function은 필요 없음(순수 DB 조회라 RPC로 완결). 프론트 요청 시점은 로그인 시 한꺼번에 받지 않고 모드 전환/페이지 진입 시점마다 그 모드에 맞는 것만 요청.
  - **프론트 구현 완료** — `frontend` 브랜치의 `services/api.ts`(`getCourseFolders`/`getStandaloneCourses`/`nodeToItem`/`buildFolderTree`/`buildFavoriteRoots`)가 위 설계 그대로 `nodes`/`favorites`/`get_my_favorite_subtrees()`를 실제로 조회하도록 구현됨.
  - 이 과정에서 남은 간극 두 가지 발견: (1) `Course.questionCount`(라벨은 "게시글 {n}개")가 아직 `0`으로 고정됨 → `posts_counts` 뷰(`lecture_id`별 `count(*)`) 추가로 해결(`backend/supabase/migrations/20260707023348_posts_counts_view.sql`). 다른 counts 뷰(`post_likes_counts` 등)와 달리 보안 목적이 아니라, PostgREST가 group by를 직접 지원 안 해서 여러 강의 개수를 한 번에 가져오기 위한 효율성 목적. **프론트 구현 완료** — `services/api.ts`의 `fillQuestionCounts()`가 트리 조립 후 `posts_counts`를 일괄 조회해 매핑(`findCourseByJoinCode()`의 단일 강의 조회 경로도 동일 처리). (2) `Course.participantCount`는 Presence 기반이라 이 트리 조회 시점엔 채울 수 없어 여전히 별도 설계 필요(미해결).
  - `date`/`startTime`/`endTime`/`location`/`capacity`(`lectures` 조인)는 `registered`(즐겨찾기) 강의에는 애초에 필요 없다고 결론남 — 그 값을 읽는 유일한 곳(강의 수정 폼 프리필)이 `owned` 강의에만 열려 있어서. `owned` 강의는 이미 `nodes.select('*, lectures(...))'`로 정상 조회 중이라 `get_my_favorite_subtrees()`에 조인을 추가할 필요 없음.
- `posts.author_id`/`guest_token` 동시 null 허용 여부 검토 → `posts_author_id_guest_token_exclusive` 체크 제약(`author_id is null or guest_token is null`) 추가로 해결. 이 제약이 생기면서 `posts_update_own`/`posts_delete_own` 정책의 `guest_token` 비교 조건 앞에 있던 `author_id is null and` 가드가 논리적으로 중복이 되어 함께 제거. `posts_public` 뷰에는 원본 식별자를 노출하지 않으면서 "본인 글인지"만 알려주는 `is_mine` boolean 컬럼 추가(수정/삭제 버튼 조건부 노출용) → `backend/supabase/migrations/20260707151700_posts_author_guest_token_exclusive.sql`, `20260707153000_drop_redundant_guest_token_guard.sql`, `20260707153500_posts_public_is_mine.sql`. **프론트 구현 완료** — `QuestionReply.isEditable`을 `posts_public.is_mine`으로 채움(`services/api.ts`). 처음엔 `getQuestionsFromDb()`의 `posts_public` 조회에 `x-guest-token` 헤더가 누락되어 있어서, 게스트가 방금 쓴 글에도 `is_mine`이 항상 `false`로 나와 수정 버튼이 안 뜨는 버그가 있었음 → `withGuestHeader()` 적용으로 수정.
- **`posts_public`에 `created_mode` 컬럼 추가** → 강의자가 쓴 답글을 화면에서 파란색으로 정확히 구분하는 데 필요(자세한 내용은 [SUPABASE_GUIDE.md 9번 항목](./SUPABASE_GUIDE.md#9-강의자수강생-모드-색-구분-posts_publiccreated_mode) 참고). **프론트 구현 완료** — `services/api.ts`의 `postAuthorRole()`이 이 컬럼을 직접 읽어 판별하도록 교체. 이전에는 뷰에 이 컬럼이 없어서 "실명 + 표시 이름이 강의 소유자 이름과 일치"라는 근사치를 썼었는데, 강의 소유자 실명 자체를 `profiles` RLS(본인만 SELECT 가능) 때문에 알아낼 수 없어 이 근사치가 사실상 항상 실패하고 있었음. 컬럼 추가로 근사치를 걷어내고 정확한 판별로 교체.
- **강의 공유 코드(`join_code`) 발급/재발급 RPC** — `lecture_join_codes`는 원래 클라이언트가 직접 INSERT하는 방식으로 설계돼 있었으나, `code`가 4자리 숫자(공간 10000개)라 다른 강의와 값이 겹칠 확률이 무시 못 할 수준이라 충돌 재시도 로직이 필요했음. `get_or_create_join_code()`(있으면 반환, 없으면 발급)/`reissue_join_code()`(기존 코드 폐기 후 재발급) RPC로 재시도 로직을 서버 쪽에 두고, 직접 쿼리로 발급/재발급을 못 하게 `lecture_join_codes`의 INSERT/UPDATE 테이블 권한 자체를 `anon`/`authenticated`에서 회수(파기/DELETE는 그대로 직접 쿼리 허용). 이 프로젝트는 `FORCE ROW LEVEL SECURITY`를 안 걸어놔서 `SECURITY DEFINER` 함수가 RLS를 우회하므로, "호출자가 이 강의의 소유자인가" 체크를 함수 안에 직접 재구현하고, 이제 도달 불가능해진 `lecture_join_codes_owner_all`(insert 전용, 이름도 `_all`이라 `for all` 정책처럼 오해될 수 있었음) 정책은 삭제 → `backend/supabase/migrations/20260707120000_join_code_issue_functions.sql`. `DB_DESIGN.md`/`README.md`/`SUPABASE_GUIDE.md`에도 반영(프론트 호출 패턴은 `SUPABASE_GUIDE.md`의 "강의 공유 코드" 섹션 참고). **프론트 구현 완료** — `services/api.ts`의 `getOrCreateJoinCode()`/`reissueJoinCode()`가 두 RPC를 감싸고, `ShareCourseModal.tsx`가 모달을 열 때 코드가 없으면 자동 발급 + "재발급" 버튼 제공.
- **`guest_token` 프론트 구현 완료** — `services/guestToken.ts`의 `getGuestToken()`이 `localStorage`(`qroom_guest_token` 키)에 최초 1회 UUID를 생성/저장하고 재사용. `services/api.ts`의 `withGuestHeader()` 헬퍼가 비회원 요청에만 `.setHeader('x-guest-token', ...)`을 붙이고, `posts` insert/update, `posts_public` 조회, `post_likes` insert/delete, `lecture_feedback_votes` select/insert/delete 전 경로에 적용됨.
