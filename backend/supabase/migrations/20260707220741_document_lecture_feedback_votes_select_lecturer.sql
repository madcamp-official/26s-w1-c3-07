-- lecture_feedback_votes_select_lecturer 정책은 마이그레이션을 거치지 않고
-- 원격 DB에 직접(대시보드 등으로) 추가되어 있던 것을 뒤늦게 발견해 버전 관리에 편입한다.
-- 강의자가 자기 강의의 피드백 투표를 voter_key 제한 없이(lecture_feedback_votes_select_own은
-- 본인 투표만 보여줌) 전체 행 단위로 조회할 수 있게 해준다. 이미 원격 DB에 존재하므로
-- drop 후 재생성하는 멱등적 형태로 작성해 실제 스키마는 바뀌지 않는다.
drop policy if exists "lecture_feedback_votes_select_lecturer" on lecture_feedback_votes;
create policy "lecture_feedback_votes_select_lecturer" on lecture_feedback_votes for select
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.id
    where lectures.id = lecture_feedback_votes.lecture_id and nodes.created_by = auth.uid()
  ));
