-- 강의 종료 시각이 시작 시각보다 늦어야 함을 강제.
-- 라이브 DB에 이미 위반하는 테스트성 데이터 2건이 있어서(수동 테스트 중 생성된 것으로 보임,
-- DUMMY_DATA.md 시드 데이터 아님), end_time을 start_time + 1시간으로 먼저 고친 뒤 제약 추가.
alter table lectures
  add constraint lectures_end_after_start check (end_time > start_time);
