-- profiles.mode/nodes.created_mode/posts.created_mode/post_drafts.created_mode 네 컬럼이 전부
-- text + check (... in ('lecturer', 'student'))로 값 목록을 각자 따로 강제하고 있던 걸 하나의
-- user_mode enum 타입으로 통일. 값 목록이 타입 레벨에서 강제되므로 각 테이블의 개별
-- check 제약(profiles_mode_valid/nodes_created_mode_valid/posts_created_mode_valid/
-- post_drafts_created_mode_valid)은 더 이상 필요 없어 삭제. created_mode = 'lecturer' 비교만
-- 하는 다른 제약들(nodes_lecture_requires_lecturer_mode 등)은 enum과 text 리터럴 비교가
-- 그대로 동작해 손댈 필요 없음.
--
-- nodes.created_mode/posts.created_mode를 참조하는 RLS 정책이 있으면 Postgres가 컬럼 타입
-- 변경 자체를 막아서("cannot alter type of a column used in a policy definition"), 각 컬럼을
-- 바꾸기 전에 그 컬럼을 참조하는 정책을 전부 지웠다가 타입 변경 후 원래 정의 그대로 다시 만듦
-- (정의 자체는 바뀌지 않고 컬럼 타입만 text -> user_mode로 바뀜). created_mode를 리터럴과
-- 비교하는 다른 check 제약(nodes_lecture_requires_lecturer_mode 등)도 이미 저장된 표현식의
-- 리터럴이 text로 고정돼 있어("operator does not exist: user_mode = text") 컬럼 타입 변경 전에
-- 함께 지웠다가 다시 만들어야 함.
create type user_mode as enum ('lecturer', 'student');

alter table profiles drop constraint profiles_mode_valid;
alter table profiles
  alter column mode drop default,
  alter column mode type user_mode using mode::user_mode,
  alter column mode set default 'student';

drop policy favorites_insert_only_favorite_lecturer_mode on favorites;
drop policy favorites_update_only_favorite_lecturer_mode on favorites;
drop policy favorites_insert_anchor_must_be_own_student_folder on favorites;
drop policy favorites_update_anchor_must_be_own_student_folder on favorites;

alter table nodes drop constraint nodes_created_mode_valid;
alter table nodes drop constraint nodes_lecture_requires_lecturer_mode;
alter table nodes
  alter column created_mode type user_mode using created_mode::user_mode;
alter table nodes
  add constraint nodes_lecture_requires_lecturer_mode check (type <> 'lecture' or created_mode = 'lecturer');

create policy favorites_insert_only_favorite_lecturer_mode
  on favorites
  as restrictive
  for insert
  with check (
    exists (
      select 1 from nodes
      where nodes.id = favorites.node_id and nodes.created_mode = 'lecturer'
    )
  );

create policy favorites_update_only_favorite_lecturer_mode
  on favorites
  as restrictive
  for update
  using (true)
  with check (
    exists (
      select 1 from nodes
      where nodes.id = favorites.node_id and nodes.created_mode = 'lecturer'
    )
  );

create policy favorites_insert_anchor_must_be_own_student_folder
  on favorites
  as restrictive
  for insert
  with check (
    anchor_id is null
    or exists (
      select 1 from nodes
      where nodes.id = favorites.anchor_id and nodes.created_by = auth.uid() and nodes.created_mode = 'student'
    )
  );

create policy favorites_update_anchor_must_be_own_student_folder
  on favorites
  as restrictive
  for update
  using (true)
  with check (
    anchor_id is null
    or exists (
      select 1 from nodes
      where nodes.id = favorites.anchor_id and nodes.created_by = auth.uid() and nodes.created_mode = 'student'
    )
  );

drop policy posts_insert_lecturer_mode_matches_owner on posts;
drop policy posts_update_lecturer_mode_matches_owner on posts;

-- posts_public 뷰가 created_mode를 그대로 select하고 있어서("cannot alter type of a column
-- used by a view or rule") 컬럼 타입을 바꾸기 전에 뷰를 지웠다가 타입 변경 후 그대로 다시 만듦.
drop view posts_public;

alter table posts drop constraint posts_created_mode_valid;
alter table posts drop constraint posts_lecturer_mode_reply_opinion_only;
alter table posts drop constraint posts_lecturer_mode_not_anonymous;
alter table posts
  alter column created_mode drop default,
  alter column created_mode type user_mode using created_mode::user_mode,
  alter column created_mode set default 'student';
alter table posts
  add constraint posts_lecturer_mode_reply_opinion_only check (created_mode <> 'lecturer' or (parent_id is not null and type = 'opinion')),
  add constraint posts_lecturer_mode_not_anonymous check (created_mode <> 'lecturer' or is_anonymous = false);

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

create policy posts_insert_lecturer_mode_matches_owner on posts for insert
  with check (
    created_mode <> 'lecturer'
    or exists (
      select 1 from lectures join nodes on nodes.id = lectures.id
      where lectures.id = posts.lecture_id and nodes.created_by = auth.uid()
    )
  );

create policy posts_update_lecturer_mode_matches_owner on posts as restrictive for update
  using (true)
  with check (
    created_mode <> 'lecturer'
    or exists (
      select 1 from lectures join nodes on nodes.id = lectures.id
      where lectures.id = posts.lecture_id and nodes.created_by = auth.uid()
    )
  );

alter table post_drafts drop constraint post_drafts_created_mode_valid;
alter table post_drafts
  alter column created_mode type user_mode using created_mode::user_mode;
