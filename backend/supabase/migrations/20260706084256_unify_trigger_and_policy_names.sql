-- 트리거 이름을 함수 이름 축약 없이 그대로(trg_ + 함수명) 쓰도록 통일
drop trigger on_auth_user_created on auth.users;
create trigger trg_handle_new_user
after insert on auth.users
for each row execute function handle_new_user();

drop trigger trg_block_status_change on posts;
create trigger trg_block_status_change_by_non_lecturer
before update on posts
for each row execute function block_status_change_by_non_lecturer();

drop trigger trg_set_resolved_at on posts;
create trigger trg_set_resolved_at_on_status_change
before update on posts
for each row execute function set_resolved_at_on_status_change();

-- RLS 정책 이름의 테이블 접두사를 축약 없이 실제 테이블명 그대로 쓰도록 통일
drop policy "join_codes_select_all" on lecture_join_codes;
create policy "lecture_join_codes_select_all" on lecture_join_codes for select using (true);

drop policy "join_codes_owner_all" on lecture_join_codes;
create policy "lecture_join_codes_owner_all" on lecture_join_codes for insert
  with check (exists (select 1 from lectures join nodes on nodes.id = lectures.node_id where lectures.node_id = lecture_id and nodes.created_by = auth.uid()));

drop policy "join_codes_owner_delete" on lecture_join_codes;
create policy "lecture_join_codes_owner_delete" on lecture_join_codes for delete
  using (exists (select 1 from lectures join nodes on nodes.id = lectures.node_id where lectures.node_id = lecture_id and nodes.created_by = auth.uid()));

drop policy "feedback_select_all" on lecture_feedback_votes;
create policy "lecture_feedback_votes_select_all" on lecture_feedback_votes for select using (true);

drop policy "feedback_insert_own" on lecture_feedback_votes;
create policy "lecture_feedback_votes_insert_own" on lecture_feedback_votes for insert
  with check (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));

drop policy "feedback_delete_own" on lecture_feedback_votes;
create policy "lecture_feedback_votes_delete_own" on lecture_feedback_votes for delete
  using (voter_key = coalesce(auth.uid(), (current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid));

drop policy "feedback_lecturer_reset" on lecture_feedback_votes;
create policy "lecture_feedback_votes_lecturer_reset" on lecture_feedback_votes for delete
  using (exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = lecture_feedback_votes.lecture_id and nodes.created_by = auth.uid()
  ));
