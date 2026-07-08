-- 강의자 모드로 쓴 글(항상 답글+opinion, posts_lecturer_mode_reply_opinion_only 참고)은
-- 익명일 수 없도록 강제. created_mode는 author_id와 별개 컬럼이라 회원 탈퇴로 author_id가
-- null이 되어도 그대로 남고, is_anonymous도 트리거 없이 원래 값(false)이 유지되므로
-- (20260708130000_posts_deleted_author_placeholder.sql 참고) 탈퇴 여부와 무관하게 항상
-- 성립하는 제약이라 안전하게 추가할 수 있다.
alter table posts
  add constraint posts_lecturer_mode_not_anonymous
  check (created_mode <> 'lecturer' or is_anonymous = false);
