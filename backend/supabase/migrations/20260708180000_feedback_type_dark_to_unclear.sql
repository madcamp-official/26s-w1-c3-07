-- "잘 안 보여요" 피드백 유형의 영어 키를 dark -> unclear로 변경.
-- dark는 조명이 어둡다는 뜻으로 오해되기 쉽고, 원래 의도는 "글씨가 작아서/흐려서 안 보인다"는
-- 뜻이라 unclear가 더 정확함. 이전에 한 번 이 값을 unclear로 바꾼 적이 있었지만, 그때는
-- 이미 적용된 init_schema.sql 마이그레이션의 텍스트만 고치고 실제 ALTER를 하지 않아
-- 라이브 DB와 프론트가 계속 dark를 쓰고 있었음(06589ff에서 문서/파일 텍스트를 dark로 원복).
-- 이번엔 기존 데이터까지 UPDATE하고 제약을 실제로 ALTER해서 라이브 DB에 반영한다.
update lecture_feedback_votes set feedback_type = 'unclear' where feedback_type = 'dark';

alter table lecture_feedback_votes
  drop constraint lecture_feedback_votes_feedback_type_valid,
  add constraint lecture_feedback_votes_feedback_type_valid check (feedback_type in ('cold', 'hot', 'quiet', 'unclear'));
