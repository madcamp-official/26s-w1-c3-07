-- get_similarity_candidates()는 submit-post Edge Function(service_role)만 쓰는 내부
-- 헬퍼라, 새 함수 생성 시 기본으로 열리는 PUBLIC EXECUTE를 회수하고 service_role에만
-- 다시 부여. 이 함수 자체가 posts_public으로도 이미 보이는 내용(id/content)만
-- 반환해서 위험한 노출은 아니지만, "누가 이 RPC를 직접 호출할 수 있는가"를 설계
-- 의도(server 전용)와 맞춰두는 목적.
revoke execute on function get_similarity_candidates(uuid) from public, anon, authenticated;
grant execute on function get_similarity_candidates(uuid) to service_role;
