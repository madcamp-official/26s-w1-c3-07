-- submit-post의 유사도 검사에 넘길 후보 글을 가져오는 RPC.
-- 범위: 같은 강의의 "미해결" 최상위 질문들 + 그 답글 전부(무한 depth, 답글 타입 무관).
-- service_role(submit-post)로만 호출하는 내부용이라 SECURITY INVOKER 기본값 그대로 둠.
create or replace function get_similarity_candidates(p_lecture_id uuid)
returns table (id uuid, content text)
as $$
  with recursive unresolved_roots as (
    select posts.id
    from posts
    where posts.lecture_id = p_lecture_id
      and posts.parent_id is null
      and posts.status = 'unresolved'
  ),
  thread as (
    select posts.id, posts.content
    from posts
    where posts.id in (select id from unresolved_roots)
    union all
    select p.id, p.content
    from posts p
    join thread t on p.parent_id = t.id
  )
  select id, content from thread;
$$ language sql stable;
