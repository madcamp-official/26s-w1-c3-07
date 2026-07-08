-- 회원 탈퇴: 로그인한 본인만 자기 auth.users 행을 삭제할 수 있게 하는 RPC.
-- auth.users DELETE는 일반 role(anon/authenticated)에게 권한이 없어 SECURITY DEFINER로 우회.
-- auth.uid()로 대상을 "요청자 본인"으로 못박아, 다른 사람 계정 삭제를 원천 차단.
-- search_path를 비워 모든 참조를 완전한 스키마 경로로 강제(스키마 하이재킹 방지).
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
