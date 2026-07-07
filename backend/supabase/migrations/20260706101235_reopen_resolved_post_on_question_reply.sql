-- 해결된 게시글에 질문 타입 답글이 달리면 다시 미해결로 전환 (README 필수 기능).
-- 이 UPDATE는 수강생의 답글 INSERT로 촉발되는데, 기존 trg_block_status_change_by_non_lecturer가
-- "강의자가 아니면 status 변경 불가"를 막아버리므로, 세션(트랜잭션) 로컬 플래그로 이 자동 전환만
-- 예외적으로 통과시킴. SECURITY DEFINER로는 이 문제를 못 푸는데, auth.uid()는 세션의 JWT를
-- 읽는 함수라 함수 실행 권한(DEFINER/INVOKER)과 무관하게 항상 실제 요청자를 가리키기 때문.
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

-- 답글(질문 타입)이 달리면 답글의 답글까지 거슬러 올라가 최상위 게시글(status를 가진 행)을 찾아서
-- 해결된 상태였으면 미해결로 되돌림. created_mode='lecturer'인 글은 이미 opinion 타입만 가능하도록
-- CHECK로 막혀 있어서, post_type='question'인 답글은 항상 수강생 글임이 구조적으로 보장됨.
create or replace function reopen_resolved_post_on_question_reply()
returns trigger as $$
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

create trigger trg_reopen_resolved_post_on_question_reply
after insert on posts
for each row execute function reopen_resolved_post_on_question_reply();
