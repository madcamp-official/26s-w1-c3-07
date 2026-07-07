-- "내가 쓴 글" UI 판별(수정/삭제 버튼 노출 등)을 위해 posts_public에 is_mine 계산 컬럼 추가.
-- author_id/guest_token 원본 값은 그대로 숨기고 boolean 하나만 노출한다.
-- posts_author_id_guest_token_exclusive 제약 덕분에 guest_token = header가 참이라는 것 자체가
-- 이미 author_id is null을 함의하므로, posts_update_own/posts_delete_own처럼 별도 가드는 불필요하다.
-- 두 값이 각각 NULL과 비교되는 경우(회원 글을 게스트가 보거나, 게스트 글을 다른 사람이 보는 경우)
-- SQL의 NULL = NULL은 true가 아니라 NULL이므로, 마지막에 coalesce로 명시적인 false로 정리한다.
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
  coalesce(
    p.author_id = auth.uid()
    or p.guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token'),
    false
  ) as is_mine
from posts p
left join profiles pr on pr.id = p.author_id;
