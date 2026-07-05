# TODO

## 목차

- [백엔드 (Supabase 스키마/RLS/트리거)](#백엔드-supabase-스키마rls트리거)
  - [5. 자동 미해결 전환과 3번 트리거의 충돌](#5-해결된-게시글에-질문-답글이-달리면-자동-미해결-전환과-3번-트리거의-충돌)
  - [7. `guest_token` 무효화 조건](#7-guest_token-무효화-조건-강의-종료-후)
  - [8. `lecture_join_codes` 파기 시점/주체 결정](#8-lecture_join_codes-파기delete-시점주체-결정)
  - [9. `voter_key` 노출 문제](#9-voter_key-노출-문제)
  - [10. `voter_key` 분리 방안](#10-voter_key-분리-방안-보류-중)
  - [11. `max_participants` 강제 여부 결정](#11-max_participants최다-참여-인원-강제-여부-결정)
  - [12. 유사도 검사 비교 대상 범위](#12-유사도-검사-비교-대상-범위-미해결-게시글만-답글도-포함)
  - [13. 유사도 비교를 위한 벡터 컬럼 추가 여부 결정](#13-유사도-비교를-위한-벡터-컬럼-추가-여부-결정)
- [프론트엔드](#프론트엔드)
  - [14. 비회원 익명 식별자(`guest_token`) 생성 로직](#14-비회원-익명-식별자guest_token-생성-로직)
  - [15. `x-guest-token` 커스텀 헤더를 실제로 보내는 구현](#15-x-guest-token-커스텀-헤더를-실제로-보내는-구현)
  - [16. `posts_public` 뷰로 조회 대상 전환](#16-posts_public-뷰로-조회-대상-전환)
  - [17. 강의자 강의 페이지에 글 삭제 버튼 추가](#17-강의자-강의-페이지에-글-삭제-버튼-추가)
  - [19. 닉네임(display_name) 수정 기능 추가](#19-닉네임display_name-수정-기능-추가)
- [해결된 것 (참고용 기록)](#해결된-것-참고용-기록)

## 백엔드 (Supabase 스키마/RLS/트리거)

### 5. "해결된 게시글에 질문 답글이 달리면 자동 미해결 전환"과 3번 트리거의 충돌

README 필수 기능("해결된 게시글에 대한 답글 작성 시 답글이 질문일 경우 다시 미해결로 이동")은 **수강생의 답글 INSERT**로 촉발되어 부모 게시글 `status`를 바꿔야 하는데, 3번의 "게시글 status는 강의자만" 트리거가 이걸 막아버림. 해결 방법 후보:

- 자동 전환 트리거를 `SECURITY DEFINER`로 만들어 검사를 우회하게 하거나
- `block_status_change_by_non_lecturer`에 "자동 전환 트리거에서 온 경우"는 예외로 허용하는 조건 추가(세션 플래그, 트리거 실행 순서 조정 등)

아직 설계 확정 필요.

### 7. `guest_token` 무효화 조건 (강의 종료 후)

`posts_update_own`/`posts_delete_own`, `post_likes`/`lecture_feedback_votes` 관련 정책 전부에 "강의 종료 시각(`lectures.end_time`) 이후엔 `guest_token` 무효화" 조건이 아직 안 들어감.

### 8. `lecture_join_codes` 파기(DELETE) 시점/주체 결정

강의 종료 시 자동으로 지울지(예: `pg_cron`), 강의자가 수동으로 파기하기 전까진 남겨둘지. 안 지워져도 입장 시 `lectures.end_time` 확인이 안전망이라 급한 이슈는 아님.

### 9. `voter_key` 노출 문제

`post_likes`/`lecture_feedback_votes`의 `voter_key`가 회원은 `user_id`를 그대로 쓰는데, 테이블 SELECT가 공개라 "누가 좋아요 눌렀는지"가 노출됨 — 문제 없다고 볼지, 익명화할지 확인 필요.

### 10. `voter_key` 분리 방안 (보류 중)

`voter_key`(회원/비회원 겸용 단일 컬럼)를 `user_id`(→`profiles(id)` FK) + `guest_token`(비회원용, FK 없음) 두 컬럼으로 분리하는 방안. 장점: 회원 탈퇴 시 좋아요/피드백 기록 자동 정리 가능, `posts.author_id`/`guest_token` 패턴과 통일. 단점: 부분 유니크 인덱스 2개 + 체크 제약 필요해서 복잡도 증가.

### 11. `max_participants`(최다 참여 인원) 강제 여부 결정

컬럼만 있고 실제 입장 제한 로직/참여자 카운트 테이블이 없음. 정보 표시용인지 실제 강제해야 하는지 확인 필요 (강제한다면 Presence 또는 별도 카운트 확인 로직 추가 필요).

### 12. 유사도 검사 비교 대상 범위 (미해결 게시글만? 답글도 포함?)

README엔 "글 작성 시(답글 포함) 미해결 게시글들과의 유사도 검사"라고 되어 있는데, 비교 대상이 미해결 게시글(최상위 글)들만인지 그 밑 답글 내용까지 포함할지 미정. 결정에 따라 유사도 검사 API(백엔드 Express)가 LLM에 넘기는 데이터 범위가 달라짐.

### 13. 유사도 비교를 위한 벡터 컬럼 추가 여부 결정

원래 기획 단계에서는 세션당 질문 수가 적을 것으로 예상해 임베딩(pgvector) 대신 "기존 질문 목록을 프롬프트에 통째로 넣고 LLM이 판단"하는 방식으로 시작하기로 했음. `posts`에 `embedding vector` 컬럼 + pgvector 확장을 추가해서 임베딩 기반 유사도 검색으로 갈지, 아니면 계속 LLM 프롬프트 방식으로 갈지 아직 결정 안 됨. 강의당 질문 수가 예상보다 많아지면 프롬프트에 다 넣기엔 비효율적이라 재검토가 필요할 수 있음.

## 프론트엔드

### 14. 비회원 익명 식별자(`guest_token`) 생성 로직

정확히 언제/어떻게 생성하는지(강의 최초 입장 시 1회 생성 등) 확정 필요. `localStorage`에 저장하고 재사용.

### 15. `x-guest-token` 커스텀 헤더를 실제로 보내는 구현

`posts`, `post_likes`, `lecture_feedback_votes` 관련 요청을 보낼 때마다 이 헤더를 실어 보내도록 구현 (supabase-js 클라이언트에 요청별 커스텀 헤더 설정).

### 16. `posts_public` 뷰로 조회 대상 전환

`posts_public` 뷰는 이미 만들어져 있음(`backend/supabase/migrations/20260705064427_lecturer_permissions.sql`, "해결된 것" 참고). 프론트에서 `posts` 테이블이 아니라 이 뷰를 조회하도록 변경하는 작업만 남음.

### 17. 강의자 강의 페이지에 글 삭제 버튼 추가

README 기능명세서(강의자 - 강의 페이지, "부적절한 글 삭제")에 대응하는 UI가 아직 없음 (백엔드 `posts_lecturer_delete` 정책은 이미 반영 완료, "해결된 것" 참고).

### 19. 닉네임(display_name) 수정 기능 추가

회원가입(Google OAuth) 시 `handle_new_user` 트리거가 구글 계정 이름(`full_name`/`name`)을 `profiles.display_name`에 자동으로 채워주는데, 이후 사용자가 원하는 닉네임으로 직접 바꿀 수 있는 UI가 아직 없음. 백엔드는 이미 `profiles_update_self` 정책으로 본인 수정이 허용되어 있으니, 프론트에서 설정 화면에 닉네임 수정 폼만 추가하면 됨.

## 해결된 것 (참고용 기록)

- `posts.status`가 답글에는 항상 `null`이어야 하는 문제 → `check ((parent_id is null) = (status is not null))`로 해결.
- RLS 정책 전반 → `DB_SCHEMA.md`의 "RLS 정책" 섹션에 정리 완료.
- `nodes.id`만 쓸 경우 "링크 유출 시 재발급 불가능"하다는 한계 → `lecture_join_codes` 테이블(4자리 숫자, 발급/재발급/파기 가능) 추가로 해결.
- `posts`의 `check (author_id is not null or is_anonymous = true)`와 `author_id`의 `on delete set null` 충돌 → `trg_anonymize_posts_before_profile_delete` 트리거로 해결.
- Supabase 프로젝트 연결 및 초기 스키마 마이그레이션 적용 → `backend/supabase/migrations/20260705062713_init_schema.sql`.
- 강의자가 게시글 미해결↔해결됨 전환(`posts_lecturer_update_status`), 실시간 피드백 초기화(`feedback_lecturer_reset`), 게시글 status는 강의자만 변경 가능(`trg_block_status_change`), 강의자 글 삭제 권한(`posts_lecturer_delete`), `guest_token` 제외 공개 뷰(`posts_public`) → `backend/supabase/migrations/20260705064427_lecturer_permissions.sql`.
- 회원 탈퇴 버튼 + RPC(`delete_own_account`) → `backend/supabase/migrations/20260705090000_delete_own_account_rpc.sql`, `backend/test-frontend`에 반영. 탈퇴 시 cascade로 발동되는 `anonymize_posts_before_profile_delete` 트리거가 `search_path` 문제로 실패하던 버그는 `20260705132633_fix_anonymize_posts_search_path.sql`로 수정.
