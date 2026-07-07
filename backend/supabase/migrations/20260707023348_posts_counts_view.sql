-- "내 강의" 목록에서 강의별 게시글(질문+답글) 개수를 보여주기 위한 집계 뷰.
-- post_likes_counts/lecture_feedback_votes_counts와 달리 이건 보안 목적이 아님
-- (posts_public이 이미 전체 공개라 숨길 값이 없음) — 순전히 PostgREST가 서버 사이드
-- group by를 지원하지 않아서, 여러 강의의 게시글 개수를 한 번의 요청으로 가져오기 위한
-- 효율성 목적으로 추가함(강의마다 count 요청을 따로 보내는 것보다 한 번에 조회).
create view posts_counts as
select lecture_id, count(*) as post_count
from posts
group by lecture_id;
