-- 탈퇴한 회원이 실명으로 쓴 글을 "익명"으로 뭉개지 않고 "탈퇴한 계정입니다"로
-- 표시하기 위한 변경. 지금까지는 profiles 삭제 직전에 트리거로 해당 작성자의 글을
-- 전부 is_anonymous = true로 강제 변경해서 "작성자 없음 => 반드시 익명" 제약(posts_check)을
-- 피해갔는데, 이러면 실명으로 쓴 글까지 전부 "익명"으로 보여서 탈퇴 사실 자체를
-- 프론트가 구분할 수 없었다.
--
-- 대신 author_id가 null이 되어도 is_anonymous는 건드리지 않고 원래 값을 그대로 둔다.
-- 그러려면 "작성자가 없으면 무조건 익명"이던 제약을 "guest_token이 있으면(=진짜 비회원 글)
-- 반드시 익명"으로 좁혀야 한다 — 비회원 글(guest_token 존재)에는 여전히 강제되고,
-- 탈퇴한 회원의 글(author_id/guest_token 둘 다 null)에는 적용되지 않아 원래 is_anonymous
-- 값이 그대로 보존된다. is_anonymous = false인 행은 guest_token이 항상 null이므로(이
-- 제약이 INSERT 시점부터 강제) "실명으로 쓴 글인데 author_id가 null"이면 곧 탈퇴한
-- 회원의 글이라는 뜻이 되어, 프론트는 posts_public.author_display_name이 null인데
-- is_anonymous가 false인 경우를 "탈퇴한 계정입니다"로 표시하면 된다.
alter table posts drop constraint posts_check;
alter table posts
  add constraint posts_guest_must_be_anonymous
  check (guest_token is null or is_anonymous = true);

-- author_id/guest_token 배타 제약도 "정확히 하나"(XOR)에서 "둘 다 값을 갖지는 않음"으로
-- 다시 완화한다. 탈퇴한 회원의 글은 author_id가 on delete set null로 비워지는데
-- guest_token은 애초에 회원 글이라 null이므로, 탈퇴 후엔 "둘 다 null"인 상태가 정상적으로
-- 발생해야 한다(guest_token 자체를 지우는 게 아니므로 무효화 로직 재도입과는 무관).
alter table posts drop constraint posts_author_id_xor_guest_token;
alter table posts
  add constraint posts_author_id_guest_token_not_both_set
  check (author_id is null or guest_token is null);

-- 더 이상 강제 익명화가 필요 없으므로 트리거/함수 제거.
drop trigger trg_anonymize_posts_before_profile_delete on profiles;
drop function anonymize_posts_before_profile_delete();
