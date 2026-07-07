-- 강의 종료 후 guest_token 무효화 로직은 도입하지 않기로 확정함: guest_token이
-- crypto.randomUUID() 기반 UUID v4(122비트 무작위성)라, 강의 하나에 쌓인 토큰들
-- 사이에서 우연히 겹치는 쌍이 하나라도 나올 확률(생일 문제로 계산)이 현실적인 방문자
-- 수 규모에서는 무시 가능한 수준이라 판단함. 그래서 guest_token은 계속 보존하고,
-- "author_id/guest_token 둘 다 null"인 상태(무효화된 글)가 나올 일이 없어졌으므로
-- 배타 제약을 "둘 중 하나는 반드시 값을 가짐"(XOR)으로 강화한다.

-- guest_token 컬럼 타입을 바꾸려면 이를 참조하는 정책/뷰를 먼저 치워야 한다.
drop policy "posts_update_own" on posts;
drop policy "posts_delete_own" on posts;
drop view posts_public;

alter table posts drop constraint posts_author_id_guest_token_exclusive;

-- guest_token 형식을 DB 레벨에서 강제(text -> uuid). 기존 값은 전부 유효한 UUID
-- 문자열임을 확인했음(post_likes/lecture_feedback_votes.voter_key와 동일한 타입으로 통일).
alter table posts alter column guest_token type uuid using guest_token::uuid;

alter table posts
  add constraint posts_author_id_xor_guest_token
  check ((author_id is null) <> (guest_token is null));

-- guest_token이 uuid 타입이 되어, x-guest-token 헤더(text)와 비교하려면 명시적 캐스팅이 필요함
-- (voter_key 비교 정책들과 동일한 패턴).
create policy "posts_update_own" on posts for update
  using (
    author_id = auth.uid()
    or guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid
  )
  with check (
    author_id = auth.uid()
    or guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid
  );

create policy "posts_delete_own" on posts for delete
  using (
    author_id = auth.uid()
    or guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid
  );

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
