-- enforce_nodes_parent_ownership()가 이제 소유권(created_by/created_mode) 검사뿐 아니라
-- "부모가 강의(lecture)면 안 됨" 같은 구조적 규칙까지 검사하게 됐는데, 함수/트리거 이름은
-- 여전히 "ownership"만 검사하는 것처럼 보여서 실제 검사 범위를 포괄하는 이름으로 정정.
alter function enforce_nodes_parent_ownership() rename to enforce_nodes_parent_rules;
alter trigger trg_enforce_nodes_parent_ownership on nodes rename to trg_enforce_nodes_parent_rules;
