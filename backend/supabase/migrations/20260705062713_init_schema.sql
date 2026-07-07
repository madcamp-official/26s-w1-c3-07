-- 초기 스키마: DB_SCHEMA.md의 SQL 초안을 그대로 마이그레이션으로 옮김

-- 회원 부가정보 (Supabase Auth 사용자 확장)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade, -- 탈퇴 시 프로필도 같이 삭제
  display_name text,
  last_mode text not null default 'student' check (last_mode in ('lecturer', 'student')) -- 로그인 시 자동 진입할 모드
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
  max_participants int
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
  check (author_id is not null or is_anonymous = true), -- 작성자가 없으면(비회원) 반드시 익명이어야 함
  check ((parent_id is null) = (status is not null)) -- 최상위 게시글은 status 필수, 답글은 status 필수 null
);

-- 좋아요 (게시글/답글 공용, 중복 방지)
create table post_likes (
  post_id uuid references posts(id) on delete cascade,
  voter_key uuid not null, -- 회원: auth.uid(), 비회원: guest_token(crypto.randomUUID())
  primary key (post_id, voter_key)
);

-- 실시간 피드백(추워요/더워요/소리 작아요/잘 안 보여요)의 좋아요/싫어요
create table lecture_feedback_votes (
  lecture_id uuid references lectures(node_id) on delete cascade,
  feedback_type text not null check (feedback_type in ('cold', 'hot', 'quiet', 'unclear')),
  voter_key uuid not null,
  value smallint not null check (value in (1, -1)), -- 좋아요/싫어요
  primary key (lecture_id, feedback_type, voter_key)
);
-- 집계는 SUM(value)로 계산, 강의자가 "초기화" 누르면 해당 lecture_id의 행을 전부 delete

-- 함수/트리거

-- 회원 탈퇴 시 author_id가 null로 바뀌기 전에, 실명으로 쓴 글을 먼저 익명 처리
-- (posts.check 제약과 author_id의 on delete set null이 충돌하지 않도록 BEFORE DELETE에서 선처리)
create or replace function anonymize_posts_before_profile_delete()
returns trigger as $$
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

-- 강의자는 게시글(최상위 글)을 작성할 수 없고, 답글만 작성 가능하며 그 답글은 반드시 opinion 타입이어야 함
-- author_id가 해당 강의(lecture_id)의 강의자(nodes.created_by)와 일치하는 경우에만 적용
create or replace function restrict_lecturer_post_rules()
returns trigger as $$
begin
  if exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = new.lecture_id and nodes.created_by = new.author_id
  )
  then
    if new.parent_id is null then
      raise exception '강의자는 게시글(최상위 글)을 작성할 수 없습니다. 답글만 작성 가능합니다';
    end if;
    if new.post_type = 'question' then
      raise exception '강의자의 답글은 의견(opinion) 타입만 가능합니다';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_restrict_lecturer_post_rules
before insert or update on posts
for each row execute function restrict_lecturer_post_rules();

-- RLS 정책
-- 읽기는 대부분 공개(using (true))로 열어두되(익명 사용자도 링크만 알면 볼 수 있어야 하므로), 쓰기는 "본인 것만" 원칙으로 제한

-- profiles: 전체 공개 읽기, 본인만 수정. INSERT는 auth.users 가입 트리거로만 생성되므로 정책 없음(직접 INSERT 차단)
alter table profiles enable row level security;
create policy "profiles_select_all" on profiles for select using (true);
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
create policy "join_codes_select_all" on lecture_join_codes for select using (true);
create policy "join_codes_owner_all" on lecture_join_codes for insert
  with check (exists (select 1 from lectures join nodes on nodes.id = lectures.node_id where lectures.node_id = lecture_id and nodes.created_by = auth.uid()));
create policy "join_codes_owner_delete" on lecture_join_codes for delete
  using (exists (select 1 from lectures join nodes on nodes.id = lectures.node_id where lectures.node_id = lecture_id and nodes.created_by = auth.uid()));

-- my_nodes: 완전히 개인적인 데이터라 본인만 읽기/쓰기 전부 가능
alter table my_nodes enable row level security;
create policy "my_nodes_owner_all" on my_nodes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- posts: 전체 공개 읽기, 회원/비회원 누구나 작성 가능(단 author_id는 본인 것만 주장 가능)
-- 수정/삭제도 post_likes와 같은 방식(x-guest-token 헤더 대조)으로 처리 — 회원은 auth.uid(), 비회원은 헤더 값과 guest_token 일치 확인
alter table posts enable row level security;
create policy "posts_select_all" on posts for select using (true);
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

-- post_likes / lecture_feedback_votes: 집계는 공개, 등록/취소는 본인 voter_key로만
-- 비회원은 auth.uid()가 없으므로, 클라이언트가 보낸 커스텀 헤더(x-guest-token)의 값과 행의 voter_key가
-- 정확히 일치할 때만 허용 (auth.role() = 'anon'이라고 무조건 통과시키면 남의 좋아요까지 지울 수 있어 위험)
alter table post_likes enable row level security;
create policy "post_likes_select_all" on post_likes for select using (true);
create policy "post_likes_insert_own" on post_likes for insert
  with check (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "post_likes_delete_own" on post_likes for delete
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));

alter table lecture_feedback_votes enable row level security;
create policy "feedback_select_all" on lecture_feedback_votes for select using (true);
create policy "feedback_insert_own" on lecture_feedback_votes for insert
  with check (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
create policy "feedback_delete_own" on lecture_feedback_votes for delete
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));
