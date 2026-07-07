-- posts_author_id_guest_token_exclusive 제약(author_id is null or guest_token is null)이 생기면서
-- "guest_token = header"가 참이라는 것 자체가 이미 author_id is null을 함의하게 됨.
-- posts_update_own/posts_delete_own의 "author_id is null and" 가드가 논리적으로 중복이 되어 정리함.
drop policy "posts_update_own" on posts;
create policy "posts_update_own" on posts for update
  using (
    author_id = auth.uid()
    or guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')
  )
  with check (
    author_id = auth.uid()
    or guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')
  );

drop policy "posts_delete_own" on posts;
create policy "posts_delete_own" on posts for delete
  using (
    author_id = auth.uid()
    or guest_token = (current_setting('request.headers', true)::json ->> 'x-guest-token')
  );
