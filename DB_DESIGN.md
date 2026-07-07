# DB 설계

## 목차

- [스키마 개요](#스키마-개요)
- [SQL](#sql)
  - [테이블](#테이블)
    - [`profiles`](#profiles)
    - [`nodes`](#nodes)
    - [`favorites`](#favorites)
    - [`lectures`](#lectures)
    - [`lecture_join_codes`](#lecture_join_codes)
    - [`lecture_feedback_votes`](#lecture_feedback_votes)
    - [`posts`](#posts)
    - [`post_likes`](#post_likes)
  - [뷰](#뷰)
    - [`posts_public`](#posts_public)
    - [`posts_counts`](#posts_counts)
    - [`post_likes_counts`](#post_likes_counts)
    - [`lecture_feedback_votes_counts`](#lecture_feedback_votes_counts)
  - [트리거 함수](#트리거-함수)
    - [`anonymize_posts_before_profile_delete()`](#anonymize_posts_before_profile_delete)
    - [`block_status_change_by_non_lecturer()`](#block_status_change_by_non_lecturer)
    - [`set_resolved_at_on_status_change()`](#set_resolved_at_on_status_change)
    - [`unresolve_post_on_question_reply()`](#unresolve_post_on_question_reply)
    - [`enforce_nodes_parent_ownership()`](#enforce_nodes_parent_ownership)
    - [`handle_new_user()`](#handle_new_user)
  - [RPC 함수](#rpc-함수)
    - [`delete_own_account()`](#delete_own_account)
    - [`get_my_favorite_subtrees()`](#get_my_favorite_subtrees)
    - [`get_or_create_join_code()`](#get_or_create_join_code)
    - [`reissue_join_code()`](#reissue_join_code)
  - [접근 제어 (RLS 정책 및 테이블 권한)](#접근-제어-rls-정책-및-테이블-권한)
    - [`profiles`](#profiles-1)
    - [`nodes`](#nodes-1)
    - [`favorites`](#favorites-1)
    - [`lectures`](#lectures-1)
    - [`lecture_join_codes`](#lecture_join_codes-1)
    - [`lecture_feedback_votes`](#lecture_feedback_votes-1)
    - [`posts`](#posts-1)
    - [`post_likes`](#post_likes-1)
- [설계 노트](#설계-노트)
  - [테이블 관계 및 트리 구조](#테이블-관계-및-트리-구조)
  - [삭제 전파 (cascade)](#삭제-전파-cascade)
  - [정책·트리거·뷰 보완 설명](#정책트리거뷰-보완-설명)
- [실시간 접속자 수 (강의별)](#실시간-접속자-수-강의별)
- [비회원 익명 식별자: `guest_token`](#비회원-익명-식별자-guest_token-여러-기능에서-공용으로-사용)
- [배포 현황](#배포-현황)

## 스키마 개요

| 테이블 | 대응하는 기능 |
|---|---|
| `profiles` | 회원(Google OAuth) 부가정보 |
| `nodes` | 강의 폴더 + 강의 통합 트리 |
| `favorites` | "내 강의" 즐겨찾기 (수강생 모드) |
| `lectures` | 강의의 부가 속성 (시작/종료 시각, 장소, 최대인원) — 입장은 `nodes.id`(UUID)를 URL/QR로 사용 |
| `lecture_join_codes` | 강의 입장용 4자리 숫자 코드 (발급/재발급/파기 가능, 즐겨찾기 등록용 코드와는 별개). 발급/재발급은 `get_or_create_join_code()`/`reissue_join_code()` RPC로만 가능 |
| `lecture_feedback_votes` | 실시간 피드백(추워요/더워요/소리 작아요/잘 안 보여요) 좋아요/싫어요 |
| `posts` | 게시글 + 답글 통합 트리, 질문/의견 타입, 미해결/해결, 비회원 인증(`guest_token`) |
| `post_likes` | 게시글/답글 좋아요 |
| `posts_public` (뷰) | `posts`에서 `guest_token`/`author_id`를 뺀 공개 조회용 뷰(비익명 글만 작성자 이름 노출). 프론트는 `posts` 대신 이 뷰를 조회 |
| `posts_counts` (뷰) | `posts`를 `lecture_id`별로 `count(*)`한 게시글 개수 집계 뷰. `posts_public`처럼 숨길 값이 있어서가 아니라, 여러 강의의 개수를 한 번의 요청으로 가져오기 위한 효율성 목적 |
| `post_likes_counts` (뷰) | `post_likes`에서 `voter_key` 없이 게시글별 좋아요 개수만 집계한 공개 조회용 뷰 |
| `lecture_feedback_votes_counts` (뷰) | `lecture_feedback_votes`에서 `voter_key` 없이 강의·피드백 유형별 좋아요/싫어요 개수만 집계한 공개 조회용 뷰 |

## SQL

### 테이블

#### `profiles`

Supabase Auth 사용자(`auth.users`)를 확장하는 회원 부가정보 테이블입니다. `id`가 `auth.users(id)`를 그대로 참조하며 `on delete cascade`라 회원 탈퇴 시 프로필도 함께 삭제됩니다. `mode`는 로그인 시 자동으로 진입할 모드(강의자/수강생)를 저장합니다.

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  mode text not null default 'student' check (mode in ('lecturer', 'student'))
);
```

#### `nodes`

강의 폴더와 강의를 하나의 트리로 묶는 핵심 테이블로, `parent_id`가 자기 자신을 참조해 깊이 제한 없는 트리를 이룹니다. 폴더를 삭제하면 `on delete cascade`로 하위 노드가 재귀적으로 전부 삭제됩니다. `created_by`는 만든 사람이 탈퇴해도 `on delete set null`이라 강의/폴더 자체는 유지되고 작성자 정보만 사라집니다. `created_mode`는 같은 계정이 강의자/수강생 어느 모드에서 만들었는지를 구분하며, `check (type <> 'lecture' or created_mode = 'lecturer')` 제약으로 강의(`lecture`)는 항상 강의자 모드에서만 만들어지도록 강제합니다. `created_at`은 기본 정렬 기준(생성 시각순)이고, 수동 정렬 기능이 추가되면 그때 `position` 컬럼을 별도로 추가할 계획입니다.

```sql
create table nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references nodes(id) on delete cascade,
  type text not null check (type in ('folder', 'lecture')),
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_mode text not null check (created_mode in ('lecturer', 'student')),
  created_at timestamptz default now(),
  check (type <> 'lecture' or created_mode = 'lecturer')
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

강의(`nodes.type = 'lecture'`)의 부가 속성을 담는 1:1 테이블로, `id`가 `nodes(id)`를 그대로 참조합니다. 입장 URL/QR은 별도 코드 없이 이 `id`(=`nodes.id`, UUID)를 그대로 사용하고(`/join/<id>`), 같은 `id`를 "즐겨찾기 등록 코드"로도 재사용합니다(강의뿐 아니라 강의 폴더도 이 코드로 `favorites`에 등록 가능). `max_participants`는 미설정(`null`) 또는 0 이상만 허용합니다.

```sql
create table lectures (
  id uuid primary key references nodes(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location text,
  max_participants int check (max_participants is null or max_participants >= 0)
);
```

#### `lecture_join_codes`

강의 입장 전용 4자리 숫자 코드로, 즐겨찾기 등록용 `id` 코드와는 별개입니다. 필요할 때 발급(INSERT)하고 안 쓰면 파기(DELETE)하는 방식이라, 시간이 안 겹치면 다른 강의가 같은 번호를 바로 재사용할 수 있습니다. `lecture_id`는 `unique` 제약으로 강의당 활성 코드가 1개만 존재하도록 합니다. 발급/재발급은 [`get_or_create_join_code()`](#get_or_create_join_code)/[`reissue_join_code()`](#reissue_join_code) RPC로만 가능합니다(자세한 이유는 해당 함수 설명 참고).

```sql
create table lecture_join_codes (
  code text primary key check (code ~ '^[0-9]{4}$'),
  lecture_id uuid not null unique references lectures(id) on delete cascade,
  issued_at timestamptz default now()
);
```

#### `lecture_feedback_votes`

실시간 피드백(추워요/더워요/소리 작아요/잘 안 보여요)의 좋아요/싫어요를 기록합니다. PK에 `value`까지 포함시켜, 한 사람이 같은 `feedback_type`에 좋아요/싫어요를 동시에 독립적으로 누를 수 있게 합니다(`voter_key`만으로 PK를 잡으면 둘 중 하나만 가능해짐). 좋아요/싫어요 개수는 각각 `count(*) filter (where value = 1)`/`count(*) filter (where value = -1)`로 집계해 화면에 따로 표시하고, 4개 피드백 유형을 정렬할 때는 `sum(value)`(좋아요 - 싫어요 순수 점수)를 기준으로 사용합니다. 강의자가 "초기화"를 누르면 해당 `lecture_id`의 행을 전부 삭제합니다.

```sql
create table lecture_feedback_votes (
  lecture_id uuid references lectures(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('cold', 'hot', 'quiet', 'unclear')),
  voter_key uuid not null,
  value smallint not null check (value in (1, -1)),
  primary key (lecture_id, feedback_type, voter_key, value)
);
```

#### `posts`

게시글과 답글을 하나로 통합한 자기참조 트리로, `parent_id`가 `null`이면 최상위 게시글, 값이 있으면 답글입니다(무한 depth). 최상위 글을 삭제하면 답글도 `on delete cascade`로 재귀 삭제됩니다. `author_id`는 비회원이면 `null`이고, 회원이 탈퇴해도 `on delete set null`로 글은 남고 작성자 정보만 사라집니다. `guest_token`은 비회원 글 수정/삭제 인증용이며, 강의 종료 후 무효 처리는 `lectures.end_time` 비교로 앱/RLS에서 판단합니다. `status`는 최상위 게시글만 사용(답글은 `null`)하고, `resolved_at`은 해결됨으로 바뀐 시각으로 해결된 게시글 정렬 기준이며 미해결로 되돌아가면 다시 `null` 처리됩니다. `created_mode`는 강의자 모드/수강생 모드 중 어느 화면에서 썼는지를 저장해 화면에서 색을 구분하는 데 씁니다. 네 개의 `check` 제약은 각각: 작성자가 없으면(비회원) 반드시 익명이어야 함, 최상위 게시글은 `status` 필수·답글은 `status` 필수 `null`, 강의자 모드로 쓴 글은 답글+`opinion` 타입만 가능, `resolved`일 때만 `resolved_at`이 존재하도록 양방향 강제합니다.

```sql
create table posts (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references lectures(id) on delete cascade,
  parent_id uuid references posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  is_anonymous boolean not null default true,
  guest_token text,
  type text not null check (type in ('question', 'opinion')),
  status text check (status in ('unresolved', 'resolved')),
  resolved_at timestamptz,
  content text not null,
  created_at timestamptz default now(),
  created_mode text not null default 'student' check (created_mode in ('lecturer', 'student')),
  check (author_id is not null or is_anonymous = true),
  check ((parent_id is null) = (status is not null)),
  check (created_mode <> 'lecturer' or (parent_id is not null and type = 'opinion')),
  check ((status = 'resolved') = (resolved_at is not null))
);
```

#### `post_likes`

게시글/답글 공용 좋아요이며, PK로 중복 투표를 방지합니다. `voter_key`는 회원이면 `auth.uid()`, 비회원이면 `guest_token`(`crypto.randomUUID()`)을 사용합니다.

```sql
create table post_likes (
  post_id uuid references posts(id) on delete cascade,
  voter_key uuid not null,
  primary key (post_id, voter_key)
);
```

### 뷰

#### `posts_public`

`posts`는 테이블 자체 SELECT 권한이 없어(아래 [RLS 정책 → `posts`](#posts-1) 참고) 이 뷰로만 조회할 수 있습니다. `guest_token`은 완전히 제외하고, `author_id`(uid)도 통째로 숨긴 뒤 `is_anonymous`가 `false`인 글만 `profiles.name`을 조인해서 보여줍니다.

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
  p.created_at
from posts p
left join profiles pr on pr.id = p.author_id;
```

#### `posts_counts`

"내 강의" 목록에서 강의별 게시글 개수를 보여주기 위한 집계 뷰입니다. 다른 두 counts 뷰와 달리 보안 목적이 아닙니다 — `posts_public`이 이미 전체 공개라 숨길 값이 없습니다. PostgREST가 서버 사이드 `group by`를 지원하지 않아서, 여러 강의의 게시글 개수를 한 번의 요청으로 가져오기 위한 효율성 목적으로만 추가했습니다.

```sql
create view posts_counts as
select lecture_id, count(*) as post_count
from posts
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

### 트리거 함수

#### `anonymize_posts_before_profile_delete()`

회원이 탈퇴하면 `profiles`가 `on delete cascade`로 삭제되면서 그 사람이 쓴 글의 `author_id`가 `null`로 바뀌는데, `posts`엔 "작성자가 없으면 반드시 익명이어야 한다"는 체크 제약(`check (author_id is not null or is_anonymous = true)`)이 있어서 실명으로 쓴 글이 이 제약을 위반하게 됩니다. 이 트리거는 `profiles` 삭제 **직전**(`BEFORE DELETE`)에 해당 작성자의 글을 먼저 `is_anonymous = true`로 바꿔 이 충돌을 막습니다. `search_path`를 `public`으로 명시 고정한 이유는, 이 트리거를 호출하는 쪽(예: `delete_own_account()`, `search_path=''`)의 `search_path`를 그대로 물려받으면 `posts`처럼 스키마 미지정 참조가 깨지기 때문입니다 — 호출 컨텍스트와 무관하게 항상 동작하도록 자체적으로 고정했습니다.

```sql
create or replace function anonymize_posts_before_profile_delete()
returns trigger
set search_path = public
as $$
begin
  update posts
  set is_anonymous = true
  where author_id = old.id;
  return old;
end;
$$ language plpgsql;

create trigger trg_anonymize_posts_before_profile_delete
before delete on profiles
for each row execute function anonymize_posts_before_profile_delete();
```

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

#### `enforce_nodes_parent_ownership()`

`nodes_insert_own`/`nodes_update_own` RLS는 새로 쓰는 행 자신의 `created_by = auth.uid()`만 검사할 뿐, `parent_id`가 가리키는 부모 행의 소유자·모드는 검사하지 않습니다. 그래서 다른 사람 폴더 밑에 내 노드를 끼워 넣거나(INSERT), 같은 계정이라도 강의자 모드 폴더를 수강생 모드 폴더 밑으로 옮기는 것(UPDATE, "위치 이동" 기능)이 막혀 있지 않았습니다. 이 트리거는 `parent_id`가 가리키는 부모 노드와 `created_by`/`created_mode`가 반드시 일치하도록 강제해, `nodes.parent_id` 체인이 항상 한 사람·한 모드의 트리 안에서만 이어지게 합니다. 다른 행(부모 행)을 참조해야 해서 `check` 제약으로는 표현할 수 없어(서브쿼리 금지) 트리거로 구현했습니다.

```sql
create or replace function enforce_nodes_parent_ownership()
returns trigger as $$
begin
  if new.parent_id is not null and exists (
    select 1 from nodes parent
    where parent.id = new.parent_id
      and (parent.created_by is distinct from new.created_by
           or parent.created_mode is distinct from new.created_mode)
  )
  then
    raise exception '부모 폴더와 소유자/모드가 일치해야 합니다';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_enforce_nodes_parent_ownership
before insert or update on nodes
for each row execute function enforce_nodes_parent_ownership();
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

### RPC 함수

#### `delete_own_account()`

로그인한 본인만 자기 `auth.users` 행을 삭제할 수 있게 하는 회원 탈퇴 RPC입니다. `auth.users` DELETE는 일반 role(`anon`/`authenticated`)에게 권한이 없어 `SECURITY DEFINER`로 우회하고, `auth.uid()`로 삭제 대상을 "요청자 본인"으로 못박아 다른 사람 계정을 삭제하는 걸 원천 차단합니다. `search_path`를 빈 문자열로 비워 모든 참조를 완전한 스키마 경로(`auth.users`)로 강제해 스키마 하이재킹을 방지합니다. 함수 생성 직후 `PUBLIC`에게 자동으로 부여되는 기본 실행 권한을 전부 회수(`revoke all`)하고 `authenticated`에게만 다시 실행 권한을 부여해, 로그인하지 않은 사용자는 아예 호출조차 못 하게 막습니다. 본문이 분기/변수 없는 단순 `DELETE` 한 줄이라 트리거 함수들과 달리 `plpgsql`이 필요 없어 `sql` 언어로 정의했습니다.

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
```

### 접근 제어 (RLS 정책 및 테이블 권한)

행 단위 제어는 RLS 정책으로, 테이블/컬럼 단위 접근 자체는 `REVOKE`/`GRANT`로 각각 다루며, 테이블별로 RLS만 쓰는 경우도 있고 `posts`/`lecture_join_codes`처럼 둘을 같이 쓰는 경우도 있습니다(`REVOKE`가 필요한 이유는 각 테이블 섹션 설명 참고).

읽기는 테이블마다 성격이 달라 크게 셋으로 나뉩니다: (1) 강의 입장 흐름에 필요한 `nodes`/`lectures`/`lecture_join_codes`는 소유자가 아닌 사람도 읽어야 하므로 그대로 공개(`using (true)`), (2) `profiles`/`favorites`/`post_likes`/`lecture_feedback_votes`는 RLS로 본인 행만 조회 가능하도록 좁힘(`post_likes`/`lecture_feedback_votes`는 여기에 더해, 남에게 `voter_key`를 보여주지 않으면서 전체 개수는 알려야 해서 `post_likes_counts`/`lecture_feedback_votes_counts` 뷰로 집계를 따로 공개), (3) `posts`는 유일하게 테이블 자체 SELECT 권한을 완전히 회수해서 본인 글조차 원본 테이블로는 못 읽고, `guest_token`/`author_id`를 뺀 `posts_public` 뷰로만 조회 가능합니다. 쓰기는 전부 "본인 것만" 원칙으로 제한합니다.

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

`post_likes`와 동일한 원칙(집계는 `lecture_feedback_votes_counts` 뷰로 공개, 조회/등록/취소는 본인 `voter_key`로만)에 더해, 강의자는 자기 강의의 투표 전체를 초기화할 수 있습니다(`lecture_feedback_votes_delete_own`은 본인 투표만 지울 수 있어서, 전체 초기화를 위해 별도 정책이 필요합니다).

```sql
alter table lecture_feedback_votes enable row level security;
create policy "lecture_feedback_votes_select_own" on lecture_feedback_votes for select
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "lecture_feedback_votes_insert_own" on lecture_feedback_votes for insert
  with check (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "lecture_feedback_votes_delete_own" on lecture_feedback_votes for delete
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));

create policy "lecture_feedback_votes_lecturer_reset" on lecture_feedback_votes for delete
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.id
    where lectures.id = lecture_feedback_votes.lecture_id and nodes.created_by = auth.uid()
  ));
```

#### `posts`

RLS는 "누가 행에 접근 가능한가"만 결정할 뿐, "어떤 테이블/컬럼에 접근 가능한가"는 별도의 GRANT 권한 문제입니다. 전체 공개 SELECT 정책을 열어둔 채로 `guest_token` 컬럼을 그대로 두면, RLS와 무관하게 `posts` 테이블에 직접 `select`를 날리는 것만으로 `guest_token`이 노출되어 남의 글을 수정/삭제할 수 있게 됩니다. 그래서 테이블 자체의 SELECT 권한을 `anon`/`authenticated`에서 회수하고, `guest_token`과 `author_id`를 뺀 `posts_public` 뷰(위 "뷰" 섹션 참고)로만 조회 가능하게 만들었습니다. 회원/비회원 누구나 글을 쓸 수 있지만(단 `author_id`는 본인 것만 주장 가능), 수정/삭제는 `post_likes`와 같은 방식으로 처리합니다 — 회원은 `auth.uid()`, 비회원은 `x-guest-token` 헤더 값과 `guest_token` 일치 여부로 확인합니다.

`created_mode = 'lecturer'`로 쓰려는 시도가 실제 강의 제작자에 의한 것인지 확인합니다(왜 필요한지는 설계 노트의 `posts.created_mode` 참고). 같은 행 안의 값끼리만 비교하면 되는 답글+`opinion` 타입 제약은 테이블 `check`로 처리했지만, 이 author_id-제작자 일치 확인은 다른 테이블(`nodes`) 조회가 필요해 `check` 제약으로는 표현할 수 없어서(서브쿼리 금지) RLS로 구현했습니다. UPDATE 쪽은 `RESTRICTIVE`로 만들어서 `posts_update_own`/`posts_lecturer_update_status` 등 다른 정책과 OR가 아니라 AND로 합쳐지게 했습니다.

강의자는 자기 강의(`lectures.id` 소유)에 속한 게시글이면 남의 글이라도 상태 전환(미해결↔해결) 및 삭제(부적절한 글 제거)가 가능합니다. Postgres는 같은 명령어에 정책이 여러 개면 OR로 합쳐지므로, 이 정책은 `posts_update_own`/`posts_delete_own`과 나란히 적용됩니다.

```sql
revoke select on posts from anon, authenticated;
```

```sql
alter table posts enable row level security;
create policy "posts_insert_anyone" on posts for insert
  with check (author_id is null or author_id = auth.uid());
create policy "posts_update_own" on posts for update
  using (
    author_id = auth.uid()
    or (author_id is null and guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token'))
  )
  with check (
    author_id = auth.uid()
    or (author_id is null and guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token'))
  );
create policy "posts_delete_own" on posts for delete
  using (
    author_id = auth.uid()
    or (author_id is null and guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token'))
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
- **`nodes.parent_id`는 항상 같은 소유자·같은 모드의 트리 안에서만 이어짐**: `nodes_insert_own`/`nodes_update_own` RLS는 새로 쓰는 행 자신의 `created_by`만 확인할 뿐 부모 노드는 확인하지 않아서, 그대로 두면 남의 폴더 밑에 내 노드를 끼워 넣거나 내 강의자 모드 폴더를 내 수강생 모드 폴더 밑으로 옮기는 것(위치 이동)이 막히지 않습니다. `enforce_nodes_parent_ownership()` 트리거로 부모 노드와 `created_by`/`created_mode`가 일치하는지 강제합니다(구현 방식은 [SQL → 트리거 함수](#트리거-함수) 참고).
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

## 실시간 접속자 수 (강의별)

- 테이블 추가 없이 Supabase Realtime의 **Presence** 기능으로 구현. Presence는 "지금 이 채널에 누가 붙어있는지"를 웹소켓 연결 기준으로 서버 메모리에서 관리해주는 기능이라, DB에 영속시킬 필요가 없음 (접속자 수는 순간의 상태일 뿐, 이력이 아님).
- 강의(lecture)마다 채널 하나(`lecture:<node_id>` 등)를 만들고, 각 클라이언트가 자신의 **presence key**로 `track()`. `presenceState()`가 반환하는 고유 key 개수 = 접속자 수.
- **presence key 규칙**:
  - 회원: `user_id` 사용 → 같은 계정으로 탭/기기를 여러 개 열어도 key가 같으므로 한 명으로 집계됨.
  - 비회원: 아래 "비회원 익명 식별자"의 로컬(브라우저) 저장 토큰을 그대로 사용 → 같은 브라우저에서 탭을 새로 열어도 토큰이 같아 한 명으로 집계되고, 다른 토큰(다른 브라우저/기기, 또는 저장소 초기화)이면 별도 접속자로 집계됨.

## 비회원 익명 식별자: `guest_token` (여러 기능에서 공용으로 사용)

비회원의 신원을 나타내는 토큰을 **`guest_token`**이라고 부르기로 함. 브라우저의 **localStorage**(탭 간 공유되는 저장소, sessionStorage 아님)에 한 번 생성해 저장하고, 아래 곳에서 동일하게 재사용:
- `posts.guest_token` — 본인 글 수정/삭제 인증 (`posts_update_own`/`posts_delete_own` RLS 정책이 `x-guest-token` 헤더로 읽어서 대조)
- `post_likes` / `lecture_feedback_votes`의 `voter_key` — 중복 투표 방지 (역시 `x-guest-token` 헤더로 대조)
- Presence key — 접속자 수 집계

즉 어느 기능이든 서버에 요청할 때 **`x-guest-token`** 헤더 하나만 실어 보내면 됩니다.

## 배포 현황

- 별도의 Express 백엔드 서버 없이 Supabase(Postgres + Auth + Realtime + RLS)만으로 구성. AI 교정/필터링/유사도 검사처럼 서버 로직이 꼭 필요해지면 그때 Express 서버를 추가.
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
