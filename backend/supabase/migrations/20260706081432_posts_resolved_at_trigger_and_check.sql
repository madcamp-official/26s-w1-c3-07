-- status가 resolved로 바뀌면 resolved_at을 자동으로 찍고, resolved가 아니게 되면(다시
-- unresolved로 돌아가거나 애초에 답글이라 status가 null인 경우) resolved_at도 null로 되돌림.
create or replace function set_resolved_at_on_status_change()
returns trigger as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_at := now();
  elsif new.status is distinct from 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_resolved_at
before update on posts
for each row execute function set_resolved_at_on_status_change();

-- status='resolved'와 resolved_at 존재 여부를 양방향으로 강제 (트리거를 거치지 않은
-- 직접 INSERT/UPDATE에 대한 안전장치)
alter table posts add constraint posts_resolved_at_matches_status
  check ((status = 'resolved') = (resolved_at is not null));
