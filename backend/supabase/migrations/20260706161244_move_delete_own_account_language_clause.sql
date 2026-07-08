-- delete_own_account()만 language sql 절이 본문 앞에 있었음(sql 언어로 바꾼 마이그레이션에서
-- 위치를 안 옮김). 20260706053322_unify_language_clause_position.sql에서 정한 대로
-- language 절을 본문($$...$$) 뒤로 옮겨 다른 함수들과 스타일 통일 (동작 변화 없음).
create or replace function public.delete_own_account()
returns void
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$ language sql;
