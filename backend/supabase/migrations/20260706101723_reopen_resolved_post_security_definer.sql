-- 20260706093000에서 posts 직접 SELECT가 anon/authenticated에게서 회수되고, 이 UPDATE를
-- 실행하는 수강생은 posts_update_own/posts_lecturer_update_status 어느 RLS에도 안 걸려서
-- (자기 글도, 강의자도 아님) reopen_resolved_post_on_question_reply()가 조상 게시글을
-- 조회도, 업데이트도 못 하던 문제 수정. SECURITY DEFINER로 테이블 소유자 권한을 빌려
-- SELECT 회수/RLS를 모두 우회함 (bypass_status_lock 플래그로 우회하는 trg_block_status_change_by_non_lecturer
-- 트리거와는 별개의 문제 -- 그건 트리거 로직, 이건 권한/RLS 문제).
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
    perform set_config('app.bypass_status_lock', 'true', true);
    update posts set status = 'unresolved' where id = root_id;
  end if;

  return new;
end;
$$ language plpgsql;
