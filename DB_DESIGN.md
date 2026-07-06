# DB 설계

## 목차

- [테이블 개요](#테이블-개요)
- [SQL](#sql)
  - [테이블](#테이블)
  - [뷰](#뷰)
  - [트리거 함수](#트리거-함수)
  - [RPC 함수](#rpc-함수)
- [설계 노트](#설계-노트)
  - [테이블 관계 및 트리 구조](#테이블-관계-및-트리-구조)
  - [삭제 전파 (cascade)](#삭제-전파-cascade)
  - [트리거 함수 동작](#트리거-함수-동작)
  - [RPC·뷰 동작](#rpc뷰-동작)
- [실시간 접속자 수 (강의별)](#실시간-접속자-수-강의별)
- [비회원 익명 식별자: `guest_token`](#비회원-익명-식별자-guest_token-여러-기능에서-공용으로-사용)
- [RLS 정책](#rls-정책)
- [배포 현황](#배포-현황)

## 테이블 개요

| 테이블 | 대응하는 기능 |
|---|---|
| `profiles` | 회원(Google OAuth) 부가정보 |
| `nodes` | 강의 폴더 + 강의 통합 트리 |
| `lectures` | 강의의 부가 속성 (시작/종료 시각, 장소, 최대인원) — 입장은 `nodes.id`(UUID)를 URL/QR로 사용 |
| `lecture_join_codes` | 강의 입장용 4자리 숫자 코드 (발급/재발급/파기 가능, 즐겨찾기 등록용 코드와는 별개) |
| `my_nodes` | "내 강의" 즐겨찾기 (수강생 모드) |
| `posts` | 게시글 + 답글 통합 트리, 질문/의견 타입, 미해결/해결, 비회원 인증(`guest_token`) |
| `post_likes` | 게시글/답글 좋아요 |
| `lecture_feedback_votes` | 실시간 피드백(추워요/더워요/소리 작아요/잘 안 보여요) 좋아요/싫어요 |
| `posts_public` (뷰) | `posts`에서 `guest_token`/`author_id`를 뺀 공개 조회용 뷰(비익명 글만 작성자 이름 노출). 프론트는 `posts` 대신 이 뷰를 조회 |
| `post_likes_counts` (뷰) | `post_likes`에서 `voter_key` 없이 게시글별 좋아요 개수만 집계한 공개 조회용 뷰 |
| `lecture_feedback_votes_counts` (뷰) | `lecture_feedback_votes`에서 `voter_key` 없이 강의·피드백 유형별 좋아요/싫어요 개수만 집계한 공개 조회용 뷰 |

## SQL

### 테이블

```sql
-- 회원 부가정보 (Supabase Auth 사용자 확장)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade, -- 탈퇴 시 프로필도 같이 삭제
  name text,
  mode text not null default 'student' check (mode in ('lecturer', 'student')) -- 로그인 시 자동 진입할 모드
);

-- 트리 구조: 강의 폴더 / 강의, 깊이 무제한
create table nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references nodes(id) on delete cascade, -- 폴더 삭제 시 하위 노드 전부 연쇄 삭제(재귀적으로 전파됨)
  node_type text not null check (node_type in ('folder', 'lecture')),
  name text not null,
  created_by uuid references profiles(id) on delete set null, -- 만든 사람이 탈퇴해도 강의/폴더 자체는 유지, 작성자 정보만 사라짐
  created_mode text not null check (created_mode in ('lecturer', 'student')), -- 같은 계정이 강의자/수강생 어느 모드에서 만들었는지. 강의(lecture)는 항상 lecturer
  created_at timestamptz default now(), -- 정렬 기준(사전순/생성시각순). 수동 정렬 기능 추가 시 position 컬럼을 그때 추가
  check (node_type <> 'lecture' or created_mode = 'lecturer')
);

-- 강의의 부가 속성
-- 입장 URL/QR은 별도 코드 없이 node_id(UUID)를 그대로 사용 (예: /join/<node_id>)
-- 같은 node_id를 "즐겨찾기 등록 코드"로도 재사용 (강의뿐 아니라 강의 폴더도 이 코드로 my_nodes에 등록 가능)
create table lectures (
  node_id uuid primary key references nodes(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location text,
  max_participants int check (max_participants is null or max_participants >= 0) -- 미설정(null) 또는 0 이상만 허용
);

-- 강의 입장 전용 4자리 숫자 코드 (즐겨찾기 등록용 node_id 코드와는 별개)
-- 필요할 때 발급(INSERT)하고 안 쓰면 파기(DELETE)하는 방식이라, 시간이 안 겹치면 다른 강의가 같은 번호를 바로 재사용 가능
create table lecture_join_codes (
  code text primary key check (code ~ '^[0-9]{4}$'),
  lecture_id uuid not null unique references lectures(node_id) on delete cascade, -- 강의당 활성 코드 1개만
  issued_at timestamptz default now()
);

-- "내 강의" 즐겨찾기 (수강생 모드)
create table my_nodes (
  user_id uuid references profiles(id) on delete cascade, -- 탈퇴 시 내 즐겨찾기 목록도 같이 삭제
  node_id uuid references nodes(id) on delete cascade, -- 즐겨찾기 대상 (남이 만든 강의 또는 강의 폴더). 대상이 삭제되면 즐겨찾기 기록도 같이 삭제
  folder_id uuid references nodes(id) on delete cascade, -- 이 즐겨찾기를 넣어둔 내 개인 폴더. 폴더가 삭제되면 그 안의 즐겨찾기 기록도 전부 같이 삭제
  primary key (user_id, node_id)
);

-- 게시글 + 답글 통합 트리 (parent_id로 무한 depth)
create table posts (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references lectures(node_id) on delete cascade,
  parent_id uuid references posts(id) on delete cascade, -- null = 최상위 게시글, 삭제 시 답글도 재귀적으로 연쇄 삭제
  author_id uuid references profiles(id) on delete set null, -- 비회원이면 null. 회원이 탈퇴해도 글은 남고 작성자 정보만 사라짐
  is_anonymous boolean not null default true,
  guest_token text, -- 비회원 글 수정/삭제 인증용 (강의 종료 후 무효 처리는 end_time 비교로 앱/RLS에서 판단)
  post_type text not null check (post_type in ('question', 'opinion')),
  status text check (status in ('unresolved', 'resolved')), -- 최상위 게시글만 사용, 답글은 null
  resolved_at timestamptz, -- 해결됨으로 바뀐 시각. 해결된 게시글 정렬 기준. 미해결로 되돌아가면 다시 null 처리
  content text not null,
  created_at timestamptz default now(),
  created_mode text not null default 'student' check (created_mode in ('lecturer', 'student')), -- 강의자 모드/수강생 모드 중 어느 화면에서 썼는지 (화면에서 색 구분용)
  check (author_id is not null or is_anonymous = true), -- 작성자가 없으면(비회원) 반드시 익명이어야 함
  check ((parent_id is null) = (status is not null)), -- 최상위 게시글은 status 필수, 답글은 status 필수 null
  check (created_mode <> 'lecturer' or (parent_id is not null and post_type = 'opinion')), -- 강의자 모드로 쓴 글은 답글+opinion 타입만 가능
  check ((status = 'resolved') = (resolved_at is not null)) -- resolved일 때만 resolved_at 존재, 양방향 강제
);

-- 좋아요 (게시글/답글 공용, 중복 방지)
create table post_likes (
  post_id uuid references posts(id) on delete cascade,
  voter_key uuid not null, -- 회원: auth.uid(), 비회원: guest_token(crypto.randomUUID())
  primary key (post_id, voter_key)
);

-- 실시간 피드백(추워요/더워요/소리 작아요/잘 안 보여요)의 좋아요/싫어요
-- PK에 value까지 포함시켜, 한 사람이 같은 feedback_type에 좋아요/싫어요를
-- 동시에 독립적으로 누를 수 있게 함 (voter_key만으로 PK를 잡으면 둘 중 하나만 가능해짐)
create table lecture_feedback_votes (
  lecture_id uuid references lectures(node_id) on delete cascade,
  feedback_type text not null check (feedback_type in ('cold', 'hot', 'quiet', 'dark')),
  voter_key uuid not null,
  value smallint not null check (value in (1, -1)), -- 좋아요/싫어요
  primary key (lecture_id, feedback_type, voter_key, value)
);
-- 좋아요/싫어요 개수는 각각 count(*) filter (where value = 1) / count(*) filter (where value = -1)로 집계해 화면에 따로 표시.
-- 4개 피드백 유형을 정렬할 때는 sum(value)(좋아요 - 싫어요 순수 점수)를 기준으로 사용.
-- 강의자가 "초기화" 누르면 해당 lecture_id의 행을 전부 delete
```

### 뷰

```sql
-- posts는 테이블 자체 SELECT 권한이 없어 이 뷰로만 조회 가능(아래 RLS 정책 참고).
-- guest_token은 완전히 제외하고, author_id(uid)도 통째로 숨긴 뒤
-- is_anonymous가 false인 글만 profiles.name을 조인해서 보여줌
create view posts_public as
select
  p.id,
  p.lecture_id,
  p.parent_id,
  case when p.is_anonymous then null else pr.name end as author_display_name,
  p.is_anonymous,
  p.post_type,
  p.status,
  p.resolved_at,
  p.content,
  p.created_at
from posts p
left join profiles pr on pr.id = p.author_id;

-- post_likes / lecture_feedback_votes도 테이블 자체 SELECT는 본인 투표 행만 가능하도록 좁혔으므로
-- (아래 RLS 정책 참고), voter_key 없이 집계된 개수만 보여주는 공개용 뷰를 따로 둠
create view post_likes_counts as
select post_id, count(*) as like_count
from post_likes
group by post_id;

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

```sql
-- 회원 탈퇴 시 author_id가 null로 바뀌기 전에, 실명으로 쓴 글을 먼저 익명 처리
-- (posts.check 제약과 author_id의 on delete set null이 충돌하지 않도록 BEFORE DELETE에서 선처리)
-- search_path를 명시적으로 public 고정: 이 트리거를 호출하는 쪽(예: delete_own_account,
-- search_path='')의 search_path를 그대로 물려받으면 posts처럼 스키마 미지정 참조가 깨지므로
-- 호출 컨텍스트와 무관하게 항상 동작하도록 자체적으로 고정.
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

-- 게시글 status는 강의자만 바꿀 수 있음 (글쓴이 본인도 불가)
-- RLS 조건만으로는 "이 컬럼은 안 바뀌어야 한다"를 표현하기 어려워서 트리거로 강제
-- app.bypass_status_lock 플래그가 켜져 있으면 통과시킴: reopen_resolved_post_on_question_reply()가
-- "해결된 게시글에 질문 답글이 달리면 자동으로 미해결 전환"할 때만 예외적으로 세팅하는 트랜잭션 로컬 플래그
create or replace function block_status_change_by_non_lecturer()
returns trigger as $$
begin
  if current_setting('app.bypass_status_lock', true) = 'true' then
    return new;
  end if;

  if new.status is distinct from old.status
     and not exists (
       select 1 from lectures join nodes on nodes.id = lectures.node_id
       where lectures.node_id = new.lecture_id and nodes.created_by = auth.uid()
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

-- status가 resolved로 바뀌면 resolved_at을 자동으로 찍고, resolved가 아니게 되면
-- (다시 unresolved로 돌아가거나 답글이라 status가 null인 경우) resolved_at도 null로 되돌림
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

-- 해결된 게시글에 질문 타입 답글이 달리면 다시 미해결로 전환 (README 필수 기능).
-- 답글의 답글까지 지원하므로 재귀 CTE로 최상위(status를 가진) 게시글까지 거슬러 올라감.
-- 이 UPDATE는 수강생의 답글 INSERT로 촉발되는데, posts 테이블 직접 SELECT가 revoke되어 있고
-- (위 "읽기는 테이블이 아니라 뷰로만" 참고) 이 수강생은 posts_update_own/posts_lecturer_update_status
-- 어느 RLS에도 안 걸려서(자기 글도, 강의자도 아님) SECURITY DEFINER로 둘 다 우회함.
-- created_mode='lecturer'인 글은 이미 opinion 타입만 가능하도록 CHECK로 막혀 있어서,
-- post_type='question'인 답글은 항상 수강생 글임이 구조적으로 보장됨.
create or replace function reopen_resolved_post_on_question_reply()
returns trigger
security definer
set search_path = public
as $$
declare
  root_id uuid;
  root_status text;
begin
  if new.parent_id is null or new.post_type <> 'question' then
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

create trigger trg_reopen_resolved_post_on_question_reply
after insert on posts
for each row execute function reopen_resolved_post_on_question_reply();

-- 회원 가입(Google OAuth 포함) 시 auth.users에 행이 생기면 profiles도 자동 생성
-- profiles는 INSERT 정책이 없어(RLS로 직접 INSERT 차단) 이 트리거가 유일한 생성 경로.
-- 일반 role은 public.profiles에 INSERT 권한이 없으므로 SECURITY DEFINER로 우회.
-- search_path를 명시적으로 고정해 스키마 하이재킹(함수 실행 중 다른 스키마의 동명 객체가 끼어드는 것)을 방지.
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

```sql
-- 회원 탈퇴: 로그인한 본인만 자기 auth.users 행을 삭제할 수 있게 하는 RPC.
-- auth.users DELETE는 일반 role(anon/authenticated)에게 권한이 없어 SECURITY DEFINER로 우회.
-- auth.uid()로 대상을 "요청자 본인"으로 못박아, 다른 사람 계정 삭제를 원천 차단.
-- search_path를 비워 모든 참조를 완전한 스키마 경로로 강제(스키마 하이재킹 방지).
create or replace function delete_own_account()
returns void
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$ language plpgsql;

revoke all on function delete_own_account() from public;
grant execute on function delete_own_account() to authenticated;
```

프론트에서는 `supabase.rpc('delete_own_account')`로 호출합니다.

## 설계 노트

> 위 SQL 자체만으로는 드러나지 않는 설계 배경/이유를 테이블 관계, 삭제 전파, 트리거, RPC·뷰로 나눠 정리

### 테이블 관계 및 트리 구조

- `nodes`는 자기참조(`parent_id`)로 트리를 이루며, `node_type`이 `folder`면 강의 폴더, `lecture`면 강의입니다.
- `lectures`는 `node_type = 'lecture'`인 노드 하나당 한 행씩 붙는 부가 속성 테이블입니다 (1:1).
- `lecture_join_codes`는 강의 "입장"에만 쓰는 4자리 코드로, `my_nodes` 등록(즐겨찾기)에 쓰는 `nodes.id` 코드와는 별개입니다. 목적은 손으로 입력하기 편한 짧은 코드를 제공하는 것이지, `nodes.id` 유출에 대응하려는 기능이 아닙니다 — 입장 URL/QR은 `nodes.id`(UUID)를 그대로 쓰기 때문에, 이 링크 자체가 유출되면 `lecture_join_codes`를 재발급해도 URL/QR은 그대로라 막을 방법이 없고, 새 강의(새 노드)를 다시 만드는 것 외에는 대응 수단이 없습니다. `code`가 PK라 발급된 동안만 유일하고, 파기(DELETE)되면 그 번호를 다른 강의가 바로 재사용할 수 있습니다.
- **재발급 방식**: `code`는 UPDATE로 값을 바꾸지 않고, **기존 행 DELETE 후 새 코드로 INSERT**하는 방식으로 처리합니다 (UPDATE 정책은 만들지 않음, INSERT/DELETE 정책만 있음). PK 성격의 식별자는 값 자체를 바꾸기보다 "기존 것 폐기 + 새로 발급"이 원칙에 맞고, `issued_at`도 재발급 시점 기준으로 자연스럽게 새로 찍힙니다.
- `posts`는 `lecture_id`로 특정 강의에 속하고, `parent_id`로 자기 자신을 참조해 답글의 답글까지 무한 depth를 지원합니다. `parent_id`가 `null`이면 최상위 게시글, 값이 있으면 답글입니다. `check ((parent_id is null) = (status is not null))` 제약으로 "최상위 게시글은 `status` 필수, 답글은 `status` 반드시 `null`"이 DB 레벨에서 강제됩니다.
- **`posts.created_mode`(강의자 모드/수강생 모드 색 구분)**: 강의를 만든 계정이라도 강의자 모드로 쓸 때도, 수강생 모드로 쓸 때도 있어서, `author_id`가 강의 제작자와 같은지만으론 "이 글을 어느 화면에서 썼는지" 색으로 구분할 수 없습니다. 그래서 그 순간의 모드를 `created_mode`에 직접 저장합니다. 이 값 자체는 프론트가 정하는 자기신고값이고, 계정 본인이 뭘 선택하든(강의자가 자기 강의에 수강생처럼 참여하는 것도 정상 시나리오) 막을 이유가 없습니다. 다만 "제3자가 `created_mode = 'lecturer'`를 붙여 강의자 답변인 것처럼 위장"하는 건 막아야 해서 두 겹으로 검증합니다: (1) `created_mode = 'lecturer'`인 글은 답글+`opinion` 타입만 가능하다는 규칙은 같은 행 안의 값끼리만 비교하면 되므로 테이블 `check` 제약으로, (2) `created_mode = 'lecturer'`인 글의 `author_id`가 실제로 그 강의의 제작자(`nodes.created_by`)와 일치해야 한다는 규칙은 다른 테이블 조회가 필요해서(Postgres `check` 제약은 서브쿼리를 금지함) RLS의 `posts_insert_lecturer_mode_matches_owner`(INSERT)/`posts_update_lecturer_mode_matches_owner`(UPDATE, `RESTRICTIVE`) 정책으로 구현했습니다. (이전엔 트리거 + `x-mode` 헤더로 구현했었으나, 색 구분을 위해 값을 직접 저장하는 이 방식으로 대체했습니다.)
- 좋아요/피드백 투표는 각각 `post_likes`, `lecture_feedback_votes`로 분리해 중복 투표를 기본키로 방지합니다. `lecture_feedback_votes`는 PK에 `value`까지 포함해서(`lecture_id`, `feedback_type`, `voter_key`, `value`), 같은 사람이 같은 `feedback_type`에 좋아요와 싫어요를 동시에 독립적으로 남길 수 있습니다(둘 다 완전히 별개의 행이라 "좋아요 취소"와 "싫어요 취소"도 서로 영향 없이 따로 처리됨).
- "내가 만든 강의/폴더"는 `nodes.created_by = 내 user_id`로 조회하되, 어느 모드의 "내 강의" 페이지인지에 따라 `created_mode`로 한 번 더 걸러야 합니다: 강의자 모드는 `created_mode = 'lecturer'`, 수강생 모드(개인 정리 폴더)는 `created_mode = 'student'`. 같은 계정이라도 두 모드에서 만든 폴더가 섞이지 않도록 하는 용도입니다.
- `my_nodes`는 "남이 만든 강의/폴더를 즐겨찾기"하는 기록이며, `folder_id`로 그 즐겨찾기를 내가 만든 어떤 개인 폴더 아래에 정리해뒀는지 나타냅니다(`null`이면 정리 안 하고 최상위). 즐겨찾기 대상(`node_id`)의 실제 `parent_id`는 원래 만든 사람의 트리 구조 그대로이며, 이 개인 정리 구조 때문에 바뀌지 않습니다.

### 삭제 전파 (cascade)

- **삭제 전파(cascade) 정리**: 폴더를 삭제하면 `nodes.parent_id`의 `on delete cascade`를 타고 하위 노드(폴더/강의)가 재귀적으로 전부 삭제되고, 그에 딸린 `lectures`, `posts`(답글 포함), `post_likes`, `lecture_feedback_votes`, `my_nodes.node_id`/`my_nodes.folder_id` 즐겨찾기 기록까지 전부 연쇄적으로 같이 삭제됩니다 (즐겨찾기를 정리해둔 내 폴더를 지우면, 그 안에 넣어둔 즐겨찾기 기록도 함께 사라짐).
- **회원 탈퇴(`auth.users` 삭제) 시 전파**: `profiles`는 `on delete cascade`로 계정과 함께 삭제되고, 그에 딸린 `my_nodes`(내 즐겨찾기)도 `cascade`로 같이 삭제됩니다. 반면 그 사람이 만든 `nodes`(강의/폴더, `created_by`)와 작성한 `posts`(`author_id`)는 `on delete set null`이라 콘텐츠 자체는 그대로 남고 "누가 만들었는지/썼는지" 정보만 사라집니다 — 강의자 한 명이 탈퇴해도 강의 구조나 다른 학생들의 질문·답글이 통째로 사라지는 일은 없습니다.

### 트리거 함수 동작

- **탈퇴와 익명 표시 체크 제약의 충돌 방지**: `posts`엔 `check (author_id is not null or is_anonymous = true)`(작성자가 없으면 반드시 익명)가 걸려 있는데, 실명으로 쓴 글의 작성자가 탈퇴하면 `author_id`가 `null`로 바뀌면서 이 체크를 위반할 뻔합니다. `trg_anonymize_posts_before_profile_delete` 트리거가 `profiles` 삭제 **직전**에 해당 작성자의 글을 먼저 `is_anonymous = true`로 바꿔둬서 이 충돌을 막습니다.
- **강의자 권한(상태 전환/삭제/피드백 초기화)**: `posts_lecturer_update_status`/`posts_lecturer_delete`/`lecture_feedback_votes_lecturer_reset` 정책으로 강의자가 남의 게시글 `status`를 바꾸거나, 부적절한 글을 삭제하거나, 실시간 피드백 투표를 전체 초기화할 수 있습니다(`nodes.created_by = auth.uid()`로 해당 강의 소유자인지 확인). `trg_block_status_change_by_non_lecturer` 트리거가 이와 짝을 이뤄 "강의자가 아니면 `status`를 절대 못 바꾼다"를 강제합니다 — 정책은 허용 조건, 트리거는 차단 조건을 맡는 구조입니다.
- **`resolved_at` 자동 설정/해제**: `status`가 `resolved`로 바뀌는 순간 `trg_set_resolved_at_on_status_change` 트리거가 `resolved_at`을 `now()`로 채우고, 다시 `unresolved`로 돌아가거나(또는 애초에 답글이라 `status`가 `null`인 경우) `null`로 되돌립니다. `check ((status = 'resolved') = (resolved_at is not null))` 제약이 이 관계를 양방향으로 강제해서, 트리거를 거치지 않은 직접 INSERT/UPDATE에 대한 안전장치 역할도 합니다. 같은 테이블의 `BEFORE UPDATE` 트리거는 이름 알파벳순으로 실행되므로, "강의자가 아니면 `status` 변경 자체를 차단"하는 `trg_block_status_change_by_non_lecturer`(b)가 `trg_set_resolved_at_on_status_change`(s)보다 먼저 실행되어 순서 문제가 없습니다.
- **회원가입 시 `profiles` 자동 생성**: `profiles`는 별도 INSERT 정책이 없어 RLS가 직접 INSERT를 막습니다. 그래서 `auth.users`에 새 행이 생길 때(Google OAuth 로그인 포함) `trg_handle_new_user` 트리거가 `handle_new_user()`를 호출해 `profiles` 행을 자동으로 만드는 게 유일한 생성 경로입니다. 이 함수는 일반 role에게 없는 `public.profiles` INSERT 권한을 얻기 위해 `SECURITY DEFINER`로 선언했고, `search_path`를 `public`으로 고정해 스키마 하이재킹을 방지합니다. `name`은 구글 계정의 `full_name`/`name`(없으면 이메일)을 `raw_user_meta_data`에서 꺼내 자동으로 채웁니다.
- **해결된 게시글 자동 재오픈(`reopen_resolved_post_on_question_reply`)**: README 필수 기능("해결된 게시글에 질문 답글이 달리면 다시 미해결로 전환")은 수강생의 답글 INSERT로 촉발되어 부모(정확히는 트리의 최상위) 게시글의 `status`를 UPDATE해야 하는데, 이걸 막는 장애물이 두 겹 있었습니다: (1) `trg_block_status_change_by_non_lecturer`가 "강의자가 아니면 `status` 변경 불가"를 검사하는데, 이건 `auth.uid()`(세션 JWT) 기반 검사라 `SECURITY DEFINER`로도 우회가 안 돼서(함수 실행 권한을 바꿔도 `auth.uid()`가 가리키는 실제 요청자는 안 바뀜) `app.bypass_status_lock`이라는 **트랜잭션 로컬 플래그**로 예외 처리했습니다. (2) `posts` 테이블 직접 SELECT가 `anon`/`authenticated`에서 회수돼 있고, 이 UPDATE를 실행하는 수강생은 `posts_update_own`/`posts_lecturer_update_status` 어느 RLS에도 안 걸려서(자기 글도 강의자도 아님) 조상 게시글을 조회도 갱신도 못 하는데, 이건 `auth.uid()` 문제가 아니라 순수 GRANT/RLS 권한 문제라 `SECURITY DEFINER`로 해결됩니다 — 같은 "우회"라도 무엇을 우회하려는지에 따라 통하는 방법이 다르다는 걸 보여주는 사례입니다. `created_mode='lecturer'`인 글은 이미 `opinion` 타입만 가능하도록 CHECK로 막혀 있어서, `post_type='question'`인 답글은 항상 수강생 글임이 구조적으로 보장됩니다.

### RPC·뷰 동작

- **회원 탈퇴 RPC(`delete_own_account`)**: `auth.users` 행을 `auth.uid()` 본인 것만 삭제하도록 `SECURITY DEFINER` + `search_path=''`로 만든 RPC입니다. `profiles.id`가 `auth.users(id)`를 `on delete cascade`로 참조하고 있어서, 이 RPC 실행 시 `profiles` 행도 연쇄 삭제되며 `trg_anonymize_posts_before_profile_delete`가 자동으로 발동됩니다. 이때 트리거 함수가 자체 `search_path`를 고정해두지 않으면 `delete_own_account`의 빈 `search_path`를 그대로 물려받아 `posts`(스키마 미지정) 참조가 깨지는 버그가 있었고, `anonymize_posts_before_profile_delete()`에 `set search_path = public`을 명시해 수정했습니다 — `SECURITY DEFINER` 함수 안에서 다른 함수/트리거가 연쇄 호출될 때는 각자 자기 `search_path`를 스스로 고정해둬야 호출 컨텍스트에 안전하다는 걸 보여주는 사례입니다.
- **`posts_public` 뷰**: `posts` 테이블 자체는 SELECT 권한이 없어(아래 "읽기는 테이블이 아니라 뷰로만" 참고) 이 뷰로만 조회할 수 있습니다. `guest_token`은 완전히 제외하고, `author_id`(uid)도 통째로 숨긴 뒤 `is_anonymous`가 `false`인 글만 `profiles.name`을 조인해서 보여줍니다. 뷰가 `profiles`를 조인할 수 있는 건 Postgres 뷰가 기본적으로 조회자가 아니라 **뷰 소유자의 권한**으로 실행되기 때문으로, `profiles`가 본인만 조회 가능하도록 좁혀져 있어도 뷰 내부 조인에는 영향이 없습니다(수정/삭제 자체는 여전히 `posts` 테이블의 RLS 정책으로 처리).
- **`post_likes_counts`/`lecture_feedback_votes_counts` 뷰**: `post_likes`/`lecture_feedback_votes`도 테이블 자체 SELECT는 본인 투표 행(`voter_key` 일치)만 가능하도록 좁혀서(아래 "읽기는 테이블이 아니라 뷰로만" 참고), 남이 무엇을 눌렀는지는 직접 조회할 수 없습니다. 하지만 좋아요/피드백 개수는 누구나 봐야 하는 값이라, `voter_key` 없이 `count(*)`로 집계만 한 별도 뷰로 공개합니다. `post_likes_counts`는 `post_id`별 좋아요 개수, `lecture_feedback_votes_counts`는 `lecture_id`·`feedback_type`별 좋아요/싫어요 개수(`count(*) filter (where value = 1/-1)`)를 보여줍니다. "내가 이미 눌렀는지"는 이 뷰가 아니라 `post_likes`/`lecture_feedback_votes` 테이블에 본인 `voter_key`로 직접 SELECT해서 확인합니다(RLS가 본인 행만 허용하므로 가능).

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

## RLS 정책

읽기는 테이블마다 성격이 달라 셋으로 나뉩니다: (1) 강의 입장 흐름에 필요한 `nodes`/`lectures`/`lecture_join_codes`는 소유자가 아닌 사람도 읽어야 하므로 그대로 공개(`using (true)`), (2) `profiles`는 본인만, (3) `posts`/`post_likes`/`lecture_feedback_votes`는 테이블 자체 SELECT를 좁히고 민감한 식별자를 뺀 뷰/본인 행으로만 조회하게 합니다. 쓰기는 전부 "본인 것만" 원칙으로 제한합니다.

```sql
-- profiles: 본인만 조회/수정 가능. INSERT는 auth.users 가입 트리거로만 생성되므로 정책 없음(직접 INSERT 차단)
-- (다른 사람의 profiles.name은 posts_public 뷰가 뷰 소유자 권한으로 내부 조인해 노출하므로,
-- 여기서 본인만으로 좁혀도 비익명 글의 작성자 이름 표시는 그대로 동작함)
alter table profiles enable row level security;
create policy "profiles_select_self" on profiles for select using (auth.uid() = id);
create policy "profiles_update_self" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- nodes: 전체 공개 읽기, 로그인 사용자가 본인 명의로 생성/수정/삭제(강의자/수강생 둘 다 폴더는 만들 수 있음)
alter table nodes enable row level security;
create policy "nodes_select_all" on nodes for select using (true);
create policy "nodes_insert_own" on nodes for insert
  to authenticated with check (created_by = auth.uid());
create policy "nodes_update_own" on nodes for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "nodes_delete_own" on nodes for delete
  using (created_by = auth.uid());

-- lectures: 전체 공개 읽기, 해당 node의 소유자만 생성/수정/삭제
alter table lectures enable row level security;
create policy "lectures_select_all" on lectures for select using (true);
create policy "lectures_owner_all" on lectures for all
  using (exists (select 1 from nodes where nodes.id = lectures.node_id and nodes.created_by = auth.uid()))
  with check (exists (select 1 from nodes where nodes.id = lectures.node_id and nodes.created_by = auth.uid()));

-- lecture_join_codes: 코드 조회는 공개(입장 시 코드로 찾아야 하므로), 발급/재발급/파기는 강의 소유자만
alter table lecture_join_codes enable row level security;
create policy "lecture_join_codes_select_all" on lecture_join_codes for select using (true);
create policy "lecture_join_codes_owner_all" on lecture_join_codes for insert
  with check (exists (select 1 from lectures join nodes on nodes.id = lectures.node_id where lectures.node_id = lecture_id and nodes.created_by = auth.uid()));
create policy "lecture_join_codes_owner_delete" on lecture_join_codes for delete
  using (exists (select 1 from lectures join nodes on nodes.id = lectures.node_id where lectures.node_id = lecture_id and nodes.created_by = auth.uid()));

-- my_nodes: 완전히 개인적인 데이터라 본인만 읽기/쓰기 전부 가능
alter table my_nodes enable row level security;
create policy "my_nodes_owner_all" on my_nodes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- posts: 테이블 자체 SELECT는 아예 없음(GRANT 회수) — guest_token 노출 문제 + author_id를
-- 익명 여부에 따라 가리기 위해 posts_public 뷰로만 조회하게 함(위 "뷰" 섹션 참고).
-- 회원/비회원 누구나 작성 가능(단 author_id는 본인 것만 주장 가능).
-- 수정/삭제도 post_likes와 같은 방식(x-guest-token 헤더 대조)으로 처리 — 회원은 auth.uid(), 비회원은 헤더 값과 guest_token 일치 확인
alter table posts enable row level security;
revoke select on posts from anon, authenticated;
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

-- posts: created_mode = 'lecturer'라고 쓰려면 실제로 그 강의의 제작자여야 함
-- (제3자가 강의자 답변인 것처럼 위장하는 것 방지). update 쪽은 RESTRICTIVE로 만들어서
-- 기존 posts_update_own/posts_lecturer_update_status 등 다른 정책과 OR가 아니라 AND로 합쳐지게 함
create policy "posts_insert_lecturer_mode_matches_owner" on posts for insert
  with check (
    created_mode <> 'lecturer'
    or exists (
      select 1 from lectures join nodes on nodes.id = lectures.node_id
      where lectures.node_id = posts.lecture_id and nodes.created_by = auth.uid()
    )
  );
create policy "posts_update_lecturer_mode_matches_owner" on posts as restrictive for update
  using (true)
  with check (
    created_mode <> 'lecturer'
    or exists (
      select 1 from lectures join nodes on nodes.id = lectures.node_id
      where lectures.node_id = posts.lecture_id and nodes.created_by = auth.uid()
    )
  );

-- posts: 강의자는 자기 강의(lectures.node_id 소유)에 속한 게시글이면 남의 글이라도
-- status 전환(미해결<->해결) 및 삭제(부적절한 글 제거)가 가능
-- (Postgres는 같은 명령어에 정책이 여러 개면 OR로 합쳐지므로 위 posts_update_own/posts_delete_own과 나란히 적용됨)
create policy "posts_lecturer_update_status" on posts for update
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = posts.lecture_id and nodes.created_by = auth.uid()
  ))
  with check (exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = posts.lecture_id and nodes.created_by = auth.uid()
  ));

create policy "posts_lecturer_delete" on posts for delete
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = posts.lecture_id and nodes.created_by = auth.uid()
  ));

-- post_likes / lecture_feedback_votes: 집계는 post_likes_counts/lecture_feedback_votes_counts 뷰로 공개,
-- 조회 자체는 본인 투표 행만 가능(voter_key를 남에게 보여주지 않으면서, 기기가 바뀌어도
-- "내가 이미 눌렀는지"를 서버 기준으로 판단할 수 있게 함). 등록/취소도 본인 voter_key로만
-- 비회원은 auth.uid()가 없으므로, 클라이언트가 보낸 커스텀 헤더(x-guest-token)의 값과 행의 voter_key가
-- 정확히 일치할 때만 허용 (auth.role() = 'anon'이라고 무조건 통과시키면 남의 좋아요까지 지울 수 있어 위험)
alter table post_likes enable row level security;
create policy "post_likes_select_own" on post_likes for select
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "post_likes_insert_own" on post_likes for insert
  with check (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "post_likes_delete_own" on post_likes for delete
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));

alter table lecture_feedback_votes enable row level security;
create policy "lecture_feedback_votes_select_own" on lecture_feedback_votes for select
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "lecture_feedback_votes_insert_own" on lecture_feedback_votes for insert
  with check (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "lecture_feedback_votes_delete_own" on lecture_feedback_votes for delete
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));

-- lecture_feedback_votes: 강의자는 자기 강의의 투표 전체를 초기화 가능
-- (lecture_feedback_votes_delete_own은 본인 투표만 지울 수 있어서, 전체 초기화를 위해 별도 정책 필요)
create policy "lecture_feedback_votes_lecturer_reset" on lecture_feedback_votes for delete
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = lecture_feedback_votes.lecture_id and nodes.created_by = auth.uid()
  ));
```

### `posts` 읽기는 테이블이 아니라 뷰로만 가능해야 함

RLS는 "누가 행에 접근 가능한가"만 결정할 뿐, "어떤 테이블/컬럼에 접근 가능한가"는 별도의 GRANT 권한 문제입니다. `posts_select_all`을 `using (true)`로 열어둔 채로 `guest_token` 컬럼을 그대로 두면, RLS 정책과 무관하게 `posts` 테이블에 직접 `select`를 날리는 것만으로 `guest_token`이 노출되어 남의 글을 수정/삭제할 수 있게 됩니다. 그래서 `posts` 테이블 자체의 SELECT 권한을 `anon`/`authenticated`에서 회수하고, `guest_token`과 `author_id`를 뺀 `posts_public` 뷰(위 "뷰" 섹션 참고)로만 조회 가능하게 만들었습니다 (수정/삭제 자체는 위 `posts_update_own`/`posts_delete_own` 정책으로 처리하며, 별도 RPC 함수는 필요 없음). `post_likes`/`lecture_feedback_votes`도 같은 이유로 테이블 자체 SELECT는 본인 투표 행(`voter_key` 일치)으로만 좁히고, 전체 집계는 `voter_key`가 빠진 `post_likes_counts`/`lecture_feedback_votes_counts` 뷰로 따로 공개합니다.

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
  - `20260706110000_profiles_rename_columns.sql` — `profiles` 컬럼 이름을 단순화(`display_name` → `name`, `last_mode` → `mode`). `posts_public` 뷰와 체크 제약은 컬럼을 attnum으로 참조해 자동으로 따라가고, `handle_new_user()` 함수만 새 컬럼명에 맞춰 갱신
