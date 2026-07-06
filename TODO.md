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
    - [7. 강의 폴더 트리 조회용 RPC (재귀 CTE)](#7-강의-폴더-트리-조회용-rpc-재귀-cte)
- [프론트엔드](#프론트엔드)
  - [guest_token 관련](#guest_token-관련-1)
    - [1. `guest_token` 생성/저장 및 `x-guest-token` 헤더 전송 구현](#1-guest_token-생성저장-및-x-guest-token-헤더-전송-구현)
- [해결된 것 (참고용 기록)](#해결된-것-참고용-기록)

## 백엔드

### guest_token 관련

#### 1. `guest_token` 무효화 조건 (강의 종료 후)

`posts_update_own`/`posts_delete_own`, `post_likes`/`lecture_feedback_votes` 관련 정책 전부에 "강의 종료 시각(`lectures.end_time`) 이후엔 `guest_token` 무효화" 조건이 아직 안 들어감.

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

#### 7. 강의 폴더 트리 조회용 RPC (재귀 CTE)

`nodes`는 `parent_id` 자기참조로 깊이 무제한 트리를 이루는데, Supabase의 기본 REST API(PostgREST)는 중첩 조회(`nodes(children:nodes(...))`) 시 요청마다 중첩 단계를 직접 지정해야 해서 "깊이 무제한" 요구사항엔 안 맞음. 재귀 CTE(`with recursive`)를 Postgres 함수로 감싸서 RPC로 노출해야 함 (예: `get_node_tree(root_id)`). 아직 함수/마이그레이션 미작성.

RPC 반환 형태는 두 가지 방식이 있음.

1. **평평한 행 목록 방식** — RPC 반환 타입을 `table(...)` 또는 `setof nodes`로 하고, 재귀 CTE 결과를 그대로 반환. 클라이언트는 `parent_id` 기준의 평평한 배열을 받아서 프론트/백엔드 쪽에서 트리로 재조립해야 함.
2. **중첩 JSON 트리 방식** — 반환 타입을 `jsonb`로 하고, 재귀 CTE 결과를 `jsonb_build_object`/`jsonb_agg`로 계층 구조로 조립해서 반환. 단, Postgres 재귀 CTE 안에서는 집계 함수를 바로 쓸 수 없어서, CTE 밖에서 별도로 재귀 조립 로직이 필요해 구현이 더 복잡함.

실무적으로는 방식 1(평평한 목록)이 더 흔히 쓰임. `lecture_id` 기준 `posts` 트리 조회도 `nodes`와 동일한 자기참조 구조이므로 같은 패턴을 적용 가능.

참고로 Supabase(PostgREST)를 쓰는 이상 클라이언트가 받는 응답은 RPC 반환 타입(`table`, `jsonb` 등)과 무관하게 항상 JSON으로 직렬화되어 옴 — 방식 1/2의 차이는 "JSON이냐 아니냐"가 아니라 "평평한 JSON 배열이냐, 이미 중첩된 JSON이냐"의 차이일 뿐임.

일반 테이블 select는 PostgREST의 `db-max-rows` 설정이 응답 행 수를 캡해주므로, RLS만으로도 "한 요청으로 테이블 전체 dump"는 기본적으로 막혀 있음 (이건 인가 문제지 리소스 문제가 아님). 반면 재귀 CTE로 트리를 순회하는 `get_node_tree` 같은 RPC는 얘기가 다름 — depth/범위를 제한하지 않으면 RLS 필터와 무관하게 쿼리 자체가 무거워질 수 있음. 따라서 이 RPC를 구현할 때는 다음을 함께 고려해야 함:

- `root_id`(또는 `lecture_id`) 파라미터를 필수로 받아 특정 서브트리로 범위를 한정
- 재귀 CTE 안에 최대 depth 제한 조건 추가 (예: `where depth < 20` 같은 가드)
- 필요시 반환 행 수에 `limit` 적용

`posts` 트리도 동일한 자기참조 구조라 같은 가드가 필요함.

## 프론트엔드

### guest_token 관련

#### 1. `guest_token` 생성/저장 및 `x-guest-token` 헤더 전송 구현

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
- `voter_key` 노출 문제: `post_likes`/`lecture_feedback_votes`의 테이블 SELECT를 "본인 투표 행만" 조회 가능하도록 좁히고, 집계(개수)는 `voter_key` 없이 `post_likes_counts`/`lecture_feedback_votes_counts` 뷰로 따로 공개하는 것으로 결정. 같은 마이그레이션에서 `profiles`도 본인만 조회 가능하게 좁히고, `posts` 테이블 자체 SELECT는 회수해 `posts_public` 뷰(비익명 글만 `profiles.display_name` 조건부 노출)로만 조회하게 변경 → `backend/supabase/migrations/20260706093000_restrict_public_read_access.sql`, `DB_DESIGN.md`의 "RLS 정책"/"뷰" 섹션 참고.
- "해결된 게시글에 질문 답글이 달리면 자동 미해결 전환"과 status 트리거의 충돌 → `reopen_resolved_post_on_question_reply` 트리거(`AFTER INSERT on posts`)가 재귀 CTE로 트리 최상위 게시글을 찾아 자동 전환. `trg_block_status_change_by_non_lecturer`는 `app.bypass_status_lock` 트랜잭션 로컬 플래그가 켜져 있으면 통과하도록 수정(이건 `auth.uid()` 기반 검사라 `SECURITY DEFINER`로는 못 우회함). 반면 자동 전환 함수 자체는 `posts` 직접 SELECT가 회수돼 있고 이 UPDATE를 실행하는 수강생이 기존 RLS 어디에도 안 걸려서, 이건 `SECURITY DEFINER`로 우회 → `backend/supabase/migrations/20260706101235_reopen_resolved_post_on_question_reply.sql`, `20260706101723_reopen_resolved_post_security_definer.sql`.
