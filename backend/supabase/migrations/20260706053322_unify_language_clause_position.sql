-- 스타일 통일: language 절 위치를 함수 본문($$...$$) 뒤로 맞춤 (동작 변화 없음)
create or replace function handle_new_user()
returns trigger
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email)
  );
  return new;
end;
$$ language plpgsql;

create or replace function public.delete_own_account()
returns void
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$ language plpgsql;

create or replace function anonymize_posts_before_profile_delete()
returns trigger
set search_path = public
as $$
begin
  update posts
  set is_anonymous = true
  where author_id = old.id;
  return old;
end;
$$ language plpgsql;
