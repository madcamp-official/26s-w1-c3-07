-- 읽기 공개 범위 재검토: profiles는 본인만, posts/post_likes/lecture_feedback_votes는
-- 민감한 식별자(author_id, guest_token, voter_key)를 감춘 형태로만 공개 조회되도록 변경.
-- nodes/lectures/lecture_join_codes/my_nodes는 강의 입장 흐름(소유자가 아닌 사람도 읽어야 함)
-- 때문에 그대로 전체 공개/본인 전용을 유지.

-- profiles: 전체 공개 읽기를 없애고 본인 것만 조회 가능하게 함.
-- posts_public 뷰는 뷰 소유자 권한으로 profiles를 내부적으로 조인하므로(RLS와 무관하게 접근 가능),
-- 이 변경 이후에도 익명이 아닌 글의 작성자 이름 표시는 그대로 동작함.
drop policy "profiles_select_all" on profiles;
create policy "profiles_select_self" on profiles for select
  using (auth.uid() = id);

-- posts: 직접 조회를 완전히 막고 posts_public 뷰로만 조회하게 함
-- (guest_token 노출 문제 + author_id를 익명 여부에 따라 가리기 위함).
-- update/delete는 posts_update_own/posts_delete_own 등 기존 정책으로 계속 처리됨(별도 SELECT 권한 불필요).
drop policy "posts_select_all" on posts;
revoke select on posts from anon, authenticated;

-- posts_public: author_id(uid)는 통째로 숨기고, 비익명 글만 profiles.display_name을 조인해서 보여줌
drop view posts_public;
create view posts_public as
select
  p.id,
  p.lecture_id,
  p.parent_id,
  case when p.is_anonymous then null else pr.display_name end as author_display_name,
  p.is_anonymous,
  p.post_type,
  p.status,
  p.resolved_at,
  p.content,
  p.created_at
from posts p
left join profiles pr on pr.id = p.author_id;

-- post_likes / lecture_feedback_votes: 전체 공개 조회를 없애고, 본인 투표 행만 조회 가능하게 함
-- (voter_key를 남에게 보여주지 않으면서도, "내가 이미 눌렀는지"를 기기가 바뀌어도 서버 기준으로 판단 가능)
drop policy "post_likes_select_all" on post_likes;
create policy "post_likes_select_own" on post_likes for select
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));

drop policy "lecture_feedback_votes_select_all" on lecture_feedback_votes;
create policy "lecture_feedback_votes_select_own" on lecture_feedback_votes for select
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));

-- 좋아요/피드백 개수는 voter_key 없이 집계된 뷰로 공개 (본인 여부와 무관하게 전체 카운트 조회 가능)
create view post_likes_counts as
select post_id, count(*) as like_count
from post_likes
group by post_id;

create view lecture_feedback_votes_counts as
select
  lecture_id,
  feedback_type,
  count(*) filter (where value = 1) as like_count,
  count(*) filter (where value = -1) as dislike_count
from lecture_feedback_votes
group by lecture_id, feedback_type;
