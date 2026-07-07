-- TODO #1: 강의자가 게시글 미해결 <-> 해결됨 전환
-- 기존 posts_update_own은 글쓴이 본인만 허용해서, 강의자가 남의 글 status를 바꾸는 게 안 됨.
create policy "posts_lecturer_update_status" on posts for update
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = posts.lecture_id and nodes.created_by = auth.uid()
  ))
  with check (exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = posts.lecture_id and nodes.created_by = auth.uid()
  ));

-- TODO #2: 강의자가 실시간 피드백 좋아요/싫어요 초기화
-- 기존 feedback_delete_own은 본인 투표만 지울 수 있어서, 강의자가 전체 초기화하는 게 안 됨.
create policy "feedback_lecturer_reset" on lecture_feedback_votes for delete
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = lecture_feedback_votes.lecture_id and nodes.created_by = auth.uid()
  ));

-- TODO #3: 게시글 status는 강의자만 바꿀 수 있어야 함 (글쓴이 본인도 불가)
-- RLS 조건만으로는 "이 컬럼은 안 바뀌어야 한다"를 표현하기 어려워서 트리거로 강제.
create or replace function block_status_change_by_non_lecturer()
returns trigger as $$
begin
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

create trigger trg_block_status_change
before update on posts
for each row execute function block_status_change_by_non_lecturer();

-- TODO #4: 강의자가 부적절한 게시글/답글을 직접 삭제하는 권한
create policy "posts_lecturer_delete" on posts for delete
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = posts.lecture_id and nodes.created_by = auth.uid()
  ));

-- TODO #6: posts.guest_token을 뺀 공개용 뷰(posts_public) 생성
-- posts_select_all이 전체 공개라 guest_token이 그대로 노출되면 위험함.
-- 프론트는 이 뷰로 조회 대상을 바꿔야 함 (TODO #16, 별도 프론트 작업).
create view posts_public as
select
  id,
  lecture_id,
  parent_id,
  author_id,
  is_anonymous,
  post_type,
  status,
  resolved_at,
  content,
  created_at
from posts;
