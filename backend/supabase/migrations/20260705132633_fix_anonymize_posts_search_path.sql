-- 버그 수정: delete_own_account() 실행 중 회원 탈퇴 시 auth.users -> profiles cascade delete로
-- trg_anonymize_posts_before_profile_delete 트리거가 발동되는데, delete_own_account가
-- SECURITY DEFINER + search_path=''로 실행되는 동안엔 이 트리거도 같은 빈 search_path를
-- 물려받아서 스키마 미지정 참조인 posts를 못 찾고 "relation posts does not exist" 에러가 났음.
-- 트리거 함수 자체에 search_path를 명시적으로 고정해 호출 컨텍스트와 무관하게 항상 동작하도록 수정.
create or replace function anonymize_posts_before_profile_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update posts
  set is_anonymous = true
  where author_id = old.id;
  return old;
end;
$$;
