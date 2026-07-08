-- posts_counts가 lecture_id별 posts 전체(답글 포함)를 세고 있었는데, 프론트는 이 값을
-- "게시글 {n}개"로 표시하고 있어(CourseMeta.tsx) 최상위 게시글만 세야 함. 답글은
-- parent_id가 not null(posts_status_matches_top_level 제약으로 보장)이라 parent_id is null로
-- 걸러내면 최상위 게시글만 남음.
create or replace view posts_counts as
select lecture_id, count(*) as post_count
from posts
where parent_id is null
group by lecture_id;
