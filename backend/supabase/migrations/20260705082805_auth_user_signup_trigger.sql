-- 회원 가입(Google OAuth 포함) 시 auth.users에 행이 생기면 profiles도 자동 생성
-- profiles는 INSERT 정책이 없어(RLS로 직접 INSERT 차단) 이 트리거가 유일한 생성 경로.
-- 일반 role은 public.profiles에 INSERT 권한이 없으므로 SECURITY DEFINER로 우회.
-- search_path를 명시적으로 고정해 스키마 하이재킹(함수 실행 중 다른 스키마의 동명 객체가 끼어드는 것)을 방지.
create or replace function handle_new_user()
returns trigger
language plpgsql
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
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();
