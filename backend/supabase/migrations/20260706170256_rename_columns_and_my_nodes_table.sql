-- 이름을 좀 더 명확하게 다듬기 위한 리네임 (동작 변화 없음):
--   my_nodes -> favorites
--   nodes.node_type -> nodes.type
--   lectures.node_id -> lectures.id
--   my_nodes.folder_id -> favorites.anchor_id
--   posts.post_type -> posts.type

alter table nodes rename column node_type to type;
alter table lectures rename column node_id to id;
alter table my_nodes rename column folder_id to anchor_id;
alter table posts rename column post_type to type;

alter table my_nodes rename to favorites;

alter policy "my_nodes_owner_all" on favorites rename to "favorites_owner_all";
alter policy "my_nodes_insert_only_favorite_lecturer_mode" on favorites rename to "favorites_insert_only_favorite_lecturer_mode";
alter policy "my_nodes_update_only_favorite_lecturer_mode" on favorites rename to "favorites_update_only_favorite_lecturer_mode";
alter policy "my_nodes_insert_folder_must_be_own_student_folder" on favorites rename to "favorites_insert_anchor_must_be_own_student_folder";
alter policy "my_nodes_update_folder_must_be_own_student_folder" on favorites rename to "favorites_update_anchor_must_be_own_student_folder";

-- posts_public 뷰: 컬럼 이름(post_type -> type) 변경은 CREATE OR REPLACE VIEW로 안 되므로 drop 후 재생성
drop view posts_public;
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

-- 함수 본문은 텍스트라 리네임을 자동으로 안 따라가므로 재정의 필요
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
    perform set_config('app.bypass_status_lock', 'true', true);
    update posts set status = 'unresolved' where id = root_id;
  end if;

  return new;
end;
$$ language plpgsql;

-- 반환 컬럼 이름(node_type -> type)이 바뀌어 CREATE OR REPLACE로 안 되므로 drop 후 재생성
drop function get_my_favorite_subtrees();
create function get_my_favorite_subtrees()
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
