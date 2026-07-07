-- posts_public에 created_mode가 빠져 있었음. 강의자 모드로 쓴 답글(청색)과 수강생 모드 글을
-- 프론트가 구분해서 표시하려면 필요한 컬럼이라 추가한다.
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
  p.created_at,
  p.created_mode,
  coalesce(
    p.author_id = auth.uid()
    or p.guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token'),
    false
  ) as is_mine
from posts p
left join profiles pr on pr.id = p.author_id;
