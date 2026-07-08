-- TODO #1(lecture_join_codes 파기)/#2(post_drafts 정기 삭제) 구현. pg_cron으로 두 정리
-- 작업을 등록한다.
create extension if not exists pg_cron;

-- 강의 종료(end_time) 후 1시간이 지난 강의의 공유 코드를 파기한다(설계 결정, TODO #1 참고).
-- 안 지워져도 입장 시 lectures.end_time 확인이 안전망이라 급하지 않은 정리라, 15분마다
-- 확인하는 정도로 충분하다고 판단(너무 잦으면 불필요한 스캔, 너무 뜸하면 파기가 늦어짐).
select cron.schedule(
  'purge_expired_join_codes',
  '*/15 * * * *',
  $$
  delete from lecture_join_codes
  using lectures
  where lectures.id = lecture_join_codes.lecture_id
    and lectures.end_time < now() - interval '1 hour'
  $$
);

-- 유사 질문 발견 시 스테이징되는 post_drafts는 "취소"/"보러 가기" 선택 시 아무 삭제 없이
-- 고아로 남는다(TODO #2 참고). 강행 제출은 보통 같은 세션 내 몇 분 안에 일어나므로, 하루가
-- 지나도 남아있는 행은 사실상 방치된 것으로 보고 지운다. 정리 자체가 급하지 않은
-- 하우스키핑이라 트래픽이 적은 새벽 시간대(KST 새벽 3시 = UTC 18시)에 하루 한 번만 실행한다.
select cron.schedule(
  'purge_stale_post_drafts',
  '0 18 * * *',
  $$delete from post_drafts where created_at < now() - interval '1 day'$$
);
