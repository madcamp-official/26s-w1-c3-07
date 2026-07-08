-- 강의 페이지 실시간 갱신(TODO.md #6)을 위한 Broadcast from Database 트리거 모음.
-- postgres_changes 대신 Broadcast를 쓰는 이유: postgres_changes는 원본 테이블의 RLS를
-- 그대로 적용받는데, posts/post_likes/lecture_feedback_votes의 RLS는 x-guest-token 헤더
-- 비교가 섞여 있고 WebSocket 연결은 커스텀 헤더를 못 실어서 비회원이 이벤트를 못 받음
-- (실제로 검증 완료, TODO.md #6 참고). realtime.send()는 realtime.messages 테이블에
-- INSERT할 뿐이라 원본 테이블 RLS와 무관하고, 같은 트랜잭션 안에서 실행되니 원래 쓰기가
-- 롤백되면 브로드캐스트도 같이 취소되는 장점도 있음.
--
-- 채널은 Presence와 동일하게 'lecture:<lecture_id>'를 재사용. 트리거 함수는 전부
-- SECURITY DEFINER로 선언 - posts/nodes/lectures의 base 테이블 SELECT는 RLS로 좁게
-- 막혀 있어서(예: 남이 쓴 글은 posts_select_own/lecturer로 안 보임), 이 트리거가
-- 호출자의 권한이 아니라 정의자 권한으로 자유롭게 조회해야 함(reopen_resolved_post_on_
-- question_reply()와 동일한 이유). search_path는 스키마 하이재킹 방지를 위해 고정.
-- 계정 이름(profiles.name) 변경은 한 사람이 여러 강의를 소유할 수 있어 채널 하나로
-- 안 끝나는 부채살 구조라 이번 범위에서 제외.

-- ---- posts: 새 글/수정/삭제 ----
create or replace function broadcast_post_change()
returns trigger
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  target_lecture_id uuid;
begin
  if tg_op = 'DELETE' then
    target_lecture_id := old.lecture_id;
    payload := jsonb_build_object(
      'op', 'DELETE', 'id', old.id, 'lecture_id', old.lecture_id, 'parent_id', old.parent_id
    );
  else
    target_lecture_id := new.lecture_id;
    select jsonb_build_object(
      'id', p.id, 'lecture_id', p.lecture_id, 'parent_id', p.parent_id,
      'author_display_name', p.author_display_name, 'is_anonymous', p.is_anonymous,
      'type', p.type, 'status', p.status, 'resolved_at', p.resolved_at,
      'content', p.content, 'created_at', p.created_at, 'created_mode', p.created_mode
    ) into payload
    from public.posts_public p
    where p.id = new.id;
    payload := payload || jsonb_build_object('op', tg_op);
  end if;

  perform realtime.send(payload, 'post_change', 'lecture:' || target_lecture_id::text, false);
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_broadcast_post_change
after insert or update or delete on posts
for each row execute function broadcast_post_change();

-- ---- post_likes: 좋아요/취소 -> 해당 글의 좋아요 개수 재계산해서 전송 ----
create or replace function broadcast_post_like_change()
returns trigger
security definer
set search_path = ''
as $$
declare
  affected_post_id uuid := coalesce(new.post_id, old.post_id);
  target_lecture_id uuid;
  count_val integer;
begin
  select lecture_id into target_lecture_id from public.posts where id = affected_post_id;
  select like_count into count_val from public.post_likes_counts where post_id = affected_post_id;

  perform realtime.send(
    jsonb_build_object('post_id', affected_post_id, 'like_count', coalesce(count_val, 0)),
    'like_change',
    'lecture:' || target_lecture_id::text,
    false
  );
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_broadcast_post_like_change
after insert or delete on post_likes
for each row execute function broadcast_post_like_change();

-- ---- lecture_feedback_votes: 투표/취소/강의자 초기화 -> 개수 재계산해서 전송 ----
create or replace function broadcast_feedback_vote_change()
returns trigger
security definer
set search_path = ''
as $$
declare
  affected_lecture_id uuid := coalesce(new.lecture_id, old.lecture_id);
  affected_type text := coalesce(new.feedback_type, old.feedback_type);
  counts record;
begin
  select like_count, dislike_count into counts
  from public.lecture_feedback_votes_counts
  where lecture_id = affected_lecture_id and feedback_type = affected_type;

  perform realtime.send(
    jsonb_build_object(
      'feedback_type', affected_type,
      'like_count', coalesce(counts.like_count, 0),
      'dislike_count', coalesce(counts.dislike_count, 0)
    ),
    'feedback_change',
    'lecture:' || affected_lecture_id::text,
    false
  );
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_broadcast_feedback_vote_change
after insert or delete on lecture_feedback_votes
for each row execute function broadcast_feedback_vote_change();

-- ---- nodes: 강의 제목 변경 ----
create or replace function broadcast_lecture_name_change()
returns trigger
security definer
set search_path = ''
as $$
begin
  if new.type = 'lecture' and new.name is distinct from old.name then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'name', new.name),
      'lecture_updated',
      'lecture:' || new.id::text,
      false
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_broadcast_lecture_name_change
after update on nodes
for each row execute function broadcast_lecture_name_change();

-- ---- lectures: 일정/장소/정원 변경 ----
create or replace function broadcast_lecture_details_change()
returns trigger
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id, 'start_time', new.start_time, 'end_time', new.end_time,
      'location', new.location, 'max_participants', new.max_participants
    ),
    'lecture_details_updated',
    'lecture:' || new.id::text,
    false
  );
  return new;
end;
$$ language plpgsql;

create trigger trg_broadcast_lecture_details_change
after update on lectures
for each row execute function broadcast_lecture_details_change();
