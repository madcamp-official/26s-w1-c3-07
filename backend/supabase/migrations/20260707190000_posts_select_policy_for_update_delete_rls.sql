-- 원인: Postgres는 UPDATE/DELETE가 대상 행을 찾을 때(WHERE 절 평가) SELECT 커맨드에 대한
-- RLS 가시성도 함께 요구한다. posts는 SELECT 정책이 하나도 없어(20260706093000에서 SELECT를
-- 통째로 회수) UPDATE/DELETE 전용 정책(posts_update_own 등)이 아무리 맞아도 대상 행 자체가
-- "안 보이는" 걸로 취급되어 전부 0행 매치로 실패하고 있었다(RLS 정책 문제가 아니라 GRANT+RLS
-- 조합의 구조적 한계). 20260707180000에서 GRANT SELECT만 복구한 걸로는 부족했던 이유.
--
-- 해결: UPDATE/DELETE가 실제로 허용해야 하는 행과 정확히 같은 조건으로 SELECT 정책을 추가해
-- "가시성"을 확보한다. guest_token/author_id가 이 SELECT로 노출되면 원래 목적(비회원 위장
-- 방지, 익명 상관관계 공격 방지)이 무너지므로, 이 두 컬럼만 컬럼 단위로 GRANT에서 계속
-- 제외해 select('*')나 select('guest_token')류는 여전히 42501로 막히게 한다.

create policy "posts_select_own" on posts for select
  using (
    author_id = auth.uid()
    or guest_token = ((current_setting('request.headers', true)::json ->> 'x-guest-token')::uuid)
  );

create policy "posts_select_lecturer" on posts for select
  using (
    exists (
      select 1 from lectures join nodes on nodes.id = lectures.id
      where lectures.id = posts.lecture_id and nodes.created_by = auth.uid()
    )
  );

revoke select on posts from anon, authenticated;
grant select (id, lecture_id, parent_id, is_anonymous, type, status, resolved_at, content, created_at, created_mode)
  on posts to anon, authenticated;
