-- delete_own_account()는 분기/변수 없는 단순 DELETE 한 줄이라 plpgsql이 필요 없음.
-- (트리거 함수와 달리 일반 RPC라 sql 언어로도 정의 가능)
create or replace function public.delete_own_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;
