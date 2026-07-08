-- Postgres가 이름을 안 지정한 check 제약에 자동으로 붙여주는 <table>[_<column>]_check[N] 이름들을
-- 이 프로젝트에서 이미 쓰고 있는 스타일(무엇을 강제하는지 드러내는 서술적 이름, 예:
-- posts_guest_must_be_anonymous, posts_lecturer_mode_reply_opinion_only)로 통일한다.
-- 일부는 과거 컬럼 리네임(node_type -> type, post_type -> type, last_mode -> mode) 이후에도
-- 옛 컬럼명을 그대로 가진 이름이라 이번에 같이 바로잡는다. rename constraint는 정의(제약 조건)를
-- 바꾸는 게 아니라 이름표만 바꾸는 메타데이터 작업이라 데이터/락 영향이 없다.

alter table lecture_feedback_votes
  rename constraint lecture_feedback_votes_feedback_type_check to lecture_feedback_votes_feedback_type_valid;
alter table lecture_feedback_votes
  rename constraint lecture_feedback_votes_value_check to lecture_feedback_votes_value_valid;

alter table lecture_join_codes
  rename constraint lecture_join_codes_code_check to lecture_join_codes_code_valid;

alter table nodes
  rename constraint nodes_check to nodes_lecture_requires_lecturer_mode;
alter table nodes
  rename constraint nodes_created_mode_check to nodes_created_mode_valid;
alter table nodes
  rename constraint nodes_node_type_check to nodes_type_valid;

alter table post_drafts
  rename constraint post_drafts_created_mode_check to post_drafts_created_mode_valid;
alter table post_drafts
  rename constraint post_drafts_type_check to post_drafts_type_valid;

alter table posts
  rename constraint posts_check1 to posts_status_matches_top_level;
alter table posts
  rename constraint posts_created_mode_check to posts_created_mode_valid;
alter table posts
  rename constraint posts_post_type_check to posts_type_valid;
alter table posts
  rename constraint posts_status_check to posts_status_valid;

alter table profiles
  rename constraint profiles_last_mode_check to profiles_mode_valid;
