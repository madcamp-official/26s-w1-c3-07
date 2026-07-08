-- 지금까지 posts INSERT는 실제로는 submit-post Edge Function(적절성 검사 -> 유사 질문 탐지 -> 저장)을
-- 거치도록 프론트가 짜여있을 뿐, DB 차원에서 이걸 강제하지는 않았음. posts_insert_anyone/
-- posts_insert_lecturer_mode_matches_owner 두 INSERT 정책이 살아있어서 클라이언트가 이 두 검사를
-- 우회해 posts에 직접 INSERT할 수 있는 구멍이 있었음(TODO 참고).
--
-- submit-post는 service_role로 실행되어 RLS를 우회하므로, anon/authenticated의 INSERT 권한
-- 자체를 회수해도 정상 제출 경로에는 영향이 없음 - 클라이언트 직접 INSERT만 막힘.
drop policy posts_insert_anyone on posts;
drop policy posts_insert_lecturer_mode_matches_owner on posts;
revoke insert on posts from anon, authenticated;
