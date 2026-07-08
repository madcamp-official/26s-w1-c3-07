-- get_similarity_candidates()의 root 선택 조건에서 parent_id is null을 제거.
-- posts의 check ((parent_id is null) = (status is not null)) 제약 때문에
-- status = 'unresolved'(not null)인 행은 이미 parent_id is null일 수밖에 없어서
-- parent_id is null 조건은 논리적으로 중복이었음.
-- 겸사겸사 비교 범위도 명확히 함: type(question/opinion) 무관하게 미해결 최상위
-- 게시글 전부 + 그 답글을 후보로 넘김(원래도 type 필터가 없었고, 이걸 의도된 동작으로 확정).
create or replace function get_similarity_candidates(p_lecture_id uuid)
returns table (id uuid, content text)
as $$
  with recursive unresolved_roots as (
    select posts.id
    from posts
    where posts.lecture_id = p_lecture_id
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
