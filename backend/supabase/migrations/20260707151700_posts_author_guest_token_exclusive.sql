-- posts.author_id와 guest_token이 동시에 채워지는 걸 막는 제약.
-- "author_id와 guest_token을 둘 다 가질 수 없다"(not (A and B))를 드모르간 법칙으로 풀면
-- "author_id가 없거나 guest_token이 없거나"(A is null or B is null)가 되고, 이 형태면
-- 무효화(guest_token을 null로 지우는 방식)로 만들어지는 (author_id is null and guest_token is null)
-- 상태도 그대로 허용된다.
alter table posts
  add constraint posts_author_id_guest_token_exclusive
  check (author_id is null or guest_token is null);
