-- 강의실 페이지에서 강의자 이름을 보여주려면 profiles.name을 조회해야 하는데,
-- profiles는 본인만 SELECT 가능(RLS)이라 남의 강의를 볼 때는 조회가 막힌다.
-- posts_public이 author_display_name을 노출하는 것과 같은 패턴으로,
-- 뷰가 조회자가 아니라 뷰 소유자 권한으로 실행되는 걸 이용해 profiles를 내부적으로 조인한다.
-- nodes/lectures가 이미 전체 공개라 이 뷰도 별도 RLS/REVOKE 없이 기본 공개 SELECT면 충분하다.
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
