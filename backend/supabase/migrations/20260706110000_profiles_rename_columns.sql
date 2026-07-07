-- profiles 컬럼 이름 단순화: display_name -> name, last_mode -> mode
-- 뷰(posts_public)/체크 제약(last_mode in (...))은 컬럼을 attnum으로 참조하므로 자동으로 따라감.
-- handle_new_user()는 함수 본문이 순수 텍스트라 자동 반영이 안 돼서 같이 갱신해야 함.
alter table profiles rename column display_name to name;
alter table profiles rename column last_mode to mode;

create or replace function handle_new_user()
returns trigger
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email)
  );
  return new;
end;
$$ language plpgsql;
