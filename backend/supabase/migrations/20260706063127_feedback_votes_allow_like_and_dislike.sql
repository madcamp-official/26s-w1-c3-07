-- 기존 PK(lecture_id, feedback_type, voter_key)는 한 사람당 좋아요/싫어요 중 하나만 허용했음.
-- 좋아요 개수와 싫어요 개수를 각각 보여주면서, 한 사람이 같은 feedback_type에
-- 좋아요와 싫어요를 동시에 독립적으로 누를 수 있게 하기 위해 PK에 value를 추가.
alter table lecture_feedback_votes drop constraint lecture_feedback_votes_pkey;
alter table lecture_feedback_votes add primary key (lecture_id, feedback_type, voter_key, value);
