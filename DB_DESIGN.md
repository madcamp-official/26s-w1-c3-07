# DB 설계

## 목차

- [스키마 개요](#스키마-개요)
- [SQL](#sql)
  - [타입](#타입)
  - [테이블](#테이블)
    - [`profiles`](#profiles)
    - [`nodes`](#nodes)
    - [`favorites`](#favorites)
    - [`lectures`](#lectures)
    - [`lecture_join_codes`](#lecture_join_codes)
    - [`lecture_feedback_votes`](#lecture_feedback_votes)
    - [`posts`](#posts)
    - [`post_drafts`](#post_drafts)
    - [`post_likes`](#post_likes)
  - [뷰](#뷰)
    - [`lectures_public`](#lectures_public)
    - [`lecture_feedback_votes_counts`](#lecture_feedback_votes_counts)
    - [`posts_public`](#posts_public)
    - [`posts_counts`](#posts_counts)
    - [`post_likes_counts`](#post_likes_counts)
  - [트리거 함수](#트리거-함수)
    - [`block_status_change_by_non_lecturer()`](#block_status_change_by_non_lecturer)
    - [`set_resolved_at_on_status_change()`](#set_resolved_at_on_status_change)
    - [`unresolve_post_on_question_reply()`](#unresolve_post_on_question_reply)
    - [`enforce_nodes_parent_rules()`](#enforce_nodes_parent_rules)
    - [`handle_new_user()`](#handle_new_user)
    - [실시간 갱신용 Broadcast 트리거 5종](#실시간-갱신용-broadcast-트리거-5종)
  - [RPC 함수](#rpc-함수)
    - [`delete_own_account()`](#delete_own_account)
    - [`get_my_favorite_subtrees()`](#get_my_favorite_subtrees)
    - [`get_or_create_join_code()`](#get_or_create_join_code)
    - [`reissue_join_code()`](#reissue_join_code)
    - [`get_similarity_candidates()`](#get_similarity_candidates)
  - [접근 제어 (RLS 정책 및 테이블 권한)](#접근-제어-rls-정책-및-테이블-권한)
    - [`profiles`](#profiles-1)
    - [`nodes`](#nodes-1)
    - [`favorites`](#favorites-1)
    - [`lectures`](#lectures-1)
    - [`lecture_join_codes`](#lecture_join_codes-1)
    - [`lecture_feedback_votes`](#lecture_feedback_votes-1)
    - [`posts`](#posts-1)
    - [`post_likes`](#post_likes-1)
  - [예약 작업 (pg_cron)](#예약-작업-pg_cron)
- [Edge Function](#edge-function)
- [설계 노트](#설계-노트)
  - [테이블 관계 및 트리 구조](#테이블-관계-및-트리-구조)
  - [삭제 전파 (cascade)](#삭제-전파-cascade)
  - [정책·트리거·뷰 보완 설명](#정책트리거뷰-보완-설명)
- [실시간 접속자 수 (강의별)](#실시간-접속자-수-강의별)
- [비회원 익명 식별자: `guest_token`](#비회원-익명-식별자-guest_token-여러-기능에서-공용으로-사용)
- [배포 현황](#배포-현황)

## 스키마 개요

| 테이블/뷰 | 대응하는 기능 |
|---|---|
| `profiles` | 회원(Google OAuth) 부가정보 |
| `nodes` | 강의 폴더 + 강의 통합 트리 |
| `favorites` | "내 강의" 즐겨찾기 (수강생 모드) |
| `lectures` | 강의의 부가 속성 (시작/종료 시각, 장소, 최대인원) — 입장은 `nodes.id`(UUID)를 URL/QR로 사용 |
| `lecture_join_codes` | 강의 입장용 4자리 숫자 코드 (발급/재발급/파기 가능, 즐겨찾기 등록용 코드와는 별개). 발급/재발급은 `get_or_create_join_code()`/`reissue_join_code()` RPC로만 가능 |
| `lecture_feedback_votes` | 실시간 피드백(추워요/더워요/소리 작아요/잘 안 보여요) 좋아요/싫어요 |
| `posts` | 게시글 + 답글 통합 트리, 질문/의견 타입, 미해결/해결, 비회원 인증(`guest_token`) |
| `post_drafts` | `submit-post`(service_role) 전용 스크래치 테이블. 유사 질문 발견 시 최종 제출본을 임시 저장해뒀다가 강행 제출 시 `posts`로 옮김 — `anon`/`authenticated`는 GRANT/RLS 둘 다 없어서 접근 불가 |
| `post_likes` | 게시글/답글 좋아요 |
| `lectures_public` (뷰) | `lectures`+`nodes`+`profiles`를 조인해 강의 제목/일시/장소와 강의자 이름(`lecturer_name`)을 한 번에 보여주는 공개 조회용 뷰. `profiles`가 본인만 SELECT 가능해서 막혀 있던 강의자 이름을 이 뷰로 우회 노출 |
| `lecture_feedback_votes_counts` (뷰) | `lecture_feedback_votes`에서 `voter_key` 없이 강의·피드백 유형별 좋아요/싫어요 개수만 집계한 공개 조회용 뷰 |
| `posts_public` (뷰) | `posts`에서 `guest_token`/`author_id`를 뺀 공개 조회용 뷰(비익명 글만 작성자 이름 노출). 프론트는 `posts` 대신 이 뷰를 조회 |
| `posts_counts` (뷰) | `posts`를 `lecture_id`별로 `count(*)`한 게시글 개수 집계 뷰. `posts_public`처럼 숨길 값이 있어서가 아니라, 여러 강의의 개수를 한 번의 요청으로 가져오기 위한 효율성 목적 |
| `post_likes_counts` (뷰) | `post_likes`에서 `voter_key` 없이 게시글별 좋아요 개수만 집계한 공개 조회용 뷰 |

## SQL

### 타입

#### `user_mode`

`profiles.mode`/`nodes.created_mode`/`posts.created_mode`/`post_drafts.created_mode` 네 컬럼이 전부 "강의자 아니면 수강생" 값을 갖는데, 원래는 각 테이블마다 `text` + `check (... in ('lecturer', 'student'))`로 따로 강제하고 있었습니다. 같은 값 목록을 컬럼마다 중복 서술하는 대신 enum 타입 하나로 통일했습니다 — 값 목록이 타입 레벨에서 강제되므로 개별 `check` 제약이 필요 없어집니다.

```sql
create type user_mode as enum ('lecturer', 'student');
```

값 추가/삭제가 `check` 제약보다 번거롭다는 트레이드오프가 있습니다(`alter type ... add value`로 추가는 되지만 삭제는 직접 지원 안 해서 타입을 새로 만들고 컬럼을 마이그레이션해야 함). 다만 이 두 값은 앞으로도 바뀔 일이 없다고 보여 이 프로젝트엔 적합하다고 판단했습니다. PostgREST/`supabase-js`로 조회하면 다른 문자열 컬럼과 똑같이 평범한 문자열(`"lecturer"`/`"student"`)로 직렬화되어 프론트 쪽 타입/코드는 그대로 둬도 됩니다.

### 테이블

#### `profiles`

Supabase Auth 사용자(`auth.users`)를 확장하는 회원 부가정보 테이블입니다. `id`가 `auth.users(id)`를 그대로 참조하며 `on delete cascade`라 회원 탈퇴 시 프로필도 함께 삭제됩니다. `mode`는 로그인 시 자동으로 진입할 모드(강의자/수강생)를 저장합니다.

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  mode user_mode not null default 'student'
);
```

#### `nodes`

강의 폴더와 강의를 하나의 트리로 묶는 핵심 테이블로, `parent_id`가 자기 자신을 참조해 깊이 제한 없는 트리를 이룹니다. 폴더를 삭제하면 `on delete cascade`로 하위 노드가 재귀적으로 전부 삭제됩니다. `created_by`는 만든 사람이 탈퇴해도 `on delete set null`이라 강의/폴더 자체는 유지되고 작성자 정보만 사라집니다. `created_mode`는 같은 계정이 강의자/수강생 어느 모드에서 만들었는지를 구분하며, `nodes_lecture_requires_lecturer_mode` 제약(`check (type <> 'lecture' or created_mode = 'lecturer')`)으로 강의(`lecture`)는 항상 강의자 모드에서만 만들어지도록 강제합니다. `created_at`은 기본 정렬 기준(생성 시각순)이고, 수동 정렬 기능이 추가되면 그때 `position` 컬럼을 별도로 추가할 계획입니다.

```sql
create table nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references nodes(id) on delete cascade,
  type text not null,
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_mode user_mode not null,
  created_at timestamptz default now(),
  constraint nodes_type_valid check (type in ('folder', 'lecture')),
  constraint nodes_lecture_requires_lecturer_mode check (type <> 'lecture' or created_mode = 'lecturer')
);
```

#### `favorites`

"내 강의" 즐겨찾기(수강생 모드) 기록입니다. `user_id`는 탈퇴 시 `on delete cascade`로 내 즐겨찾기 목록도 함께 삭제됩니다. `node_id`는 즐겨찾기 대상(남이 만든 강의 또는 강의 폴더)이고, 대상이 삭제되면 즐겨찾기 기록도 같이 삭제됩니다. `anchor_id`는 이 즐겨찾기를 정리해둔 내 개인 폴더로, 그 폴더가 삭제되면 안에 정리된 즐겨찾기 기록도 함께 삭제됩니다.

```sql
create table favorites (
  user_id uuid references profiles(id) on delete cascade,
  node_id uuid references nodes(id) on delete cascade,
  anchor_id uuid references nodes(id) on delete cascade,
  primary key (user_id, node_id)
);
```

#### `lectures`

강의(`nodes.type = 'lecture'`)의 부가 속성을 담는 1:1 테이블로, `id`가 `nodes(id)`를 그대로 참조합니다. 입장 URL/QR은 별도 코드 없이 이 `id`(=`nodes.id`, UUID)를 그대로 사용하고(`/join/<id>`), 같은 `id`를 "즐겨찾기 등록 코드"로도 재사용합니다(강의뿐 아니라 강의 폴더도 이 코드로 `favorites`에 등록 가능). `max_participants`는 미설정(`null`) 또는 0 이상만 허용하고, `end_time`은 반드시 `start_time`보다 늦어야 합니다.

```sql
create table lectures (
  id uuid primary key references nodes(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location text,
  max_participants int,
  constraint lectures_max_participants_non_negative check (max_participants is null or max_participants >= 0),
  constraint lectures_end_after_start check (end_time > start_time)
);
```

#### `lecture_join_codes`

강의 입장 전용 4자리 숫자 코드로, 즐겨찾기 등록용 `id` 코드와는 별개입니다. 필요할 때 발급(INSERT)하고 안 쓰면 파기(DELETE)하는 방식이라, 시간이 안 겹치면 다른 강의가 같은 번호를 바로 재사용할 수 있습니다. `lecture_id`는 `unique` 제약으로 강의당 활성 코드가 1개만 존재하도록 합니다. 발급/재발급은 [`get_or_create_join_code()`](#get_or_create_join_code)/[`reissue_join_code()`](#reissue_join_code) RPC로만 가능합니다(자세한 이유는 해당 함수 설명 참고).

```sql
create table lecture_join_codes (
  code text primary key,
  lecture_id uuid not null unique references lectures(id) on delete cascade,
  issued_at timestamptz default now(),
  constraint lecture_join_codes_code_valid check (code ~ '^[0-9]{4}$')
);
```

#### `lecture_feedback_votes`

실시간 피드백(추워요/더워요/소리 작아요/잘 안 보여요)의 좋아요/싫어요를 기록합니다. PK에 `value`까지 포함시켜, 한 사람이 같은 `feedback_type`에 좋아요/싫어요를 동시에 독립적으로 누를 수 있게 합니다(`voter_key`만으로 PK를 잡으면 둘 중 하나만 가능해짐). 좋아요/싫어요 개수는 각각 `count(*) filter (where value = 1)`/`count(*) filter (where value = -1)`로 집계해 화면에 따로 표시하고, 4개 피드백 유형을 정렬할 때는 `sum(value)`(좋아요 - 싫어요 순수 점수)를 기준으로 사용합니다. 강의자가 "초기화"를 누르면 해당 `lecture_id`의 행을 전부 삭제합니다.

```sql
create table lecture_feedback_votes (
  lecture_id uuid references lectures(id) on delete cascade,
  feedback_type text not null,
  voter_key uuid not null,
  value smallint not null,
  primary key (lecture_id, feedback_type, voter_key, value),
  constraint lecture_feedback_votes_feedback_type_valid check (feedback_type in ('cold', 'hot', 'quiet', 'unclear')),
  constraint lecture_feedback_votes_value_valid check (value in (1, -1))
);
```

#### `posts`

게시글과 답글을 하나로 통합한 자기참조 트리로, `parent_id`가 `null`이면 최상위 게시글, 값이 있으면 답글입니다(무한 depth). 최상위 글을 삭제하면 답글도 `on delete cascade`로 재귀 삭제됩니다. `author_id`는 비회원이면 `null`이고, 회원이 탈퇴해도 `on delete set null`로 글은 남고 작성자 정보만 사라집니다 — 이때 `is_anonymous`는 건드리지 않고 원래 값 그대로 둡니다(자세한 이유는 아래 CHECK 제약 설명과 "정책·트리거·뷰" 절 참고). `guest_token`은 비회원 글 수정/삭제 인증용인 `uuid`이며(`crypto.randomUUID()`로 생성, 자세한 이유는 아래 "비회원 익명 식별자" 절 참고), 강의가 끝나도 무효화하지 않고 영구 보존합니다 — 왜 무효화가 필요 없는지는 아래 CHECK 제약 설명 참고. `status`는 최상위 게시글만 사용(답글은 `null`)하고, `resolved_at`은 해결됨으로 바뀐 시각으로 해결된 게시글 정렬 기준이며 미해결로 되돌아가면 다시 `null` 처리됩니다. `created_mode`는 강의자 모드/수강생 모드 중 어느 화면에서 썼는지를 저장해 화면에서 색을 구분하는 데 쓰며, 값 목록은 `check` 제약이 아니라 [`user_mode` 타입](#user_mode) 자체로 강제됩니다. `type`/`status`의 값 목록을 제한하는 단순 열거형 제약(`posts_type_valid`/`posts_status_valid`) 외에, 여러 컬럼을 함께 보는 여섯 개의 `check` 제약은 각각:
- `posts_guest_must_be_anonymous`: `guest_token`이 있는 글(=진짜 비회원 글)은 반드시 익명이어야 함. 원래는 "작성자(`author_id`)가 없으면 무조건 익명"이었는데, 이러면 탈퇴한 회원의 실명 글까지 이 제약에 걸려버려서(아래 참고) `guest_token` 기준으로 좁혔습니다.
- `posts_status_matches_top_level`: 최상위 게시글은 `status` 필수·답글은 `status` 필수 `null`
- `posts_lecturer_mode_reply_opinion_only`: 강의자 모드로 쓴 글은 답글+`opinion` 타입만 가능
- `posts_resolved_at_matches_status`: `resolved`일 때만 `resolved_at`이 존재하도록 양방향 강제
- `posts_author_id_guest_token_not_both_set`: `author_id`와 `guest_token`이 동시에 값을 갖지는 못하게 막음(둘 다 `null`인 상태는 허용). 한때 "정확히 하나만 값을 가짐"(XOR)으로 강화했다가, 회원 탈퇴 시 `author_id`가 `null`이 되면서 `guest_token`(원래도 `null`)과 함께 "둘 다 `null`"인 상태가 정상적으로 발생해야 한다는 게 드러나 다시 완화했습니다(`guest_token` 자체를 지우는 무효화 로직을 다시 쓰는 건 아님 — 왜 무효화가 필요 없는지는 [TODO.md](./TODO.md#해결된-것-참고용-기록) 참고).
- `posts_lecturer_mode_not_anonymous`: 강의자 모드로 쓴 글(`created_mode = 'lecturer'`)은 반드시 실명(`is_anonymous = false`)이어야 함. `created_mode`는 `author_id`와 별개 컬럼이라 회원 탈퇴로 `author_id`가 `null`이 돼도 그대로 남고, 탈퇴해도 `is_anonymous`를 건드리지 않기로 한 위 결정 덕분에 탈퇴 여부와 무관하게 항상 성립하는 제약이라 안전하게 추가할 수 있었습니다.

```sql
create table posts (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references lectures(id) on delete cascade,
  parent_id uuid references posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  is_anonymous boolean not null default true,
  guest_token uuid,
  type text not null,
  status text,
  resolved_at timestamptz,
  content text not null,
  created_at timestamptz default now(),
  created_mode user_mode not null default 'student',
  constraint posts_type_valid check (type in ('question', 'opinion')),
  constraint posts_status_valid check (status in ('unresolved', 'resolved')),
  constraint posts_guest_must_be_anonymous check (guest_token is null or is_anonymous = true),
  constraint posts_status_matches_top_level check ((parent_id is null) = (status is not null)),
  constraint posts_lecturer_mode_reply_opinion_only check (created_mode <> 'lecturer' or (parent_id is not null and type = 'opinion')),
  constraint posts_resolved_at_matches_status check ((status = 'resolved') = (resolved_at is not null)),
  constraint posts_author_id_guest_token_not_both_set check (author_id is null or guest_token is null),
  constraint posts_lecturer_mode_not_anonymous check (created_mode <> 'lecturer' or is_anonymous = false)
);
```

**탈퇴한 회원이 실명으로 쓴 글은 어떻게 되는가**: `author_id`가 `on delete set null`로 `null`이 되지만 `is_anonymous`는 그대로 `false`로 남습니다. `is_anonymous = false`인 행은 `posts_guest_must_be_anonymous` 제약 때문에 `guest_token`이 항상 `null`이라(비회원 글이 아니라는 뜻), "`author_id`도 `guest_token`도 `null`인데 `is_anonymous`가 `false`"인 상태는 오직 탈퇴한 회원의 실명 글에서만 나올 수 있습니다. `posts_public` 뷰에서는 이 상태가 `author_display_name is null`(조인 대상 프로필이 없으므로)이면서 `is_anonymous = false`인 행으로 그대로 드러나므로, 프론트는 이 조합을 "탈퇴한 계정입니다"로 표시하면 됩니다. 원래는 `profiles` 삭제 직전(`BEFORE DELETE`)에 `anonymize_posts_before_profile_delete()` 트리거가 해당 작성자의 글을 전부 `is_anonymous = true`로 강제 변경해서 이 문제를 우회했지만, 그러면 실명 글까지 전부 "익명"으로 뭉개져서 탈퇴 사실 자체를 구분할 수 없었기 때문에 이 트리거는 삭제했습니다(자세한 배경은 배포 현황의 `20260708130000_posts_deleted_author_placeholder.sql` 항목 참고).

#### `post_drafts`

`submit-post` Edge Function이 유사 질문을 발견했을 때 최종 제출본을 잠깐 저장해두는 스크래치 테이블입니다. 사용자가 "강행 제출"을 누르면 이 행 내용 그대로 `posts`에 옮기고 삭제하며(옮길 때 `created_at`은 이 테이블의 스테이징 시각이 아니라 강행 제출한 실제 시점으로 새로 채워짐), "보러 가기"/"취소"를 누르면 아무 것도 안 해도 됩니다 — `posts`에 반영되는 것도, 누구에게 노출되는 것도 아니라 고아로 남아도 무해하고, 필요하면 나중에 `created_at` 기준 오래된 것만 가끔 청소하면 됩니다. `anon`/`authenticated`에게 GRANT/RLS 정책이 둘 다 없어서(RLS는 켜져 있지만 정책이 0개라 기본 거부), `submit-post`(`service_role`)만 접근할 수 있습니다.

```sql
create table post_drafts (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references lectures(id) on delete cascade,
  parent_id uuid references posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  is_anonymous boolean not null,
  guest_token uuid,
  type text not null,
  content text not null,
  created_mode user_mode not null,
  created_at timestamptz not null default now(),
  constraint post_drafts_type_valid check (type in ('question', 'opinion'))
);

alter table post_drafts enable row level security;
revoke all on post_drafts from anon, authenticated;
```

#### `post_likes`

게시글/답글 공용 좋아요이며, PK로 중복 투표를 방지합니다. `voter_key`는 회원이면 `auth.uid()`, 비회원이면 `guest_token`을 사용합니다(생성 방법은 아래 "비회원 익명 식별자" 절 참고).

```sql
create table post_likes (
  post_id uuid references posts(id) on delete cascade,
  voter_key uuid not null,
  primary key (post_id, voter_key)
);
```

### 뷰

#### `lectures_public`

강의실 페이지에서 강의 제목/일시/장소와 강의자 이름을 한 번에 보여주기 위한 뷰입니다. `profiles`는 본인만 SELECT 가능(RLS)이라, 강의를 만든 본인이 아닌 사람(다른 강의자/수강생/비회원)이 강의실에 들어왔을 때는 `profiles.name`을 직접 조회할 수 없어 강의자 이름을 알 수 없는 문제가 있었습니다. `posts_public`이 `author_display_name`을 노출하는 것과 같은 원리로, 뷰는 조회자가 아니라 **뷰 소유자 권한**으로 실행되기 때문에 이 뷰 안에서는 `profiles`를 조인해도 RLS에 걸리지 않습니다. `lectures`/`nodes`가 이미 전체 공개라 이 뷰도 별도 RLS나 REVOKE 없이 기본 공개 SELECT 권한으로 충분합니다. `created_by`가 탈퇴 등으로 `null`이 되거나 `profiles.name`이 없는 경우 `lecturer_name`은 `null`이 되므로, 프론트에서 기본값 문자열로 폴백 처리해야 합니다.

```sql
create view lectures_public as
select
  l.id,
  l.start_time,
  l.end_time,
  l.location,
  l.max_participants,
  n.name as title,
  n.created_by,
  p.name as lecturer_name
from lectures l
join nodes n on n.id = l.id
left join profiles p on p.id = n.created_by;
```

#### `lecture_feedback_votes_counts`

`lecture_feedback_votes`도 마찬가지로 테이블 자체 SELECT는 본인 투표 행만 가능하도록 좁혀서(아래 [RLS 정책 → `lecture_feedback_votes`](#lecture_feedback_votes-1) 참고), `voter_key` 없이 강의·피드백 유형별 좋아요/싫어요 개수만 집계해 공개합니다.

```sql
create view lecture_feedback_votes_counts as
select
  lecture_id,
  feedback_type,
  count(*) filter (where value = 1) as like_count,
  count(*) filter (where value = -1) as dislike_count
from lecture_feedback_votes
group by lecture_id, feedback_type;
```

#### `posts_public`

`posts`는 테이블 자체 SELECT 권한이 없어(아래 [RLS 정책 → `posts`](#posts-1) 참고) 이 뷰로만 조회할 수 있습니다. `guest_token`은 완전히 제외하고, `author_id`(uid)도 통째로 숨긴 뒤 `is_anonymous`가 `false`인 글만 `profiles.name`을 조인해서 보여줍니다. `is_mine`은 원본 식별자(`author_id`/`guest_token`)를 노출하지 않으면서 "이 글이 내가 쓴 글인지"만 boolean으로 계산해서 얹은 컬럼으로, 프론트가 수정/삭제 버튼을 조건부로 노출할 때 씁니다. `author_id = auth.uid()`(회원)이거나 `guest_token = x-guest-token 헤더`(비회원, `guest_token`이 `uuid` 타입이라 헤더 값을 `::uuid`로 캐스팅해서 비교)이면 `true`이고, 실제 쓰기 권한(`posts_update_own`/`posts_delete_own`)과 정확히 같은 조건이라 "버튼은 보이는데 실제로는 막히는" 불일치가 없습니다. `coalesce(..., false)`로 감싼 이유는, 예를 들어 게스트가 회원 글을 볼 때 `author_id = auth.uid()`가 `uuid = null` 비교라 `false`가 아니라 `null`이 되는 등 SQL 3진 논리상 결과가 `null`이 될 수 있어서, 이를 명시적으로 `false`로 정리하지 않으면 `is_mine`이 `null`/`true`/`false` 세 상태를 갖게 되기 때문입니다. `created_mode`는 강의자 모드로 쓴 글(답글, 청록색 표시)과 수강생 모드로 쓴 글을 프론트가 구분해서 표시하는 데 필요한데, 이 뷰가 `posts.created_mode` 컬럼이 생기기 전에 먼저 만들어진 뒤로 이후의 재생성들에서 계속 빠져 있다가 뒤늦게 추가되었습니다.

```sql
create view posts_public as
select
  p.id,
  p.lecture_id,
  p.parent_id,
  case when p.is_anonymous then null else pr.name end as author_display_name,
  p.is_anonymous,
  p.type,
  p.status,
  p.resolved_at,
  p.content,
  p.created_at,
  p.created_mode,
  coalesce(
    p.author_id = auth.uid()
    or p.guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid,
    false
  ) as is_mine
from posts p
left join profiles pr on pr.id = p.author_id;
```

#### `posts_counts`

"내 강의" 목록에서 강의별 게시글 개수를 보여주기 위한 집계 뷰입니다. 다른 두 counts 뷰와 달리 보안 목적이 아닙니다 — `posts_public`이 이미 전체 공개라 숨길 값이 없습니다. PostgREST가 서버 사이드 `group by`를 지원하지 않아서, 여러 강의의 게시글 개수를 한 번의 요청으로 가져오기 위한 효율성 목적으로만 추가했습니다. `parent_id is null`로 최상위 게시글만 세고 답글은 제외합니다 — 프론트가 이 값을 "게시글 {n}개"로 표시하는데, 최상위 게시글은 `parent_id is null`(`posts_status_matches_top_level` 제약으로 보장)이라 이 조건으로 답글과 구분됩니다.

```sql
create view posts_counts as
select lecture_id, count(*) as post_count
from posts
where parent_id is null
group by lecture_id;
```

#### `post_likes_counts`

`post_likes`도 테이블 자체 SELECT는 본인 투표 행만 가능하도록 좁혀서(아래 [RLS 정책 → `post_likes`](#post_likes-1) 참고), `voter_key` 없이 집계된 개수만 보여주는 공개용 뷰를 따로 둡니다.

```sql
create view post_likes_counts as
select post_id, count(*) as like_count
from post_likes
group by post_id;
```

### 트리거 함수

#### `block_status_change_by_non_lecturer()`

게시글 `status`(미해결/해결)는 강의자만 바꿀 수 있어야 하는데, RLS 조건만으로는 "이 컬럼은 안 바뀌어야 한다"는 규칙을 표현하기 어려워서 트리거로 강제합니다. `status`가 실제로 바뀌려는 시도이면서 요청자가 그 강의의 소유자(`nodes.created_by = auth.uid()`)가 아니면 예외를 발생시켜 막습니다. 다만 `app.bypass_status_lock`이라는 트랜잭션 로컬 플래그가 켜져 있으면 이 검사를 건너뜁니다 — `unresolve_post_on_question_reply()`가 "해결된 게시글에 질문 답글이 달리면 자동으로 미해결 전환"할 때만 예외적으로 이 플래그를 세팅합니다.

```sql
create or replace function block_status_change_by_non_lecturer()
returns trigger as $$
begin
  if current_setting('app.bypass_status_lock', true) = 'true' then
    return new;
  end if;

  if new.status is distinct from old.status
     and not exists (
       select 1 from lectures join nodes on nodes.id = lectures.id
       where lectures.id = new.lecture_id and nodes.created_by = auth.uid()
     )
  then
    raise exception '강의자만 게시글 상태를 변경할 수 있습니다';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_block_status_change_by_non_lecturer
before update on posts
for each row execute function block_status_change_by_non_lecturer();
```

#### `set_resolved_at_on_status_change()`

`status`가 `resolved`로 바뀌는 순간 `resolved_at`을 `now()`로 자동으로 채우고, 다시 `unresolved`로 돌아가거나(또는 애초에 답글이라 `status`가 `null`인 경우) `resolved_at`도 함께 `null`로 되돌립니다. `check ((status = 'resolved') = (resolved_at is not null))` 제약과 짝을 이뤄, 이 트리거를 거치지 않은 직접 INSERT/UPDATE에 대해서도 데이터 정합성이 깨지지 않도록 합니다.

```sql
create or replace function set_resolved_at_on_status_change()
returns trigger as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_at := now();
  elsif new.status is distinct from 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_resolved_at_on_status_change
before update on posts
for each row execute function set_resolved_at_on_status_change();
```

#### `unresolve_post_on_question_reply()`

README 필수 기능("해결된 게시글에 질문 답글이 달리면 다시 미해결로 전환")을 구현합니다. 답글의 답글까지 무한 depth를 지원하므로, 재귀 CTE로 답글 트리를 거슬러 올라가 `status`를 들고 있는 최상위 게시글을 찾습니다. 그 게시글이 `resolved` 상태였다면 `app.bypass_status_lock` 플래그를 세팅한 뒤 `status`를 `unresolved`로 되돌립니다(이 플래그가 왜 필요한지는 `block_status_change_by_non_lecturer()` 설명 참고). `SECURITY DEFINER`로 선언한 이유는, 이 UPDATE를 실제로 실행하는 사람은 그 답글을 쓴 수강생인데 `posts` 테이블 직접 SELECT가 `anon`/`authenticated`에서 회수되어 있고(아래 [RLS 정책 → `posts`](#posts-1) 참고) 이 수강생은 `posts_update_own`/`posts_lecturer_update_status` 어느 RLS에도 걸리지 않아(자기 글도, 강의자도 아님) 조상 게시글을 조회·수정할 권한이 원래 없기 때문입니다. `created_mode = 'lecturer'`인 글은 이미 답글+`opinion` 타입만 가능하도록 CHECK로 막혀 있어서, `type = 'question'`인 답글은 항상 수강생 글임이 구조적으로 보장됩니다.

```sql
create or replace function unresolve_post_on_question_reply()
returns trigger
security definer
set search_path = public
as $$
declare
  root_id uuid;
  root_status text;
begin
  if new.parent_id is null or new.type <> 'question' then
    return new;
  end if;

  with recursive ancestors as (
    select id, parent_id, status from posts where id = new.parent_id
    union all
    select p.id, p.parent_id, p.status from posts p join ancestors a on p.id = a.parent_id
  )
  select id, status into root_id, root_status from ancestors where parent_id is null;

  if root_status = 'resolved' then
    perform set_config('app.bypass_status_lock', 'true', true); -- true = 트랜잭션 끝나면 자동 초기화
    update posts set status = 'unresolved' where id = root_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_unresolve_post_on_question_reply
after insert on posts
for each row execute function unresolve_post_on_question_reply();
```

#### `enforce_nodes_parent_rules()`

`nodes_insert_own`/`nodes_update_own` RLS는 새로 쓰는 행 자신의 `created_by = auth.uid()`만 검사할 뿐, `parent_id`가 가리키는 부모 행은 검사하지 않습니다. 그래서 다른 사람 폴더 밑에 내 노드를 끼워 넣거나(INSERT), 같은 계정이라도 강의자 모드 폴더를 수강생 모드 폴더 밑으로 옮기는 것(UPDATE, "위치 이동" 기능)이 막혀 있지 않았고, 강의(`type = 'lecture'`)를 다른 노드의 부모로 지정하는 것도(강의는 트리의 리프여야 함) 막혀 있지 않았습니다. 이 트리거는 `parent_id`가 가리키는 부모 노드가 (1) 강의가 아니고 (2) `created_by`/`created_mode`가 반드시 일치하도록 강제해, `nodes.parent_id` 체인이 항상 한 사람·한 모드의 트리 안에서만, 리프가 아닌 노드 밑으로만 이어지게 합니다. 다른 행(부모 행)을 참조해야 해서 `check` 제약으로는 표현할 수 없어(서브쿼리 금지) 트리거로 구현했습니다. (원래 이름은 `enforce_nodes_parent_ownership()`였는데, 소유권 검사만 하는 것처럼 보여 실제 검사 범위에 맞게 개명함)

INSERT는 새 행이라 자기 자신의 자손이 될 수 없어 문제없지만, UPDATE로 어떤 노드의 `parent_id`를 그 노드 자신의 하위 트리 안에 있는 노드로 바꾸면(예: A → B → C인데 A의 부모를 C로 변경) 사이클이 생겨 재귀 조회(`get_my_favorite_subtrees()` 등)가 무한 루프에 빠질 수 있었습니다. 그래서 `parent_id`가 실제로 바뀌는 UPDATE에 한해 두 가지를 추가로 검사합니다: (1) 새 부모가 자기 자신인 경우를 즉시 비교로 거르고, (2) 더 깊은 사이클은 새 부모 후보가 이 노드의 자손 트리에 속하는지 `with recursive`로 확인합니다(다른 행을 재귀적으로 조회해야 해서 `check` 제약으로는 표현 불가). `parent_id` 변경이 없는 UPDATE와 INSERT는 이 검사를 건너뛰어 불필요한 재귀 조회를 피합니다.

```sql
create or replace function enforce_nodes_parent_rules()
returns trigger as $$
begin
  if new.parent_id is not null and exists (
    select 1 from nodes parent
    where parent.id = new.parent_id
      and parent.type = 'lecture'
  )
  then
    raise exception '강의는 자식 노드(폴더/강의)를 가질 수 없습니다';
  end if;

  if new.parent_id is not null and exists (
    select 1 from nodes parent
    where parent.id = new.parent_id
      and (parent.created_by is distinct from new.created_by
           or parent.created_mode is distinct from new.created_mode)
  )
  then
    raise exception '부모 폴더와 소유자/모드가 일치해야 합니다';
  end if;

  if tg_op = 'UPDATE' and new.parent_id is not null and new.parent_id is distinct from old.parent_id then
    if new.parent_id = new.id then
      raise exception '자기 자신을 부모로 지정할 수 없습니다';
    end if;

    if exists (
      with recursive descendants as (
        select id from nodes where parent_id = new.id
        union all
        select n.id from nodes n join descendants d on n.parent_id = d.id
      )
      select 1 from descendants where id = new.parent_id
    )
    then
      raise exception '자기 자신의 하위 노드를 부모로 지정할 수 없습니다 (트리에 사이클이 생깁니다)';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_nodes_parent_rules
before insert or update on nodes
for each row execute function enforce_nodes_parent_rules();
```

#### `handle_new_user()`

`profiles`는 별도 INSERT 정책이 없어 RLS가 직접 INSERT를 막기 때문에, `auth.users`에 새 행이 생길 때(Google OAuth 로그인 포함) 이 트리거가 `profiles` 행을 자동으로 만드는 게 유일한 생성 경로입니다. 일반 role에게는 없는 `public.profiles` INSERT 권한을 얻기 위해 `SECURITY DEFINER`로 선언했고, `search_path`를 `public`으로 고정해 스키마 하이재킹(함수 실행 중 다른 스키마의 동명 객체가 끼어드는 것)을 방지합니다. `name`은 구글 계정의 `full_name`/`name`(없으면 이메일)을 `raw_user_meta_data`에서 꺼내 자동으로 채웁니다.

```sql
create or replace function handle_new_user()
returns trigger
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email)
  );
  return new;
end;
$$ language plpgsql;

create trigger trg_handle_new_user
after insert on auth.users
for each row execute function handle_new_user();
```

#### 실시간 갱신용 Broadcast 트리거 5종

강의 페이지(질문/답글, 좋아요, 실시간 피드백, 강의 제목/일정)를 실시간으로 갱신하기 위한 **Broadcast from Database** 트리거 5종입니다. `postgres_changes`(테이블 WAL을 직접 구독) 대신 `realtime.send()`(내부적으로 `realtime.messages` 테이블에 INSERT할 뿐인 함수)를 쓰는 이유는, `postgres_changes`는 원본 테이블의 RLS를 그대로 적용받는데 `posts`/`post_likes`/`lecture_feedback_votes`의 RLS는 `x-guest-token` 헤더 비교가 섞여 있고 WebSocket 연결은 커스텀 헤더를 못 실어서 비회원이 이벤트를 아예 못 받기 때문입니다(실제로 라이브 테스트로 확인함). `realtime.send()`는 원본 테이블 RLS와 무관한 별도 경로라 회원/비회원 구분 없이 받을 수 있고, 트리거가 원래 쓰기와 같은 트랜잭션 안에서 실행되므로 그 트랜잭션이 롤백되면 브로드캐스트도 같이 취소되는 장점도 있습니다.

채널은 [Presence](#실시간-접속자-수-강의별)와 동일하게 `lecture:<lecture_id>`를 재사용합니다. 다섯 함수 모두 `SECURITY DEFINER`로 선언했는데, `posts`/`nodes`/`lectures`의 base 테이블 SELECT가 RLS로 좁게 막혀 있어서(예: 남이 쓴 글은 `posts_select_own`/`posts_select_lecturer`로 안 보임) 호출자(글을 쓰거나 좋아요를 누른 사람)의 권한이 아니라 정의자 권한으로 자유롭게 조회해야 하기 때문입니다(`unresolve_post_on_question_reply()`와 동일한 이유). `search_path`는 스키마 하이재킹 방지를 위해 빈 문자열로 고정합니다.

- **`broadcast_post_change()`**(`posts` AFTER INSERT/UPDATE/DELETE) — `post_change` 이벤트. INSERT/UPDATE는 `posts_public` 뷰에서 안전한 필드만 골라 페이로드로 보냄(뷰가 이미 `guest_token`/`author_id`를 감추고 `is_anonymous`에 따라 작성자 이름을 조건부로 채워주므로 재사용). `is_mine`은 보는 사람마다 다른 값이라 브로드캐스트에는 안 실음(클라이언트가 자기 identity로 직접 판단). DELETE는 삭제된 행이 뷰에서도 이미 사라진 뒤라 `old`의 `id`/`lecture_id`/`parent_id`만 보냄(목록에서 지우는 데 그거면 충분).
- **`broadcast_post_like_change()`**(`post_likes` AFTER INSERT/DELETE) — `like_change` 이벤트. `voter_key`는 안 보내고 `post_likes_counts`에서 그 글의 좋아요 개수만 다시 계산해서 `{post_id, like_count}`로 보냄.
- **`broadcast_feedback_vote_change()`**(`lecture_feedback_votes` AFTER INSERT/DELETE) — `feedback_change` 이벤트. `lecture_feedback_votes_counts`에서 해당 `feedback_type`의 좋아요/싫어요 개수를 다시 계산해서 전송. 강의자의 "초기화"(여러 행 한꺼번에 DELETE)도 각 행마다 트리거가 돌아 결과적으로 최종 개수(0)로 수렴함.
- **`broadcast_lecture_name_change()`**(`nodes` AFTER UPDATE) — `lecture_updated` 이벤트. `type = 'lecture'`이고 이름이 실제로 바뀐 경우에만 `{id, name}` 전송.
- **`broadcast_lecture_details_change()`**(`lectures` AFTER UPDATE) — `lecture_details_updated` 이벤트. `{id, start_time, end_time, location, max_participants}` 전송.

**계정 이름(`profiles.name`) 변경은 이 범위에서 제외**했습니다 — 한 사람이 강의를 여러 개 소유할 수 있어서 이름 하나가 바뀌면 그 사람 소유의 강의 채널 여러 곳에 각각 쏴야 하는 부채살 구조라, `nodes`/`lectures`(강의 하나 = 채널 하나)보다 한 단계 더 복잡하고 실익도 낮다고 판단해 보류함.

```sql
create or replace function broadcast_post_change()
returns trigger
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  target_lecture_id uuid;
begin
  if tg_op = 'DELETE' then
    target_lecture_id := old.lecture_id;
    payload := jsonb_build_object(
      'op', 'DELETE', 'id', old.id, 'lecture_id', old.lecture_id, 'parent_id', old.parent_id
    );
  else
    target_lecture_id := new.lecture_id;
    select jsonb_build_object(
      'id', p.id, 'lecture_id', p.lecture_id, 'parent_id', p.parent_id,
      'author_display_name', p.author_display_name, 'is_anonymous', p.is_anonymous,
      'type', p.type, 'status', p.status, 'resolved_at', p.resolved_at,
      'content', p.content, 'created_at', p.created_at, 'created_mode', p.created_mode
    ) into payload
    from public.posts_public p
    where p.id = new.id;
    payload := payload || jsonb_build_object('op', tg_op);
  end if;

  perform realtime.send(payload, 'post_change', 'lecture:' || target_lecture_id::text, false);
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_broadcast_post_change
after insert or update or delete on posts
for each row execute function broadcast_post_change();

create or replace function broadcast_post_like_change()
returns trigger
security definer
set search_path = ''
as $$
declare
  affected_post_id uuid := coalesce(new.post_id, old.post_id);
  target_lecture_id uuid;
  count_val integer;
begin
  select lecture_id into target_lecture_id from public.posts where id = affected_post_id;
  select like_count into count_val from public.post_likes_counts where post_id = affected_post_id;

  perform realtime.send(
    jsonb_build_object('post_id', affected_post_id, 'like_count', coalesce(count_val, 0)),
    'like_change',
    'lecture:' || target_lecture_id::text,
    false
  );
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_broadcast_post_like_change
after insert or delete on post_likes
for each row execute function broadcast_post_like_change();

create or replace function broadcast_feedback_vote_change()
returns trigger
security definer
set search_path = ''
as $$
declare
  affected_lecture_id uuid := coalesce(new.lecture_id, old.lecture_id);
  affected_type text := coalesce(new.feedback_type, old.feedback_type);
  counts record;
begin
  select like_count, dislike_count into counts
  from public.lecture_feedback_votes_counts
  where lecture_id = affected_lecture_id and feedback_type = affected_type;

  perform realtime.send(
    jsonb_build_object(
      'feedback_type', affected_type,
      'like_count', coalesce(counts.like_count, 0),
      'dislike_count', coalesce(counts.dislike_count, 0)
    ),
    'feedback_change',
    'lecture:' || affected_lecture_id::text,
    false
  );
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_broadcast_feedback_vote_change
after insert or delete on lecture_feedback_votes
for each row execute function broadcast_feedback_vote_change();

create or replace function broadcast_lecture_name_change()
returns trigger
security definer
set search_path = ''
as $$
begin
  if new.type = 'lecture' and new.name is distinct from old.name then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'name', new.name),
      'lecture_updated',
      'lecture:' || new.id::text,
      false
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_broadcast_lecture_name_change
after update on nodes
for each row execute function broadcast_lecture_name_change();

create or replace function broadcast_lecture_details_change()
returns trigger
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id, 'start_time', new.start_time, 'end_time', new.end_time,
      'location', new.location, 'max_participants', new.max_participants
    ),
    'lecture_details_updated',
    'lecture:' || new.id::text,
    false
  );
  return new;
end;
$$ language plpgsql;

create trigger trg_broadcast_lecture_details_change
after update on lectures
for each row execute function broadcast_lecture_details_change();
```

### RPC 함수

#### `delete_own_account()`

로그인한 본인만 자기 `auth.users` 행을 삭제할 수 있게 하는 회원 탈퇴 RPC입니다. `auth.users` DELETE는 일반 role(`anon`/`authenticated`)에게 권한이 없어 `SECURITY DEFINER`로 우회하고, `auth.uid()`로 삭제 대상을 "요청자 본인"으로 못박아 다른 사람 계정을 삭제하는 걸 원천 차단합니다. `search_path`를 빈 문자열로 비워 모든 참조를 완전한 스키마 경로(`auth.users`)로 강제해 스키마 하이재킹을 방지합니다. 본문이 분기/변수 없는 단순 `DELETE` 한 줄이라 트리거 함수들과 달리 `plpgsql`이 필요 없어 `sql` 언어로 정의했습니다.

함수 생성 직후 `PUBLIC`에게 자동으로 부여되는 기본 실행 권한을 전부 회수(`revoke all ... from public`)하고 `authenticated`에게만 다시 실행 권한을 부여했는데, **이것만으로는 `anon`을 막지 못합니다** — Supabase는 새 함수를 만들면 `PUBLIC` 회수와 별개로 `anon`/`authenticated`에 EXECUTE를 자동으로 또 부여해서, `revoke all ... from public`을 실행해도 이미 부여된 `anon`의 EXECUTE는 그대로 남습니다(`get_or_create_join_code()`/`reissue_join_code()`도 동일). 이 프로젝트는 처음엔 이걸 놓쳐서 실제로는 비로그인 상태에서도 호출 자체는 가능했던 채로 있었고(각 함수 본문이 `auth.uid()` 기반으로 대상을 제한해 실질 피해는 없었음), `get_similarity_candidates()`를 만들면서 이 함정을 알아채고 뒤늦게 `20260707220448_revoke_anon_execute_on_member_only_rpcs.sql`로 세 함수 모두 `anon`의 EXECUTE를 명시적으로 회수해 바로잡았습니다.

프론트에서는 `supabase.rpc('delete_own_account')`로 호출합니다.

```sql
create or replace function delete_own_account()
returns void
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$ language sql;

revoke all on function delete_own_account() from public;
grant execute on function delete_own_account() to authenticated;
revoke execute on function delete_own_account() from anon;
```

#### `get_my_favorite_subtrees()`

"내 강의" 페이지(수강생 모드)에서 즐겨찾기한 노드들의 서브트리를 한 번에 가져오는 RPC입니다. `favorites`에 등록된 즐겨찾기 루트마다 재귀적으로 자손까지 모두 가져오되, 결과 행마다 `anchor_node_id`(어느 즐겨찾기 루트에서 나온 행인지)를 같이 실어서, 프론트가 `anchor_node_id`로 그룹핑해 즐겨찾기 루트별로 독립된 서브트리를 조립하도록 합니다. `union`(중복 제거)이 아니라 `union all`을 써서, 어떤 노드가 두 즐겨찾기 루트의 서브트리에 동시에 속하는 경우(예: 폴더 A와 그 하위 강의 B를 각각 따로 즐겨찾기한 경우) 일부러 중복된 행을 유지합니다 — B가 A의 자손으로서, 그리고 B 자신의 루트로서 각각 화면에 독립적으로 나타나야 하기 때문에, 전역 `id` 기준으로 중복 제거를 하면 이 요구사항이 깨집니다.

즐겨찾기가 정리된 개인 폴더(`favorites.anchor_id`)는 이 함수 결과에 넣지 않습니다. 프론트가 `favorites`를 직접 조회하면(RLS로 본인 행만 허용) `node_id`-`anchor_id` 매핑을 이미 얻을 수 있어서, 서브트리의 모든 행에 `anchor_id`를 중복해서 실어 보낼 필요가 없기 때문입니다.

`SECURITY INVOKER`가 기본값이라 별도로 명시하지 않았습니다. `nodes`는 이미 전체 공개 읽기이고, `favorites`는 CTE 안에서 `user_id = auth.uid()`로 직접 걸러서 호출자 권한을 벗어나지 않기 때문에 `SECURITY DEFINER`로 우회할 필요가 없습니다.

```sql
create or replace function get_my_favorite_subtrees()
returns table (
  id uuid,
  parent_id uuid,
  type text,
  name text,
  created_by uuid,
  created_mode text,
  created_at timestamptz,
  anchor_node_id uuid
)
as $$
  with recursive favorite_roots as (
    select node_id as anchor_node_id
    from favorites
    where user_id = auth.uid()
  ),
  subtree as (
    select n.*, r.anchor_node_id
    from nodes n
    join favorite_roots r on n.id = r.anchor_node_id
    union all
    select n.*, s.anchor_node_id
    from nodes n
    join subtree s on n.parent_id = s.id
  )
  select id, parent_id, type, name, created_by, created_mode, created_at, anchor_node_id
  from subtree;
$$ language sql;
```

#### `get_or_create_join_code()`

강의자가 "강의 코드 공유" 버튼을 눌렀을 때, 이미 발급된 `join_code`가 있으면 그대로 반환하고 없으면 그 자리에서 발급까지 처리하는 RPC입니다. `code`는 4자리 숫자라 공간이 10000개뿐이라서(`gen_random_uuid()`류의 128비트 공간과 달리) 발급 시도마다 다른 강의와 값이 겹칠 확률이 무시 못 할 수준이라, `unique_violation`이 나면 새 값으로 재시도하는 루프가 필요합니다. `code` 컬럼에 건 `default lpad(floor(random() * 10000)::text, 4, '0')` 표현식이 후보 값을 생성하고, 함수는 재시도만 담당합니다. `unique_violation`이 나면 먼저 같은 `lecture_id`로 재조회해서, 그 사이 동시 요청이 이미 발급했다면(`lecture_id` unique 제약 충돌) 그 값을 반환하고, 그게 아니라 `code` PK 자체가 충돌한 것이면 `default`가 새 값을 생성하도록 같은 INSERT를 재시도합니다(최대 20회).

발급/재발급을 이 함수와 `reissue_join_code()`로만 가능하게 강제하기 위해, `lecture_join_codes`의 `INSERT`/`UPDATE` 테이블 권한 자체를 `anon`/`authenticated`에서 회수했습니다(파기는 후보값 생성이 필요 없는 단순 삭제라 함수로 강제할 이유가 없어 `DELETE`는 직접 쿼리를 그대로 허용). 이 프로젝트는 어떤 테이블에도 `FORCE ROW LEVEL SECURITY`를 걸지 않았기 때문에, `SECURITY DEFINER` 함수 내부의 INSERT는 RLS를 타지 않고 우회합니다(테이블 소유자 권한으로 실행되므로) — 그래서 INSERT용 RLS 정책 자체를 따로 두지 않고, 대신 "호출자가 이 강의의 소유자인가" 조건을 함수 안에서 직접 재검증합니다. 이 체크가 없으면 로그인한 아무나 아무 강의의 코드를 발급할 수 있게 되는 심각한 구멍이 생깁니다.

```sql
create or replace function get_or_create_join_code(p_lecture_id uuid)
returns text
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_attempts int := 0;
begin
  if not exists (
    select 1 from public.lectures join public.nodes on nodes.id = lectures.id
    where lectures.id = p_lecture_id and nodes.created_by = auth.uid()
  ) then
    raise exception '본인 소유 강의의 join_code만 발급할 수 있습니다';
  end if;

  select code into v_code from public.lecture_join_codes where lecture_id = p_lecture_id;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'join code 발급 실패: 재시도 횟수 초과';
    end if;

    begin
      insert into public.lecture_join_codes (lecture_id) values (p_lecture_id)
        returning code into v_code;
      return v_code;
    exception
      when unique_violation then
        select code into v_code from public.lecture_join_codes where lecture_id = p_lecture_id;
        if v_code is not null then
          return v_code;
        end if;
    end;
  end loop;
end;
$$ language plpgsql;

revoke all on function get_or_create_join_code(uuid) from public;
grant execute on function get_or_create_join_code(uuid) to authenticated;
revoke execute on function get_or_create_join_code(uuid) from anon;
```

#### `reissue_join_code()`

기존 코드를 강제로 폐기하고 새 코드를 발급하는 RPC입니다. "재발급 방식" 설계 원칙([설계 노트](#정책트리거뷰-보완-설명) 참고: `code`는 UPDATE로 값을 바꾸지 않고 기존 행 DELETE 후 새 코드로 INSERT)을 그대로 구현한 것으로, 기존 행을 지운 뒤 `get_or_create_join_code()`와 동일한 재시도 루프로 새 코드를 발급합니다(방금 지웠으므로 `lecture_id` 충돌은 없고 `code` PK 충돌만 재시도 대상). 소유권 체크와 권한 설정은 `get_or_create_join_code()`와 동일합니다.

```sql
create or replace function reissue_join_code(p_lecture_id uuid)
returns text
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_attempts int := 0;
begin
  if not exists (
    select 1 from public.lectures join public.nodes on nodes.id = lectures.id
    where lectures.id = p_lecture_id and nodes.created_by = auth.uid()
  ) then
    raise exception '본인 소유 강의의 join_code만 재발급할 수 있습니다';
  end if;

  delete from public.lecture_join_codes where lecture_id = p_lecture_id;

  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'join code 재발급 실패: 재시도 횟수 초과';
    end if;

    begin
      insert into public.lecture_join_codes (lecture_id) values (p_lecture_id)
        returning code into v_code;
      return v_code;
    exception
      when unique_violation then
        null;
    end;
  end loop;
end;
$$ language plpgsql;

revoke all on function reissue_join_code(uuid) from public;
grant execute on function reissue_join_code(uuid) to authenticated;
revoke execute on function reissue_join_code(uuid) from anon;
```

#### `get_similarity_candidates()`

`submit-post` Edge Function이 유사도 검사를 하기 전에 비교 대상 후보를 가져오는 내부 헬퍼입니다. 비교 범위는 같은 강의의 **미해결 게시글(타입 무관: 질문/의견) + 그 답글 전부**(무한 depth, 답글 타입 무관)로, 재귀 CTE로 미해결 최상위 게시글들을 찾은 뒤 그 아래 답글을 전부 따라 내려갑니다. `submit-post`(`service_role`)만 호출하는 용도라 새 함수 생성 시 기본으로 열리는 `PUBLIC EXECUTE`를 회수하고 `service_role`에만 다시 부여했습니다 — 이 함수 자체가 `posts_public`으로도 이미 보이는 내용(`id`/`content`)만 반환해서 위험한 노출은 아니지만, "서버 전용"이라는 설계 의도와 권한을 맞춰두기 위함입니다. `posts`에 이미 `check ((parent_id is null) = (status is not null))` 제약이 있어 `status = 'unresolved'`(not null) 조건만으로 `parent_id is null`이 자동 보장되므로, root 선택 조건에 `parent_id is null`을 별도로 넣지 않습니다(`20260707230000` 마이그레이션에서 중복 조건으로 판단해 제거).

```sql
create or replace function get_similarity_candidates(p_lecture_id uuid)
returns table (id uuid, content text)
as $$
  with recursive unresolved_roots as (
    select posts.id
    from posts
    where posts.lecture_id = p_lecture_id
      and posts.status = 'unresolved'
  ),
  thread as (
    select posts.id, posts.content
    from posts
    where posts.id in (select id from unresolved_roots)
    union all
    select p.id, p.content
    from posts p
    join thread t on p.parent_id = t.id
  )
  select id, content from thread;
$$ language sql stable;

revoke execute on function get_similarity_candidates(uuid) from public, anon, authenticated;
grant execute on function get_similarity_candidates(uuid) to service_role;
```

### 접근 제어 (RLS 정책 및 테이블 권한)

행 단위 제어는 RLS 정책으로, 테이블/컬럼 단위 접근 자체는 `REVOKE`/`GRANT`로 각각 다루며, 테이블별로 RLS만 쓰는 경우도 있고 `posts`/`lecture_join_codes`처럼 둘을 같이 쓰는 경우도 있습니다(`REVOKE`가 필요한 이유는 각 테이블 섹션 설명 참고).

읽기는 테이블마다 성격이 달라 크게 셋으로 나뉩니다: (1) 강의 입장 흐름에 필요한 `nodes`/`lectures`/`lecture_join_codes`는 소유자가 아닌 사람도 읽어야 하므로 그대로 공개(`using (true)`), (2) `profiles`/`favorites`/`post_likes`/`lecture_feedback_votes`는 RLS로 본인 행만 조회 가능하도록 좁힘(`post_likes`/`lecture_feedback_votes`는 여기에 더해, 남에게 `voter_key`를 보여주지 않으면서 전체 개수는 알려야 해서 `post_likes_counts`/`lecture_feedback_votes_counts` 뷰로 집계를 따로 공개), (3) `posts`는 유일하게 행 단위 제한(본인 글 또는 자기 강의의 글)과 컬럼 단위 제한(`guest_token`/`author_id` 제외)을 함께 씁니다 — UPDATE/DELETE가 대상 행을 찾으려면 SELECT 정책도 있어야 해서(아래 [RLS 정책 → `posts`](#posts-1) 참고) 단순 회수만으로는 부족했기 때문입니다. 여러 사람의 글을 한 번에 봐야 하는 목록 조회는 `guest_token`/`author_id`를 뺀 `posts_public` 뷰로 합니다. 쓰기는 전부 "본인 것만" 원칙으로 제한합니다.

#### `profiles`

본인만 조회/수정할 수 있습니다. INSERT 정책은 없는데, `auth.users` 가입 트리거(`handle_new_user()`)로만 생성되는 경로라 직접 INSERT는 원천 차단됩니다. 본인만 조회 가능하도록 좁혀도, 다른 사람의 `name`은 `posts_public` 뷰가 뷰 소유자 권한으로 내부적으로 조인해서 노출하므로 비익명 글의 작성자 이름 표시는 그대로 동작합니다.

```sql
alter table profiles enable row level security;
create policy "profiles_select_self" on profiles for select using (auth.uid() = id);
create policy "profiles_update_self" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);
```

#### `nodes`

전체 공개 읽기이고, 로그인한 사용자가 본인 명의로 생성/수정/삭제할 수 있습니다(강의자/수강생 모드 둘 다 폴더를 만들 수 있음).

```sql
alter table nodes enable row level security;
create policy "nodes_select_all" on nodes for select using (true);
create policy "nodes_insert_own" on nodes for insert
  to authenticated with check (created_by = auth.uid());
create policy "nodes_update_own" on nodes for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "nodes_delete_own" on nodes for delete
  using (created_by = auth.uid());
```

#### `favorites`

완전히 개인적인 데이터라 본인만 읽기/쓰기 전부 가능합니다(`favorites_owner_all`). 여기에 더해, 즐겨찾기 대상(`node_id`)이 실제로 강의자 모드로 만들어진 노드인지, `anchor_id`(즐겨찾기를 정리해둔 내 개인 폴더)가 실제로 내가 수강생 모드로 만든 폴더인지 확인합니다(왜 필요한지는 설계 노트 참고). 둘 다 다른 테이블(`nodes`) 조회가 필요해 `check` 제약으로는 표현할 수 없고(서브쿼리 금지), 기존 `favorites_owner_all`이 이미 `for all`(permissive)로 열려 있어서 여기에 permissive 정책을 추가하면 OR로 합쳐져 오히려 더 넓어지기만 하므로 `RESTRICTIVE`로 만들어 AND로 좁혔습니다. `node_id`는 PK 컬럼이라 이론상 UPDATE도 가능해서 INSERT/UPDATE 둘 다 막고, `anchor_id`는 즐겨찾기를 다른 폴더로 옮길 때 바뀌는 컬럼이라 오히려 UPDATE 쪽이 더 자주 쓰이므로 마찬가지로 INSERT/UPDATE 둘 다 막습니다. `anchor_id`가 가리키는 노드의 `type = 'folder'`는 별도로 검사하지 않는데, `nodes`의 `check (type <> 'lecture' or created_mode = 'lecturer')` 제약의 대우로 `created_mode = 'student' → type = 'folder'`가 이미 보장되기 때문입니다.

```sql
alter table favorites enable row level security;
create policy "favorites_owner_all" on favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "favorites_insert_only_favorite_lecturer_mode" on favorites as restrictive for insert
  with check (
    exists (select 1 from nodes where nodes.id = node_id and nodes.created_mode = 'lecturer')
  );
create policy "favorites_update_only_favorite_lecturer_mode" on favorites as restrictive for update
  using (true)
  with check (
    exists (select 1 from nodes where nodes.id = node_id and nodes.created_mode = 'lecturer')
  );

create policy "favorites_insert_anchor_must_be_own_student_folder" on favorites as restrictive for insert
  with check (
    anchor_id is null or exists (
      select 1 from nodes
      where nodes.id = anchor_id
        and nodes.created_by = auth.uid()
        and nodes.created_mode = 'student'
    )
  );
create policy "favorites_update_anchor_must_be_own_student_folder" on favorites as restrictive for update
  using (true)
  with check (
    anchor_id is null or exists (
      select 1 from nodes
      where nodes.id = anchor_id
        and nodes.created_by = auth.uid()
        and nodes.created_mode = 'student'
    )
  );
```

#### `lectures`

전체 공개 읽기이고, 해당 노드(`nodes.created_by`)의 소유자만 생성/수정/삭제할 수 있습니다.

```sql
alter table lectures enable row level security;
create policy "lectures_select_all" on lectures for select using (true);
create policy "lectures_owner_all" on lectures for all
  using (exists (select 1 from nodes where nodes.id = lectures.id and nodes.created_by = auth.uid()))
  with check (exists (select 1 from nodes where nodes.id = lectures.id and nodes.created_by = auth.uid()));
```

#### `lecture_join_codes`

코드 조회는 공개입니다(입장 시 코드로 강의를 찾아야 하므로). 발급/재발급/파기는 강의 소유자만 가능합니다.

발급(INSERT)/재발급은 RLS 정책이 아니라 테이블 자체 INSERT/UPDATE 권한을 `anon`/`authenticated`에서 회수하는 것으로 막습니다 — [`get_or_create_join_code()`](#get_or_create_join_code)/[`reissue_join_code()`](#reissue_join_code) RPC를 거치지 않은 직접 쿼리는 RLS 평가에 도달하기도 전에 권한 오류로 막힙니다(4자리 코드는 공간이 좁아 충돌 재시도 로직이 필수인데, 클라이언트 직접 INSERT로는 이걸 챙길 수 없기 때문 — 자세한 이유는 두 RPC 설명 참고). INSERT용 RLS 정책은 만들지 않습니다 — 두 RPC가 `SECURITY DEFINER`라 어차피 이 정책을 우회하고(테이블 소유자 권한으로 실행되므로), 아래 REVOKE로 이미 직접 쿼리 경로 자체가 막혀 있어 만들어도 도달할 일이 없는 죽은 정책이기 때문입니다. 파기(DELETE)는 후보값 생성이 필요 없는 단순 삭제라 함수로 강제하지 않고, 아래 `lecture_join_codes_owner_delete` 정책으로 소유자 직접 쿼리를 그대로 허용합니다.

```sql
revoke insert, update on lecture_join_codes from anon, authenticated;
```

```sql
alter table lecture_join_codes enable row level security;
create policy "lecture_join_codes_select_all" on lecture_join_codes for select using (true);
create policy "lecture_join_codes_owner_delete" on lecture_join_codes for delete
  using (exists (select 1 from lectures join nodes on nodes.id = lectures.id where lectures.id = lecture_id and nodes.created_by = auth.uid()));
```

#### `lecture_feedback_votes`

`post_likes`와 동일한 원칙(집계는 `lecture_feedback_votes_counts` 뷰로 공개, 조회/등록/취소는 본인 `voter_key`로만)에 더해, 강의자는 자기 강의의 투표를 전체 행 단위로 조회하거나(`lecture_feedback_votes_select_lecturer`) 전부 초기화할 수 있습니다(`lecture_feedback_votes_lecturer_reset`, `lecture_feedback_votes_delete_own`은 본인 투표만 지울 수 있어서 전체 초기화엔 별도 정책이 필요합니다).

```sql
alter table lecture_feedback_votes enable row level security;
create policy "lecture_feedback_votes_select_own" on lecture_feedback_votes for select
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "lecture_feedback_votes_insert_own" on lecture_feedback_votes for insert
  with check (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "lecture_feedback_votes_delete_own" on lecture_feedback_votes for delete
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));

create policy "lecture_feedback_votes_select_lecturer" on lecture_feedback_votes for select
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.id
    where lectures.id = lecture_feedback_votes.lecture_id and nodes.created_by = auth.uid()
  ));

create policy "lecture_feedback_votes_lecturer_reset" on lecture_feedback_votes for delete
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.id
    where lectures.id = lecture_feedback_votes.lecture_id and nodes.created_by = auth.uid()
  ));
```

#### `posts`

RLS는 "누가 행에 접근 가능한가"만 결정할 뿐, "어떤 테이블/컬럼에 접근 가능한가"는 별도의 GRANT 권한 문제입니다. 전체 공개 SELECT 정책을 열어둔 채로 `guest_token` 컬럼을 그대로 두면, RLS와 무관하게 `posts` 테이블에 직접 `select`를 날리는 것만으로 `guest_token`이 노출되어 남의 글을 수정/삭제할 수 있게 됩니다. 그래서 `guest_token`/`author_id` 두 컬럼만 컬럼 단위로 GRANT에서 계속 제외하고, 나머지 컬럼은 아래 두 SELECT 정책이 허용하는 행(본인 글 또는 자기 강의의 글)에 한해 직접 조회도 가능합니다. 목록 조회처럼 여러 사람의 글을 한 번에 봐야 하는 화면은 여전히 `posts_public` 뷰(위 "뷰" 섹션 참고)를 쓰세요. 회원/비회원 누구나 글을 쓸 수 있지만(단 `author_id`는 본인 것만 주장 가능), 수정/삭제는 `post_likes`와 같은 방식으로 처리합니다 — 회원은 `auth.uid()`, 비회원은 `x-guest-token` 헤더 값(`::uuid`로 캐스팅)과 `guest_token` 일치 여부로 확인합니다. `posts_update_own`/`posts_delete_own`의 `guest_token` 비교 조건에는 원래 `author_id is null and` 가드가 앞에 붙어 있었는데, 위 [테이블 → `posts`](#posts)의 옛 배타 제약(`author_id is null or guest_token is null`)이 생기면서 `guest_token = 헤더`가 참이라는 것 자체가 이미 `author_id is null`을 함의하게 되어 가드가 논리적으로 중복이 되었고, 그래서 제거했습니다. 이후 무효화 로직을 도입하지 않기로 결정하면서 이 제약이 `posts_author_id_xor_guest_token`(정확히 하나만 값을 가짐)으로 강화됐고, `guest_token` 컬럼 타입도 `uuid`로 바뀌었습니다(가드 제거 로직은 이 XOR 상태에서도 그대로 유효). 다만 탈퇴한 회원의 글을 익명으로 뭉개지 않고 "탈퇴한 계정"으로 보존하기로 결정하면서(아래 `posts` 테이블 설명 참고), `author_id`가 `on delete set null`로 `null`이 되어도 `guest_token`은 원래도 `null`이라 "둘 다 `null`"인 상태가 정상적으로 발생해야 하게 되어, 제약을 다시 `posts_author_id_guest_token_not_both_set`(둘 다 값을 갖지는 않음)으로 완화했습니다.

**`posts_select_own`/`posts_select_lecturer`가 왜 필요한가**: Postgres는 UPDATE/DELETE가 대상 행을 찾을 때(WHERE 절 평가) SELECT 커맨드에 대한 RLS 가시성도 함께 요구합니다. `posts`에 SELECT 정책이 하나도 없으면 `posts_update_own`/`posts_lecturer_delete` 등 UPDATE/DELETE 전용 정책이 아무리 맞아도 대상 행 자체가 "안 보이는" 걸로 취급되어 전부 0행 매치로 실패합니다(실제로 프론트에서 답글 수정/질문 해결 처리가 42501로 막히는 버그로 발견됨). 그래서 UPDATE/DELETE가 허용하는 행과 정확히 같은 조건으로 SELECT 정책 두 개를 추가해 가시성을 확보했습니다. `guest_token`/`author_id`는 이 SELECT로도 여전히 컬럼 단위로 막혀 있어서(위 GRANT 참고), `select('*')`나 `select('guest_token')`류는 여전히 42501로 거부됩니다 — 정책이 "행 가시성"을 열어준 것과 "컬럼 접근권"은 별개라 이 둘을 조합해야 안전합니다. 프론트에서 `.update()` 뒤에 `.select()`를 체이닝할 땐 `select('*')`가 아니라 허용된 컬럼만 명시하거나(`return=representation` 대신 `return=minimal`, 즉 `.select()` 자체를 생략) `createPost`가 이미 쓰고 있는 방식을 그대로 따르세요.

`created_mode = 'lecturer'`로 쓰려는 시도가 실제 강의 제작자에 의한 것인지 확인합니다(왜 필요한지는 설계 노트의 `posts.created_mode` 참고). 같은 행 안의 값끼리만 비교하면 되는 답글+`opinion` 타입 제약은 테이블 `check`로 처리했지만, 이 author_id-제작자 일치 확인은 다른 테이블(`nodes`) 조회가 필요해 `check` 제약으로는 표현할 수 없어서(서브쿼리 금지) RLS로 구현했습니다. UPDATE 쪽은 `RESTRICTIVE`로 만들어서 `posts_update_own`/`posts_lecturer_update_status` 등 다른 정책과 OR가 아니라 AND로 합쳐지게 했습니다.

강의자는 자기 강의(`lectures.id` 소유)에 속한 게시글이면 남의 글이라도 상태 전환(미해결↔해결) 및 삭제(부적절한 글 제거)가 가능합니다. Postgres는 같은 명령어에 정책이 여러 개면 OR로 합쳐지므로, 이 정책은 `posts_update_own`/`posts_delete_own`과 나란히 적용됩니다.

AI 적절성 검사(GPT-4o-mini + 전용 프롬프트, `moderation-prompt.ts`)/유사 질문 탐지(GPT-4o-mini + `get_similarity_candidates()` RPC, 아래 [RPC 함수](#rpc-함수) 참고)를 포함한 글 제출 흐름은 `submit-post` Edge Function(`service_role`, RLS 우회)으로 구현·배포 완료(정확한 요청/응답 계약은 [SUPABASE_GUIDE.md 10번](./SUPABASE_GUIDE.md#10-글-작성제출-ai-correct-submit-post-edge-function), 실제 구현 경위는 [TODO.md 해결된 것](./TODO.md#해결된-것-참고용-기록) 참고). **다만 클라이언트가 이 검사를 우회해 `posts`에 직접 쓰지 못하게 막는 부분(아래 `posts_insert_anyone`/`posts_insert_lecturer_mode_matches_owner` 두 INSERT 정책 삭제 + `anon`/`authenticated`의 `posts` INSERT 권한 자체 회수)은 아직 적용 전** — `frontend` 브랜치는 이미 `submit-post`/`ai-correct`를 실제로 호출하도록 구현됐지만(`SUPABASE_GUIDE.md 10번` 참고), 이 두 정책이 그대로 살아있어 원한다면 클라이언트가 직접 insert하는 것도 여전히 가능합니다.

```sql
revoke select on posts from anon, authenticated;
grant select (id, lecture_id, parent_id, is_anonymous, type, status, resolved_at, content, created_at, created_mode)
  on posts to anon, authenticated;
```

```sql
alter table posts enable row level security;
create policy "posts_select_own" on posts for select
  using (
    author_id = auth.uid()
    or guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid
  );
create policy "posts_select_lecturer" on posts for select
  using (
    exists (
      select 1 from lectures join nodes on nodes.id = lectures.id
      where lectures.id = posts.lecture_id and nodes.created_by = auth.uid()
    )
  );

create policy "posts_insert_anyone" on posts for insert
  with check (author_id is null or author_id = auth.uid());
create policy "posts_update_own" on posts for update
  using (
    author_id = auth.uid()
    or guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid
  )
  with check (
    author_id = auth.uid()
    or guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid
  );
create policy "posts_delete_own" on posts for delete
  using (
    author_id = auth.uid()
    or guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid
  );

create policy "posts_insert_lecturer_mode_matches_owner" on posts for insert
  with check (
    created_mode <> 'lecturer'
    or exists (
      select 1 from lectures join nodes on nodes.id = lectures.id
      where lectures.id = posts.lecture_id and nodes.created_by = auth.uid()
    )
  );
create policy "posts_update_lecturer_mode_matches_owner" on posts as restrictive for update
  using (true)
  with check (
    created_mode <> 'lecturer'
    or exists (
      select 1 from lectures join nodes on nodes.id = lectures.id
      where lectures.id = posts.lecture_id and nodes.created_by = auth.uid()
    )
  );

create policy "posts_lecturer_update_status" on posts for update
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.id
    where lectures.id = posts.lecture_id and nodes.created_by = auth.uid()
  ))
  with check (exists (
    select 1 from lectures join nodes on nodes.id = lectures.id
    where lectures.id = posts.lecture_id and nodes.created_by = auth.uid()
  ));

create policy "posts_lecturer_delete" on posts for delete
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.id
    where lectures.id = posts.lecture_id and nodes.created_by = auth.uid()
  ));
```

#### `post_likes`

집계(좋아요 개수)는 `post_likes_counts` 뷰로 공개하고, 조회 자체는 본인 투표 행만 가능합니다(`voter_key`를 남에게 보여주지 않으면서, 기기가 바뀌어도 "내가 이미 눌렀는지"를 서버 기준으로 판단할 수 있게 함). 등록/취소도 본인 `voter_key`로만 가능합니다. 비회원은 `auth.uid()`가 없으므로, 클라이언트가 보낸 `x-guest-token` 헤더 값과 행의 `voter_key`가 정확히 일치할 때만 허용합니다(`auth.role() = 'anon'`이라고 무조건 통과시키면 남의 좋아요까지 지울 수 있어 위험).

```sql
alter table post_likes enable row level security;
create policy "post_likes_select_own" on post_likes for select
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "post_likes_insert_own" on post_likes for insert
  with check (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "post_likes_delete_own" on post_likes for delete
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
```

### 예약 작업 (pg_cron)

Edge Function이 요청-응답으로 즉시 처리하는 로직이라면, pg_cron은 사용자 요청과 무관하게 주기적으로만 실행되면 되는 하우스키핑(정리) 작업에 씁니다. `create extension pg_cron`으로 활성화하고, `cron.schedule(job_name, schedule, command)`으로 등록합니다.

- **`purge_expired_join_codes`** (`*/15 * * * *`, 15분마다) — `lecture_join_codes`는 강의 입장을 손으로 입력하기 편하게 하려고 만든 4자리 코드일 뿐, 강의 종료 후 입장을 막으려는 기능이 아닙니다(강의 종료 이후 입장 차단은 이 코드의 목적이 아니고, 실제로 존재하지도 않는 안전장치입니다). 파기가 필요한 이유는 순전히 4자리라 공간이 10000개뿐이라서 — 끝난 강의의 코드를 계속 붙잡고 있으면 재사용 가능한 코드 공간이 줄어들기 때문에, 강의 `end_time`이 1시간 지난 코드를 주기적으로 비워줍니다. 15분은 공간을 너무 오래 묵히지도, 너무 자주 스캔하지도 않는 적당한 주기로 택했습니다.
  ```sql
  select cron.schedule(
    'purge_expired_join_codes',
    '*/15 * * * *',
    $$
    delete from lecture_join_codes
    using lectures
    where lectures.id = lecture_join_codes.lecture_id
      and lectures.end_time < now() - interval '1 hour'
    $$
  );
  ```
- **`purge_stale_post_drafts`** (`0 18 * * *`, 매일 UTC 18시 = KST 새벽 3시) — `post_drafts`는 "취소"/"보러 가기"를 선택하면 삭제 없이 고아로 남는 설계라, 하루 지난 행을 지웁니다. 강행 제출은 보통 같은 세션 내 몇 분 안에 일어나므로 하루면 충분히 넉넉한 보관 기간이라고 판단했고, 트래픽이 적은 새벽 시간대에 하루 한 번만 실행합니다.
  ```sql
  select cron.schedule(
    'purge_stale_post_drafts',
    '0 18 * * *',
    $$delete from post_drafts where created_at < now() - interval '1 day'$$
  );
  ```

두 작업 모두 라이브 DB에서 실제 만료 시나리오(강의 종료 3시간 후 코드 vs 30분 후 코드, 2일 지난 draft vs 방금 만든 draft)로 삭제 쿼리를 직접 실행해 의도한 행만 지워지는 것까지 확인했습니다.

## Edge Function

AI 교정/적절성 검사/유사 질문 탐지처럼 DB 스키마(Postgres 함수/트리거)가 아니라 별도 서버 로직이 필요한 부분은 Supabase Edge Function(Deno 런타임)으로 구현되어 있습니다. `service_role` 키를 써서 RLS를 우회하고 `posts`/`post_drafts`에 직접 접근합니다.

- `ai-correct` — 글 초안을 AI로 다듬어 제안만 함(적절성/유사도 검사 없음, 저장도 안 함)
- `submit-post` — 실제 글 제출 담당: 적절성 검사(GPT-4o-mini + 전용 프롬프트, `moderation-prompt.ts` — 욕설/인신공격/혐오/성희롱/위협/스팸은 차단, 수업 불만·비판은 통과. OpenAI Moderation API는 특정 대상을 향하지 않는 일반 욕설·비속어를 잘 못 잡아서 chat completion 기반 커스텀 판별로 전환함) → (질문 타입이면) 유사 질문 탐지(위 [`get_similarity_candidates()`](#get_similarity_candidates) RPC 활용) → 저장. 유사 질문 발견 시 [`post_drafts`](#post_drafts)에 스테이징해두고, 같은 함수를 `draft_id`로 재호출하면 강행 제출됨

요청/응답 계약, 호출 코드 예시는 [SUPABASE_GUIDE.md 10번](./SUPABASE_GUIDE.md#10-글-작성제출-ai-correct-submit-post-edge-function) 참고.

## 설계 노트

> 위 SQL만으로는 드러나지 않는 설계 배경/이유를 테이블 관계, 삭제 전파, 정책·트리거·뷰로 나눠 정리

### 테이블 관계 및 트리 구조

- `nodes`는 자기참조(`parent_id`)로 트리를 이루며, `type`이 `folder`면 강의 폴더, `lecture`면 강의입니다.
- `lectures`는 `type = 'lecture'`인 노드 하나당 한 행씩 붙는 부가 속성 테이블입니다 (1:1).
- `lecture_join_codes`는 강의 "입장"에만 쓰는 4자리 코드로, `favorites` 등록(즐겨찾기)에 쓰는 `nodes.id` 코드와는 별개입니다. 목적은 손으로 입력하기 편한 짧은 코드를 제공하는 것이지, `nodes.id` 유출에 대응하려는 기능이 아닙니다 — 입장 URL/QR은 `nodes.id`(UUID)를 그대로 쓰기 때문에, 이 링크 자체가 유출되면 `lecture_join_codes`를 재발급해도 URL/QR은 그대로라 막을 방법이 없고, 새 강의(새 노드)를 다시 만드는 것 외에는 대응 수단이 없습니다. `code`가 PK라 발급된 동안만 유일하고, 파기(DELETE)되면 그 번호를 다른 강의가 바로 재사용할 수 있습니다.
- **재발급 방식**: `code`는 UPDATE로 값을 바꾸지 않고, **기존 행 DELETE 후 새 코드로 INSERT**하는 방식으로 처리합니다 (UPDATE 정책은 만들지 않음, INSERT/DELETE 정책만 있음). PK 성격의 식별자는 값 자체를 바꾸기보다 "기존 것 폐기 + 새로 발급"이 원칙에 맞고, `issued_at`도 재발급 시점 기준으로 자연스럽게 새로 찍힙니다.
- `posts`는 `lecture_id`로 특정 강의에 속하고, `parent_id`로 자기 자신을 참조해 답글의 답글까지 무한 depth를 지원합니다. `parent_id`가 `null`이면 최상위 게시글, 값이 있으면 답글입니다. `check ((parent_id is null) = (status is not null))` 제약으로 "최상위 게시글은 `status` 필수, 답글은 `status` 반드시 `null`"이 DB 레벨에서 강제됩니다.
- **`posts.created_mode`(강의자 모드/수강생 모드 색 구분)**: 강의를 만든 계정이라도 강의자 모드로 쓸 때도, 수강생 모드로 쓸 때도 있어서, `author_id`가 강의 제작자와 같은지만으론 "이 글을 어느 화면에서 썼는지" 색으로 구분할 수 없습니다. 그래서 그 순간의 모드를 `created_mode`에 직접 저장합니다. 이 값 자체는 프론트가 정하는 자기신고값이고, 계정 본인이 뭘 선택하든(강의자가 자기 강의에 수강생처럼 참여하는 것도 정상 시나리오) 막을 이유가 없습니다. 다만 "제3자가 `created_mode = 'lecturer'`를 붙여 강의자 답변인 것처럼 위장"하는 건 막아야 합니다(구현 방식은 위 [SQL → 테이블](#테이블)의 `check` 제약과 [RLS 정책 → `posts`](#posts-1) 참고). 이전엔 트리거 + `x-mode` 헤더로 구현했었으나, 색 구분을 위해 값을 직접 저장하는 이 방식으로 대체했습니다.
- 좋아요/피드백 투표는 각각 `post_likes`, `lecture_feedback_votes`로 분리해 중복 투표를 기본키로 방지합니다. `lecture_feedback_votes`는 PK에 `value`까지 포함해서(`lecture_id`, `feedback_type`, `voter_key`, `value`), 같은 사람이 같은 `feedback_type`에 좋아요와 싫어요를 동시에 독립적으로 남길 수 있습니다(둘 다 완전히 별개의 행이라 "좋아요 취소"와 "싫어요 취소"도 서로 영향 없이 따로 처리됨).
- "내가 만든 강의/폴더"는 `nodes.created_by = 내 user_id`로 조회하되, 어느 모드의 "내 강의" 페이지인지에 따라 `created_mode`로 한 번 더 걸러야 합니다: 강의자 모드는 `created_mode = 'lecturer'`, 수강생 모드(개인 정리 폴더)는 `created_mode = 'student'`. 같은 계정이라도 두 모드에서 만든 폴더가 섞이지 않도록 하는 용도입니다.
- **`nodes.parent_id`는 항상 같은 소유자·같은 모드의, 리프가 아닌 노드 밑으로만 이어짐**: `nodes_insert_own`/`nodes_update_own` RLS는 새로 쓰는 행 자신의 `created_by`만 확인할 뿐 부모 노드는 확인하지 않아서, 그대로 두면 남의 폴더 밑에 내 노드를 끼워 넣거나 내 강의자 모드 폴더를 내 수강생 모드 폴더 밑으로 옮기는 것(위치 이동), 강의를 다른 노드의 부모로 지정하는 것까지 막히지 않습니다. `enforce_nodes_parent_rules()` 트리거로 부모 노드가 강의가 아니고 `created_by`/`created_mode`가 일치하는지 강제합니다(구현 방식은 [SQL → 트리거 함수](#트리거-함수) 참고).
- `favorites`는 "남이 만든 강의/폴더를 즐겨찾기"하는 기록이며, `anchor_id`로 그 즐겨찾기를 내가 만든 어떤 개인 폴더 아래에 정리해뒀는지 나타냅니다(`null`이면 정리 안 하고 최상위). 즐겨찾기 대상(`node_id`)의 실제 `parent_id`는 원래 만든 사람의 트리 구조 그대로이며, 이 개인 정리 구조 때문에 바뀌지 않습니다.
- **즐겨찾기는 강의자 모드로 만든 노드만 가능**: 남의 수강생 모드 개인 정리 폴더까지 즐겨찾기할 수 있으면 안 되기 때문입니다(구현 방식은 [RLS 정책 → `favorites`](#favorites-1) 참고).

### 삭제 전파 (cascade)

- **삭제 전파(cascade) 정리**: 폴더를 삭제하면 `nodes.parent_id`의 `on delete cascade`를 타고 하위 노드(폴더/강의)가 재귀적으로 전부 삭제되고, 그에 딸린 `lectures`, `posts`(답글 포함), `post_likes`, `lecture_feedback_votes`, `favorites.node_id`/`favorites.anchor_id` 즐겨찾기 기록까지 전부 연쇄적으로 같이 삭제됩니다 (즐겨찾기를 정리해둔 내 폴더를 지우면, 그 안에 넣어둔 즐겨찾기 기록도 함께 사라짐).
- **회원 탈퇴(`auth.users` 삭제) 시 전파**: `profiles`는 `on delete cascade`로 계정과 함께 삭제되고, 그에 딸린 `favorites`(내 즐겨찾기)도 `cascade`로 같이 삭제됩니다. 반면 그 사람이 만든 `nodes`(강의/폴더, `created_by`)와 작성한 `posts`(`author_id`)는 `on delete set null`이라 콘텐츠 자체는 그대로 남고 "누가 만들었는지/썼는지" 정보만 사라집니다 — 강의자 한 명이 탈퇴해도 강의 구조나 다른 학생들의 질문·답글이 통째로 사라지는 일은 없습니다.

### 정책·트리거·뷰 보완 설명

> 함수별 동작은 위 [SQL → 트리거 함수](#트리거-함수)/[RPC 함수](#rpc-함수) 섹션에, 테이블별 RLS 정책·테이블 권한은 [SQL → 접근 제어 (RLS 정책 및 테이블 권한)](#접근-제어-rls-정책-및-테이블-권한) 섹션에 정리되어 있습니다. 여기서는 여러 객체를 가로지르는 내용과 뷰의 존재 이유만 다룹니다.

- **허용은 정책, 차단은 트리거**: `posts_lecturer_update_status`/`posts_lecturer_delete`/`lecture_feedback_votes_lecturer_reset` 정책은 강의자에게 상태 전환/삭제/피드백 초기화를 **허용**하는 쪽을, `block_status_change_by_non_lecturer()` 트리거는 강의자가 아니면 절대 못 바꾸게 **차단**하는 쪽을 맡는 구조입니다.
- **`posts_public` 뷰**: `posts` 테이블 자체는 SELECT 권한이 없어(위 [RLS 정책 → `posts`](#posts-1) 참고) 이 뷰로만 조회할 수 있습니다. `guest_token`은 완전히 제외하고, `author_id`(uid)도 통째로 숨긴 뒤 `is_anonymous`가 `false`인 글만 `profiles.name`을 조인해서 보여줍니다. 뷰가 `profiles`를 조인할 수 있는 건 Postgres 뷰가 기본적으로 조회자가 아니라 **뷰 소유자의 권한**으로 실행되기 때문으로, `profiles`가 본인만 조회 가능하도록 좁혀져 있어도 뷰 내부 조인에는 영향이 없습니다(수정/삭제 자체는 여전히 `posts` 테이블의 RLS 정책으로 처리).
- **`posts_counts` 뷰는 `post_likes_counts`/`lecture_feedback_votes_counts`와 성격이 다릅니다**: 그 두 뷰는 `voter_key` 노출을 막기 위한 보안 목적이었지만, `posts_counts`가 조회하는 `posts_public`은 이미 전체 공개라 숨길 값이 없습니다. 이 뷰가 필요한 이유는 순전히 **PostgREST가 서버 사이드 `group by` 집계를 지원하지 않기 때문**입니다 — "내 강의" 목록 화면에서 강의마다 게시글 개수를 보여줘야 하는데, 뷰 없이는 강의 하나당 조회를 따로 보내야 하거나(요청 수 증가) 전체 게시글을 다 받아와 클라이언트에서 세야 합니다(대역폭 낭비). `lecture_id`별 `count(*)`만 집계해서, 여러 강의의 개수를 `.in('lecture_id', [...])` 한 번의 요청으로 가져올 수 있게 합니다.
- **`post_likes_counts`/`lecture_feedback_votes_counts` 뷰**: `post_likes`/`lecture_feedback_votes`도 테이블 자체 SELECT는 본인 투표 행(`voter_key` 일치)만 가능하도록 좁혀서(위 [RLS 정책 → `post_likes`](#post_likes-1)/[`lecture_feedback_votes`](#lecture_feedback_votes-1) 참고), 남이 무엇을 눌렀는지는 직접 조회할 수 없습니다. 하지만 좋아요/피드백 개수는 누구나 봐야 하는 값이라, `voter_key` 없이 `count(*)`로 집계만 한 별도 뷰로 공개합니다. `post_likes_counts`는 `post_id`별 좋아요 개수, `lecture_feedback_votes_counts`는 `lecture_id`·`feedback_type`별 좋아요/싫어요 개수(`count(*) filter (where value = 1/-1)`)를 보여줍니다. "내가 이미 눌렀는지"는 이 뷰가 아니라 `post_likes`/`lecture_feedback_votes` 테이블에 본인 `voter_key`로 직접 SELECT해서 확인합니다(RLS가 본인 행만 허용하므로 가능).
- **`lectures_public` 뷰**: `posts_public`과 같은 이유(뷰 소유자 권한으로 `profiles`를 우회 조인)로 강의자 이름을 노출합니다. `profiles` RLS를 완화하는 대신 뷰로 좁힌 이유는, `profiles`를 통째로 공개하면 강의자 이름뿐 아니라 가입한 모든 사용자의 이름을 익명 스크래핑당할 수 있기 때문입니다(공개된 anon key만으로 전체 `profiles` 덤프 가능). `lectures_public`은 이미 존재를 아는 특정 강의 하나의 소유자 이름만 좁게 노출하므로 이런 대량 노출 위험이 없습니다.

## 실시간 접속자 수 (강의별)

- 테이블 추가 없이 Supabase Realtime의 **Presence** 기능으로 구현. Presence는 "지금 이 채널에 누가 붙어있는지"를 웹소켓 연결 기준으로 서버 메모리에서 관리해주는 기능이라, DB에 영속시킬 필요가 없음 (접속자 수는 순간의 상태일 뿐, 이력이 아님).
- 강의(lecture)마다 채널 하나(`lecture:<node_id>` 등)를 만들고, 각 클라이언트가 자신의 **presence key**로 `track()`. `presenceState()`가 반환하는 고유 key 개수 = 접속자 수.
- **presence key 규칙**:
  - 회원: `user_id` 사용 → 같은 계정으로 탭/기기를 여러 개 열어도 key가 같으므로 한 명으로 집계됨.
  - 비회원: 아래 "비회원 익명 식별자"의 로컬(브라우저) 저장 토큰을 그대로 사용 → 같은 브라우저에서 탭을 새로 열어도 토큰이 같아 한 명으로 집계되고, 다른 토큰(다른 브라우저/기기, 또는 저장소 초기화)이면 별도 접속자로 집계됨.
- **`lectures.max_participants`는 입장을 막는 값이 아니라 "실시간 집계(track)에 반영되는 인원의 최대치"로 정의함.** Presence는 웹소켓 채널 상태일 뿐이라, 채널에 등록 안 하고 강의실 페이지 정보만 요청하는 걸 DB/서버 차원에서 막을 방법이 없고(막을 필요도 없다고 판단) — 그래서 정원 자체를 접근 제어 수단으로 쓰지 않기로 함. 채널 구독 직후 첫 sync 시점 인원이 이미 정원이면 그 사람은 `track()`하지 않고 관전만 하고(페이지 이용은 완전히 정상 동작, 카운트에만 안 잡힘), 이후 자리가 나도 재판단은 안 함(새로고침해야 재시도됨). **✅ `frontend`에 구현 완료** — `useCourseRoom.ts`와 `services/api.ts`의 `subscribeToRoomChannel`이 Presence sync/track과 실시간 갱신 Broadcast를 같은 채널로 통합해서 처리합니다(`hooks/useRoomPresence.ts`는 이 통합 과정에서 삭제됨). 호출 방법은 [SUPABASE_GUIDE.md 11번](./SUPABASE_GUIDE.md#11-실시간-접속자-수-realtime-presence) 참고.

## 비회원 익명 식별자: `guest_token` (여러 기능에서 공용으로 사용)

비회원의 신원을 나타내는 토큰을 **`guest_token`**이라고 부르기로 함. **반드시 `crypto.randomUUID()`로 생성**(UUID v4, 122비트 무작위성)해서 브라우저의 **localStorage**(탭 간 공유되는 저장소, sessionStorage 아님)에 한 번 저장하고, 아래 곳에서 동일하게 재사용:
- `posts.guest_token` — 본인 글 수정/삭제 인증 (`posts_update_own`/`posts_delete_own` RLS 정책이 `x-guest-token` 헤더로 읽어서 대조)
- `post_likes` / `lecture_feedback_votes`의 `voter_key` — 중복 투표 방지 (역시 `x-guest-token` 헤더로 대조)
- Presence key — 접속자 수 집계

즉 어느 기능이든 서버에 요청할 때 **`x-guest-token`** 헤더 하나만 실어 보내면 됩니다.

**왜 `crypto.randomUUID()`를 반드시 써야 하는지**: `posts.guest_token`은 `uuid` 타입으로 DB에서 형식이 강제되지만, 그 값이 *얼마나 예측 불가능한지*는 프론트가 실제로 CSPRNG 기반 UUID v4를 생성해야만 보장됩니다. 강의 종료 후에도 `guest_token`을 무효화하지 않고 영구 보존하기로 한 건 이 전제가 성립한다는 가정 위에서 내린 결정입니다 — 짧거나 예측 가능한 값을 쓰면 "우연히 겹치는 비회원이 남의 글을 수정하게 되는" 위험이 실제로 커집니다.

## 배포 현황

- 별도의 Express 백엔드 서버 없이 Supabase(Postgres + Auth + Realtime + RLS)만으로 구성. AI 교정/필터링/유사도 검사 등 서버 로직이 필요한 부분은 Express를 새로 띄우지 않고 **Supabase Edge Function으로 구현·배포 완료**(`ai-correct`, `submit-post` — 호출 방법은 [SUPABASE_GUIDE.md 10번](./SUPABASE_GUIDE.md#10-글-작성제출-ai-correct-submit-post-edge-function), 실제 구현 경위는 [TODO.md 해결된 것](./TODO.md#해결된-것-참고용-기록) 참고).
- 이 문서의 SQL은 `backend/supabase/migrations/`에 마이그레이션 파일로 옮겨져 실제 Supabase 프로젝트(project ref: `zilvdbwoieplhrpjqnlo`)에 적용되어 있습니다.
  - `20260705062713_init_schema.sql` — 테이블/함수·트리거/RLS 초기 스키마 전체
  - `20260705064427_lecturer_permissions.sql` — 강의자 권한 정책(`posts_lecturer_update_status`, `posts_lecturer_delete`, `feedback_lecturer_reset`), `trg_block_status_change` 트리거, `posts_public` 뷰
  - `20260705082805_auth_user_signup_trigger.sql` — 회원가입 시 `profiles` 자동 생성 트리거(`handle_new_user`, `on_auth_user_created`)
  - `20260705090000_delete_own_account_rpc.sql` — 회원 탈퇴 RPC(`delete_own_account`)
  - `20260705132633_fix_anonymize_posts_search_path.sql` — `anonymize_posts_before_profile_delete()`에 `search_path` 고정 (탈퇴 시 발생하던 버그 수정)
  - `20260706032608_lectures_max_participants_check.sql` — `lectures.max_participants`는 `null` 또는 0 이상만 허용하는 체크 제약 추가
  - `20260706053322_unify_language_clause_position.sql` — 함수 정의의 `language plpgsql` 절 위치를 본문 뒤로 통일 (동작 변화 없음)
  - `20260706063127_feedback_votes_allow_like_and_dislike.sql` — `lecture_feedback_votes`의 PK에 `value`를 추가해, 한 사람이 같은 feedback_type에 좋아요/싫어요를 동시에 누를 수 있게 변경
  - `20260706073501_restrict_lecturer_post_rules_by_mode.sql` — `restrict_lecturer_post_rules()`가 `x-mode` 헤더를 확인해, 강의를 만든 계정이 수강생 모드로 들어왔을 땐 게시글 작성 제한을 적용하지 않도록 변경 (아래 마이그레이션으로 대체됨)
  - `20260706075425_posts_created_mode_replaces_trigger.sql` — `restrict_lecturer_post_rules` 트리거/`x-mode` 헤더 방식을 폐기하고, `posts.created_mode` 컬럼 + 테이블 `check` 제약(답글+opinion 타입) + RLS 정책(`posts_insert_lecturer_mode_matches_owner`, `posts_update_lecturer_mode_matches_owner`)으로 대체
  - `20260706081432_posts_resolved_at_trigger_and_check.sql` — `status`가 `resolved`로 바뀌면 `resolved_at`을 자동으로 채우고 되돌아가면 `null`로 되돌리는 `trg_set_resolved_at` 트리거 추가, `check ((status = 'resolved') = (resolved_at is not null))` 양방향 제약 추가
  - `20260706084256_unify_trigger_and_policy_names.sql` — 트리거 이름을 함수 이름 축약 없이 그대로 쓰도록 통일(`on_auth_user_created` → `trg_handle_new_user`, `trg_block_status_change` → `trg_block_status_change_by_non_lecturer`, `trg_set_resolved_at` → `trg_set_resolved_at_on_status_change`), RLS 정책 이름의 테이블 접두사를 축약 없이 통일(`join_codes_*` → `lecture_join_codes_*`, `feedback_*` → `lecture_feedback_votes_*`)
  - `20260706093000_restrict_public_read_access.sql` — `profiles`를 본인만 조회 가능하게 좁히고, `posts`/`post_likes`/`lecture_feedback_votes`의 테이블 자체 SELECT를 회수(`posts`)하거나 본인 행만(`post_likes`/`lecture_feedback_votes`) 조회 가능하도록 제한. `posts_public` 뷰에서 `author_id`를 숨기고 `is_anonymous`에 따라 `profiles.name`만 조건부로 노출하도록 재정의, 좋아요/피드백 집계용 `post_likes_counts`/`lecture_feedback_votes_counts` 뷰 추가. `nodes`/`lectures`/`lecture_join_codes`/`my_nodes`는 강의 입장 흐름상 소유자가 아닌 사람도 읽어야 해서 기존 정책 유지
  - `20260706101235_reopen_resolved_post_on_question_reply.sql` — 해결된 게시글에 질문 타입 답글이 달리면 다시 미해결로 전환하는 `trg_reopen_resolved_post_on_question_reply` 트리거 추가, `trg_block_status_change_by_non_lecturer`에 `app.bypass_status_lock` 플래그 우회 로직 추가
  - `20260706101723_reopen_resolved_post_security_definer.sql` — `posts` 직접 SELECT 회수/RLS 때문에 `reopen_resolved_post_on_question_reply()`가 조상 게시글을 조회·갱신 못 하던 문제를 `SECURITY DEFINER` + `search_path` 고정으로 수정
  - `20260706122114_my_nodes_only_favorite_lecturer_mode.sql` — `my_nodes`(즐겨찾기)는 남이 강의자 모드로 만든 노드만 등록 가능하도록 `RESTRICTIVE` RLS 정책(`my_nodes_only_favorite_lecturer_mode_insert`/`_update`) 추가
  - `20260706110000_profiles_rename_columns.sql` — `profiles` 컬럼 이름을 단순화(`display_name` → `name`, `last_mode` → `mode`). `posts_public` 뷰와 체크 제약은 컬럼을 attnum으로 참조해 자동으로 따라가고, `handle_new_user()` 함수만 새 컬럼명에 맞춰 갱신
  - `20260706130000_delete_own_account_use_sql_language.sql` — `delete_own_account()`를 `plpgsql`에서 `sql` 언어로 변경 (분기/변수 없는 단순 `DELETE` 한 줄이라 트리거 함수들과 달리 `plpgsql`이 필요 없음)
  - `20260706150816_nodes_parent_ownership_mode_match.sql` — `nodes.parent_id`가 가리키는 부모 노드와 `created_by`/`created_mode`가 일치해야 함을 강제하는 `trg_enforce_nodes_parent_ownership` 트리거 추가
  - `20260706154459_my_nodes_folder_must_be_own_student_folder.sql` — `my_nodes.folder_id`(즐겨찾기를 정리해둔 내 개인 폴더)가 실제로 내가 수강생 모드로 만든 폴더인지 확인하는 `RESTRICTIVE` RLS 정책(`my_nodes_folder_must_be_own_student_folder_insert`/`_update`, 아래 마이그레이션에서 이름 변경됨) 추가
  - `20260706154910_unify_my_nodes_policy_names.sql` — `my_nodes` RLS 정책 이름을 다른 테이블과 같은 `<테이블>_<동작>_<설명>` 순서로 통일(`my_nodes_only_favorite_lecturer_mode_insert` → `my_nodes_insert_only_favorite_lecturer_mode`, `_update`도 동일, `my_nodes_folder_must_be_own_student_folder_insert` → `my_nodes_insert_folder_must_be_own_student_folder`, `_update`도 동일)
  - `20260706161208_get_my_favorite_subtrees_rpc.sql` — 즐겨찾기 루트별 서브트리를 `anchor_node_id`로 태그해 한 번에 가져오는 RPC(`get_my_favorite_subtrees`) 추가
  - `20260706161244_move_delete_own_account_language_clause.sql` — `delete_own_account()`의 `language sql` 절 위치를 본문 뒤로 옮겨 다른 함수들과 스타일 통일 (동작 변화 없음)
  - `20260706163119_rename_reopen_to_unresolve.sql` — `reopen_resolved_post_on_question_reply()`/`trg_reopen_resolved_post_on_question_reply`를 `unresolve_post_on_question_reply()`/`trg_unresolve_post_on_question_reply`로 개명 (동작 변화 없음, "reopen"이 실제 동작에 비해 모호해서 상태값 이름과 대칭되게 변경)
  - `20260706170256_rename_columns_and_my_nodes_table.sql` — 이름을 더 명확하게 다듬기 위한 리네임(동작 변화 없음): `my_nodes` → `favorites`, `nodes.node_type` → `nodes.type`, `lectures.node_id` → `lectures.id`, `my_nodes.folder_id` → `favorites.anchor_id`, `posts.post_type` → `posts.type`. 텍스트 기반이라 리네임을 자동으로 안 따라가는 `block_status_change_by_non_lecturer()`/`unresolve_post_on_question_reply()`/`get_my_favorite_subtrees()` 함수 본문과 `posts_public` 뷰, `favorites`의 RLS 정책 이름(`favorites_owner_all` 등)도 같이 갱신
  - `20260707023348_posts_counts_view.sql` — "내 강의" 목록에서 강의별 게시글 개수를 보여주기 위한 `posts_counts` 뷰 추가(`lecture_id`별 `count(*)`). 다른 counts 뷰와 달리 보안 목적이 아니라, PostgREST가 서버 사이드 `group by`를 지원하지 않아 여러 강의의 개수를 한 번의 요청으로 가져오기 위한 효율성 목적
  - `20260707120000_join_code_issue_functions.sql` — `lecture_join_codes.code` 컬럼에 랜덤 4자리 값 `default` 추가, 발급/재발급 RPC(`get_or_create_join_code`, `reissue_join_code`) 추가, 직접 쿼리로 발급/재발급을 못 하게 `INSERT`/`UPDATE` 테이블 권한을 `anon`/`authenticated`에서 회수, `lecture_join_codes_owner_all`(insert 전용, REVOKE와 SECURITY DEFINER 우회로 이제 도달 불가능한 죽은 정책) 삭제
  - `20260707151700_posts_author_guest_token_exclusive.sql` — `posts.author_id`와 `guest_token`이 동시에 값을 갖지 못하게 막는 `posts_author_id_guest_token_exclusive` 체크 제약 추가(둘 다 `null`인 상태는 허용)
  - `20260707153000_drop_redundant_guest_token_guard.sql` — 위 제약으로 인해 `posts_update_own`/`posts_delete_own` 정책의 `guest_token` 비교 조건 앞에 있던 `author_id is null and` 가드가 논리적으로 중복이 되어 제거
  - `20260707153500_posts_public_is_mine.sql` — `posts_public` 뷰에 `is_mine` boolean 컬럼 추가. 원본 식별자(`author_id`/`guest_token`)를 노출하지 않으면서 "본인 글인지" 여부만 계산해서 알려줘 프론트가 수정/삭제 버튼을 조건부로 노출할 수 있게 함
  - `20260707160000_posts_public_add_created_mode.sql` — `posts_public` 뷰에 `created_mode` 컬럼 추가. 이 뷰가 `posts.created_mode` 컬럼이 생기기 전에 먼저 만들어진 뒤로 이후 재생성(`restrict_public_read_access`, `rename_columns_and_my_nodes_table`, `posts_public_is_mine`)에서 계속 누락되어 있던 것을 뒤늦게 발견해서 추가
  - `20260707170000_posts_guest_token_uuid_and_xor_constraint.sql` — 강의 종료 후 `guest_token` 무효화 로직은 도입하지 않기로 확정(생일 문제 계산 근거는 [TODO.md](./TODO.md#해결된-것-참고용-기록) 참고). `posts.guest_token`을 `text`에서 `uuid`로 바꿔 형식을 DB 레벨에서 강제하고(`post_likes`/`lecture_feedback_votes.voter_key`와 동일 타입), `posts_author_id_guest_token_exclusive` 제약을 `posts_author_id_xor_guest_token`(정확히 하나만 값을 가짐)으로 강화. `posts_update_own`/`posts_delete_own`/`posts_public.is_mine`의 `guest_token` 비교도 헤더 값을 `::uuid`로 캐스팅하도록 갱신
  - `20260707180000_posts_grant_select_for_rls_update_delete.sql` — 프론트에서 답글 수정/질문 해결 처리가 42501로 막히는 버그 발견(원인: `20260706093000`에서 `posts`의 SELECT를 통째로 회수해, UPDATE 정책이 멀쩡해도 GRANT 단계에서부터 막힘). `grant select on posts to anon, authenticated`로 우선 복구했으나, 이것만으론 부족했음이 곧 드러남(아래 항목 참고)
  - `20260707190000_posts_select_policy_for_update_delete_rls.sql` — 위 GRANT 복구만으로 여전히 UPDATE/DELETE가 0행 매치로 실패하는 걸 발견. 진짜 원인은 Postgres가 UPDATE/DELETE의 대상 행을 찾을 때 SELECT 커맨드에 대한 RLS 가시성도 요구한다는 것이었고, `posts`에 SELECT 정책이 하나도 없어(기본값: 전부 안 보임) UPDATE/DELETE 전용 정책과 무관하게 항상 실패하고 있었음. UPDATE/DELETE가 허용하는 행과 정확히 같은 조건으로 `posts_select_own`/`posts_select_lecturer` SELECT 정책을 추가해 가시성을 확보하고, `guest_token`/`author_id` 노출을 막기 위해 `revoke select on posts` 후 이 두 컬럼만 제외하고 다시 `grant select (컬럼 목록)`으로 컬럼 단위 제한. 실제 REST API로 회원/비회원/강의자 세 경로 모두 수정·삭제가 되는지, `guest_token`/`author_id`는 여전히 직접 조회가 막히는지 라이브에서 검증 완료
  - `20260707200000_post_drafts_staging_table.sql` — `submit-post`에서 유사 질문이 발견됐을 때 "강행 제출"을 처리하기 위한 스테이징 테이블 `post_drafts` 신설. 원래 글 내용(`lecture_id`/`parent_id`/`author_id`/`is_anonymous`/`guest_token`/`type`/`content`/`created_mode`)을 그대로 담아두고, `created_at`은 스테이징 시점이 아니라 나중에 강행 제출이 실제 실행되는 시점 값이 되도록 INSERT 시 명시적으로 넣지 않고 DB `default now()`에 맡김(강행 제출 INSERT에서도 동일하게 `created_at`을 생략해 실제 제출 순간이 그대로 기록되게 함). RLS는 켜두되 정책을 하나도 만들지 않고 `anon`/`authenticated`에서 `revoke all`로 완전히 차단 — `service_role`만 접근 가능(어차피 BYPASSRLS라 정책 여부와 무관하게 접근 가능하므로 정책을 안 만들어도 무방). "취소"는 별도 API 없이 그냥 드래프트를 방치하는 것으로 처리(고아 드래프트는 무해하며 나중에 일괄 정리하면 됨), "강행 제출"만 드래프트를 읽고 요청자 identity를 대조한 뒤 삭제하고 실제 INSERT로 이어짐
  - `20260707210000_get_similarity_candidates_rpc.sql` — `submit-post`의 유사도 검사가 AI에게 넘길 비교 대상을 얻기 위한 RPC. 같은 강의의 미해결(`status = 'unresolved'`) 질문 게시글들과 그 답글 트리 전체(재귀 CTE로 `parent_id` 체인을 끝까지 따라감)를 `(id, content)` 쌍으로 반환
  - `20260707211000_restrict_get_similarity_candidates_execute.sql` — 새 함수가 기본으로 `PUBLIC`에 EXECUTE 권한이 열려 있는 Postgres 기본 동작을 발견하고, `anon`/`authenticated`/`public`의 실행 권한을 회수하고 `service_role`에만 부여 — 클라이언트가 이 RPC를 직접 호출해 다른 사람 글 내용을 긁어가지 못하게 함(`submit-post`를 거치지 않은 직접 호출 차단)
  - `20260707220448_revoke_anon_execute_on_member_only_rpcs.sql` — 바로 위 마이그레이션에서 알아챈 "새 함수는 기본으로 `PUBLIC` 회수와 별개로 `anon`/`authenticated`에 EXECUTE가 자동으로 열려 있다"는 함정이, `delete_own_account()`/`get_or_create_join_code()`/`reissue_join_code()`에도 똑같이 남아있던 걸 뒤늦게 발견. 이 세 함수는 `revoke all ... from public`만 해뒀어서 `anon`의 EXECUTE가 그대로 살아있었음(각 함수 본문이 `auth.uid()`로 대상을 제한해 실질 피해는 없었지만, 문서에 "비로그인은 호출 자체가 안 된다"고 서술한 것과 실제가 어긋나 있었음) — 세 함수 모두 `anon`의 EXECUTE를 명시적으로 회수해 문서 서술과 실제를 일치시킴
  - `20260707220741_document_lecture_feedback_votes_select_lecturer.sql` — `lecture_feedback_votes_select_lecturer` 정책이 마이그레이션 파일을 거치지 않고 원격 DB에 직접(대시보드 등으로) 추가되어 있던 걸 뒤늦게 발견해 버전 관리에 편입. 강의자가 자기 강의의 피드백 투표를 `voter_key` 제한 없이 전체 행 단위로 조회할 수 있게 해주는 정책으로, 이미 원격 DB에 존재하므로 `drop policy if exists` 후 재생성하는 멱등적 형태로 작성해 실제 스키마는 바뀌지 않음
  - `20260707230000_get_similarity_candidates_drop_redundant_parent_filter.sql` — `get_similarity_candidates()`의 root 선택 조건에서 `parent_id is null`을 제거. `posts`의 `check ((parent_id is null) = (status is not null))` 제약 때문에 `status = 'unresolved'`(not null) 조건만으로 이미 `parent_id is null`이 보장돼 논리적으로 중복이었음. 겸사겸사 비교 범위도 명시적으로 확정: `type`(질문/의견) 무관하게 같은 강의의 미해결 최상위 게시글 전부 + 그 답글을 후보로 삼음(원래도 SQL에 `type` 필터가 없어 실제로는 이렇게 동작하고 있었음) — `similarity.ts` 주석과 유사도 검사 프롬프트 문구도 이에 맞춰 정리
  - `20260708120000_enforce_nodes_parent_not_lecture.sql` — `nodes.parent_id`가 강의(`type = 'lecture'`) 노드를 가리키지 못하게 강제. 강의는 트리의 리프여야 하는데 이를 막는 제약이 없어서, 라이브 DB에 강의를 부모로 둔 노드가 실제로 하나 생겨 있던 걸 발견(테스트 중 수동으로 만든 데이터, 이후 올바른 부모로 직접 수정). 부모 행의 `type`을 참조해야 해서 `check` 제약으로는 표현 불가 → 기존 `enforce_nodes_parent_ownership()` 트리거에 조건 추가. 실제 INSERT로 차단되는지 검증 완료(이후 `20260708160000`에서 이 트리거/함수 이름을 검사 범위에 맞게 개명함)
  - `20260708130000_posts_deleted_author_placeholder.sql` — 탈퇴한 회원이 실명으로 쓴 글을 익명 처리하지 않고 "탈퇴한 계정입니다"로 표시할 수 있도록 스키마 변경. `anonymize_posts_before_profile_delete()` 트리거/함수를 삭제하고(더 이상 탈퇴 시 글을 강제로 `is_anonymous = true`로 바꾸지 않음), 이로 인해 깨지는 두 체크 제약을 손봄: `posts_check`(작성자 없으면 무조건 익명)를 `posts_guest_must_be_anonymous`(`guest_token`이 있으면, 즉 진짜 비회원 글이면 반드시 익명)로 좁히고, `posts_author_id_xor_guest_token`(정확히 하나만 값을 가짐)을 `posts_author_id_guest_token_not_both_set`(둘 다 값을 갖지는 않음, 둘 다 `null`은 허용)으로 다시 완화. 라이브 DB에서 실명 글을 쓴 회원이 탈퇴하는 시나리오를 직접 실행해 제약 위반 없이 통과하는지 검증 완료
  - `20260708140000_posts_lecturer_mode_not_anonymous.sql` — 강의자 모드로 쓴 글(`created_mode = 'lecturer'`)은 반드시 실명이어야 한다는 `posts_lecturer_mode_not_anonymous` 체크 제약 추가. 바로 위 변경으로 회원 탈퇴가 더 이상 `is_anonymous`를 건드리지 않게 되어, 이 제약이 탈퇴 여부와 무관하게 항상 성립하게 됨. 라이브 DB에서 강의자 모드 실명 답글을 쓴 계정이 탈퇴하는 시나리오까지 함께 검증 완료
  - `20260708150000_rename_auto_generated_check_constraints.sql` — Postgres가 이름 없는 `check` 제약에 자동으로 붙이는 `<table>[_컬럼]_check[N]` 이름들을 이 프로젝트 스타일(서술적 이름)로 통일. 일부는 과거 컬럼 리네임(`node_type`→`type`, `post_type`→`type`, `last_mode`→`mode`) 이후에도 옛 컬럼명을 그대로 가진 이름이라 이번에 같이 바로잡음(`nodes_node_type_check`→`nodes_type_valid`, `posts_post_type_check`→`posts_type_valid`, `profiles_last_mode_check`→`profiles_mode_valid` 등). `rename constraint`는 이름표만 바꾸는 메타데이터 작업이라 데이터/락 영향 없음. 이 문서의 모든 테이블 SQL도 새 이름을 명시하도록 갱신
  - `20260708160000_rename_enforce_nodes_parent_ownership_to_rules.sql` — `enforce_nodes_parent_ownership()`/`trg_enforce_nodes_parent_ownership`이 `20260708120000`부터 소유권 검사뿐 아니라 "부모가 강의면 안 됨" 구조 검사까지 하게 됐는데 이름은 여전히 "ownership"만 검사하는 것처럼 보여서, `enforce_nodes_parent_rules()`/`trg_enforce_nodes_parent_rules`로 개명(`alter function ... rename to`/`alter trigger ... rename to`라 함수 본문·트리거 동작은 그대로, 이름표만 바뀜). 개명 후에도 강의를 부모로 지정하면 여전히 차단되는지 재검증 완료
  - `20260708170000_lectures_public_view.sql` — 강의실 페이지에서 강의자 이름이 안 보이던 문제(`profiles`가 본인만 SELECT 가능해서, 강의를 만든 본인이 아니면 이름을 조회할 수 없었음) 해결용 `lectures_public` 뷰 추가. `posts_public`과 같은 원리(뷰 소유자 권한으로 `profiles` 우회 조인)로 강의 제목/일시/장소와 함께 강의자 이름(`lecturer_name`)을 공개 노출. `profiles` RLS 자체를 완화하지 않은 이유는 그러면 강의자뿐 아니라 가입한 모든 사용자 이름을 익명 스크래핑당할 수 있기 때문(자세한 내용은 "정책·트리거·뷰 보완 설명" 참고)
  - `20260708180000_feedback_type_dark_to_unclear.sql` — 피드백 유형 `dark`를 `unclear`로 변경(조명이 어둡다는 뜻으로 오해되기 쉬워서, 원래 의도인 "글씨가 작아서/흐려서 안 보임"에 맞게). 이전에 한 번 이 값을 바꾼 적이 있었지만 그땐 이미 적용된 `init_schema.sql`의 텍스트만 고치고 실제 `ALTER`를 안 해서 라이브 DB와 프론트가 계속 `dark`를 쓰고 있었고, 이번엔 기존 데이터를 `unclear`로 `UPDATE`한 뒤 `lecture_feedback_votes_feedback_type_valid` 제약을 실제로 `ALTER`해서 라이브 DB에 반영. 프론트(`FeedbackKey`/`FEEDBACK_KEYS`/`FEEDBACK_LABELS`)도 `unclear` 기준으로 갱신됨
  - `20260708190000_posts_realtime_publication.sql` — 강의실 게시글 실시간 갱신(TODO.md #6) 구현의 선행 작업으로 `posts`를 `supabase_realtime` publication에 추가(`postgres_changes` 이벤트 자체가 발생하려면 필요). 라이브 검증 결과, 이것만으로는 비회원까지 안전하게 실시간 구독을 붙일 수 없다는 게 확인됨 — `posts_select_own`의 `guest_token` 헤더 비교 조건이 WebSocket 연결에선 평가될 방법이 없어(커스텀 헤더를 못 실음), guest_token으로 쓴 글의 INSERT 이벤트가 매칭 identity 없는 연결엔 전달 안 됨. 자세한 내용과 남은 과제는 TODO.md #6 참고
  - `20260708200000_broadcast_triggers_for_realtime_updates.sql` — `postgres_changes` 대신 Broadcast from Database(`realtime.send()`)로 방향을 바꿔 강의 페이지 실시간 갱신을 실제로 구현. `posts`/`post_likes`/`lecture_feedback_votes`/`nodes`(강의 제목)/`lectures`(일정/장소/정원) 다섯 테이블에 `SECURITY DEFINER` 트리거를 달아 변경이 생기면 `lecture:<lecture_id>` 채널로 브로드캐스트. `realtime.send()`는 원본 테이블 RLS와 무관한 별도 경로(`realtime.messages`에 INSERT할 뿐)라 회원/비회원 구분 없이 받을 수 있음. 계정 이름(`profiles.name`)은 한 사람이 여러 강의를 소유할 수 있어 채널 하나로 안 끝나는 부채살 구조라 이번 범위에서 제외. 자세한 설계는 [SQL → 트리거 함수 → 실시간 갱신용 Broadcast 트리거 5종](#실시간-갱신용-broadcast-트리거-5종), 프론트 구독 방법은 [SUPABASE_GUIDE.md](./SUPABASE_GUIDE.md) 참고. 라이브 리스너로 다섯 이벤트 전부 실제 발신·수신 확인 완료
  - `20260708210000_lectures_end_after_start.sql` — `lectures.end_time`이 `start_time`보다 늦어야 한다는 `lectures_end_after_start` 체크 제약 추가. 라이브 DB에 이미 위반하는 테스트성 데이터 2건(`DUMMY_DATA.md` 시드 아님, 수동 테스트 중 생성된 것으로 보임)이 있어서 `end_time`을 `start_time` + 1시간으로 먼저 고친 뒤 제약 추가. 실제 UPDATE로 차단되는 것까지 검증 완료
  - `20260708220000_posts_counts_top_level_only.sql` — `posts_counts`가 답글까지 포함해 `lecture_id`별 `posts` 전체를 세고 있었는데, 프론트(`CourseMeta.tsx`)는 이 값을 "게시글 {n}개"로 표시하고 있어 최상위 게시글만 세도록 `where parent_id is null` 추가. 라이브 DB에서 답글 포함 10건/최상위만 6건인 강의로 값이 6으로 바뀌는 것까지 확인
  - `20260708230000_user_mode_enum.sql` — `profiles.mode`/`nodes.created_mode`/`posts.created_mode`/`post_drafts.created_mode` 네 컬럼이 각자 `text` + `check (... in ('lecturer', 'student'))`로 값 목록을 중복 강제하던 걸 `user_mode` enum 타입 하나로 통일. `nodes.created_mode`/`posts.created_mode`를 참조하는 RLS 정책(`favorites_*_only_favorite_lecturer_mode`, `favorites_*_anchor_must_be_own_student_folder`, `posts_*_lecturer_mode_matches_owner`)과 `created_mode`를 리터럴과 비교하는 `check` 제약(`nodes_lecture_requires_lecturer_mode`, `posts_lecturer_mode_reply_opinion_only`, `posts_lecturer_mode_not_anonymous`), `posts.created_mode`를 select하는 `posts_public` 뷰는 컬럼 타입 변경 자체를 막아서(각각 "cannot alter type of a column used in a policy definition"/"...used by a view or rule", 그리고 이미 저장된 표현식의 리터럴이 text로 고정돼 있어 나는 "operator does not exist: user_mode = text") 전부 지웠다가 타입 변경 후 원래 정의 그대로 다시 만듦. PostgREST로 조회 시 다른 문자열 컬럼과 동일하게 평범한 문자열로 직렬화되어 프론트는 변경 없음 — 라이브 DB에서 `posts_public` 조회로 확인 완료
  - `20260708240000_nodes_prevent_parent_cycle.sql` — `enforce_nodes_parent_rules()`가 부모가 강의가 아닌지/소유자·모드 일치만 검사하고 `parent_id` 체인의 사이클은 막지 않던 문제(TODO #2) 해결. UPDATE로 `parent_id`가 실제로 바뀔 때만, (1) 새 부모가 자기 자신인 경우와 (2) 새 부모가 자기 자신의 자손 트리에 속하는 경우(`with recursive`로 확인)를 막도록 함수에 검사 추가. 라이브 DB에서 A→B→C 체인을 만들어 A의 부모를 C로 바꾸는 시도(사이클)와 A의 부모를 자기 자신으로 바꾸는 시도 둘 다 거부되는 것, C를 A 밑으로 정상 이동하는 건 그대로 성공하는 것까지 확인 완료
  - `20260708250000_pg_cron_cleanup_jobs.sql` — `pg_cron` 확장을 활성화하고 정리 작업 2개 등록(TODO #1/#2 구현). `purge_expired_join_codes`(15분마다)는 강의 `end_time`이 1시간 넘게 지난 `lecture_join_codes`를 삭제, `purge_stale_post_drafts`(매일 UTC 18시)는 하루 지난 `post_drafts`를 삭제. 자세한 설계는 [예약 작업 (pg_cron)](#예약-작업-pg_cron) 참고. 라이브 DB에서 만료/보관 기간 경계를 넘긴 행과 안 넘긴 행을 각각 만들어 실제 삭제 쿼리로 의도한 행만 지워지는 것까지 확인 완료
