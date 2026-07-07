-- Supabase는 새 함수 생성 시 기본적으로 anon/authenticated에 EXECUTE를 자동 부여한다.
-- delete_own_account/get_or_create_join_code/reissue_join_code는 만들 때
-- "revoke all ... from public"만 해서, 가상 역할 PUBLIC 권한만 회수됐을 뿐
-- 이미 자동 부여된 anon의 EXECUTE는 그대로 남아있었다(로그인 안 해도 호출 자체는 되던 상태 -
-- 각 함수 본문이 auth.uid() 기반으로 대상을 제한해 실질 피해는 없었지만, 문서에
-- "비로그인 사용자는 호출 자체가 안 된다"고 서술한 것과 실제가 어긋나 있었음).
-- get_similarity_candidates처럼 anon까지 명시적으로 회수해 일치시킨다.
revoke execute on function delete_own_account() from anon;
revoke execute on function get_or_create_join_code(uuid) from anon;
revoke execute on function reissue_join_code(uuid) from anon;
