-- restrict_lecturer_post_rules 트리거(+ x-mode 헤더)를 posts.created_mode 컬럼 +
-- CHECK 제약 + RLS 정책 조합으로 대체.
--
-- 배경: 강의 페이지에서 "강의자가 쓴 글"과 "수강생이 쓴 글"을 색으로 구분해야 하는데,
-- 같은 계정(강의 제작자)이 강의자 모드로도, 수강생 모드로도 글을 쓸 수 있어야 함.
-- 즉 "author_id가 제작자와 같은지"만으로는 부족하고, "그 순간 어느 모드로 썼는지"를
-- 글 자체에 저장해야 색 구분이 가능함 -> posts.created_mode 컬럼 추가.
--
-- created_mode 값 자체는 프론트의 자기신고이며, 계정 본인이 lecturer/student 중
-- 뭘로 표시할지는 원래도 막을 이유가 없어 자유(강의자가 자기 강의에 수강생처럼
-- 참여하는 것도 정상 시나리오). 다만 "제3자가 created_mode='lecturer'를 붙여
-- 강의자 답변인 것처럼 위장"하는 건 막아야 함 -> 아래 두 제약으로 방지:
--   1. created_mode='lecturer'인 글은 답글+opinion 타입만 가능 (같은 행 안에서만
--      판단 가능하므로 테이블 CHECK로 구현)
--   2. created_mode='lecturer'인 글의 author_id는 실제로 그 강의의 제작자여야 함
--      (다른 테이블 조회가 필요해 CHECK로는 불가능 -- Postgres CHECK 제약은
--      서브쿼리를 금지함 -- 대신 RLS INSERT/UPDATE 정책의 with check로 구현)

drop trigger trg_restrict_lecturer_post_rules on posts;
drop function restrict_lecturer_post_rules();

alter table posts
  add column created_mode text not null default 'student' check (created_mode in ('lecturer', 'student')),
  add constraint posts_lecturer_mode_reply_opinion_only
    check (created_mode <> 'lecturer' or (parent_id is not null and post_type = 'opinion'));

create policy "posts_insert_lecturer_mode_matches_owner" on posts for insert
  with check (
    created_mode <> 'lecturer'
    or exists (
      select 1 from lectures join nodes on nodes.id = lectures.node_id
      where lectures.node_id = posts.lecture_id and nodes.created_by = auth.uid()
    )
  );

-- 위 insert 정책만으로는 부족함: PERMISSIVE 정책은 서로 OR로 합쳐지므로, update 시엔
-- 기존 posts_update_own/posts_lecturer_update_status 정책에 안 걸리게 새 정책을 permissive로
-- 추가해봐야 오히려 허용 범위만 넓어짐. AS RESTRICTIVE로 만들어야 다른 정책 결과와 AND로
-- 합쳐져서 "이미 수정 권한이 있어도, created_mode를 lecturer로 위장하는 것"만 별도로 차단됨.
create policy "posts_update_lecturer_mode_matches_owner" on posts as restrictive for update
  using (true)
  with check (
    created_mode <> 'lecturer'
    or exists (
      select 1 from lectures join nodes on nodes.id = lectures.node_id
      where lectures.node_id = posts.lecture_id and nodes.created_by = auth.uid()
    )
  );
