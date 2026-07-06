-- 데모/테스트용 더미 데이터.
-- profiles는 새로 만들지 않고 테스트용으로 가입해둔 실제 계정 3개를 재사용합니다
-- (auth.users에 FK가 걸려 있어 가짜 auth.users를 직접 만드는 건 피함).
--   A = 6785527b-6fd4-4c61-b8ba-f1dcd0692c03 (안소희1) — "그래프 이론"/"DB 설계" 강의자
--   B = 6afee91c-3ce9-438f-9c0b-868b6ef45159 (안소희2) — "프로세스와 스레드"/"메모리 관리와 가상 메모리"/"파일 시스템과 입출력" 강의자
--   C = 0c58fd0c-8d15-4ed8-a546-134537590d8c (안소희3) — "커리어 토크"/"스택과 큐"/"정렬과 탐색" 강의자
-- A는 강의자 모드(자기 강의 2개)와 수강생 모드(다른 사람 강의/폴더 즐겨찾기)를 둘 다 사용하는 계정으로 구성.

begin;

-- ===== nodes: A가 강의자 모드로 만든 폴더/강의 =====
insert into nodes (id, parent_id, node_type, name, created_by, created_mode, created_at) values
  ('f0000000-0000-0000-0000-000000000001', null, 'folder', '그래프 이론 강의', '6785527b-6fd4-4c61-b8ba-f1dcd0692c03', 'lecturer', now() - interval '10 days'),
  ('f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'lecture', '트리와 그래프', '6785527b-6fd4-4c61-b8ba-f1dcd0692c03', 'lecturer', now() - interval '3 days'),
  ('f0000000-0000-0000-0000-000000000003', null, 'lecture', '데이터베이스 설계 입문', '6785527b-6fd4-4c61-b8ba-f1dcd0692c03', 'lecturer', now() - interval '1 day');

-- ===== nodes: A가 수강생 모드로 만든 개인 정리 폴더 =====
insert into nodes (id, parent_id, node_type, name, created_by, created_mode, created_at) values
  ('f0000000-0000-0000-0000-000000000004', null, 'folder', '컴퓨터 과학', '6785527b-6fd4-4c61-b8ba-f1dcd0692c03', 'student', now() - interval '9 days'),
  ('f0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000004', 'folder', '자료구조', '6785527b-6fd4-4c61-b8ba-f1dcd0692c03', 'student', now() - interval '9 days'),
  ('f0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000004', 'folder', '알고리즘', '6785527b-6fd4-4c61-b8ba-f1dcd0692c03', 'student', now() - interval '9 days');

-- ===== nodes: B/C가 강의자 모드로 만든 폴더 + 그 밑의 강의 (A는 수강생으로 즐겨찾기만) =====
-- 즐겨찾기(my_nodes)는 강의자 모드로 만든 노드만 등록 가능하므로, 운영체제/수학 폴더도
-- 강의자 모드로 만들고 B/C의 강의들을 그 밑에 둠 (B/C는 수강생 모드로 만들거나
-- 즐겨찾기한 게 하나도 없음).
insert into nodes (id, parent_id, node_type, name, created_by, created_mode, created_at) values
  ('f0000000-0000-0000-0000-000000000008', null, 'folder', '운영체제', '6afee91c-3ce9-438f-9c0b-868b6ef45159', 'lecturer', now() - interval '7 days'),
  ('f0000000-0000-0000-0000-000000000009', null, 'folder', '수학', '0c58fd0c-8d15-4ed8-a546-134537590d8c', 'lecturer', now() - interval '6 days'),
  ('f0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000008', 'lecture', '프로세스와 스레드', '6afee91c-3ce9-438f-9c0b-868b6ef45159', 'lecturer', now() - interval '7 days'),
  ('f0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000008', 'lecture', '메모리 관리와 가상 메모리', '6afee91c-3ce9-438f-9c0b-868b6ef45159', 'lecturer', now() - interval '5 days'),
  ('f0000000-0000-0000-0000-00000000000c', 'f0000000-0000-0000-0000-000000000008', 'lecture', '파일 시스템과 입출력', '6afee91c-3ce9-438f-9c0b-868b6ef45159', 'lecturer', now() - interval '4 days'),
  ('f0000000-0000-0000-0000-00000000000b', 'f0000000-0000-0000-0000-000000000009', 'lecture', '커리어 토크: 대기업 취업 전략', '0c58fd0c-8d15-4ed8-a546-134537590d8c', 'lecturer', now() - interval '4 days');

-- ===== nodes: C가 강의자 모드로 만든 신규 강의(자료구조/알고리즘 관련, 루트) =====
insert into nodes (id, parent_id, node_type, name, created_by, created_mode, created_at) values
  ('f0000000-0000-0000-0000-00000000000d', null, 'lecture', '스택과 큐', '0c58fd0c-8d15-4ed8-a546-134537590d8c', 'lecturer', now() - interval '3 days'),
  ('f0000000-0000-0000-0000-00000000000e', null, 'lecture', '정렬과 탐색', '0c58fd0c-8d15-4ed8-a546-134537590d8c', 'lecturer', now() - interval '2 days');

-- ===== lectures: 강의 부가 속성 =====
insert into lectures (node_id, start_time, end_time, location, max_participants) values
  ('f0000000-0000-0000-0000-000000000002', now() - interval '2 hours', now() + interval '30 minutes', '공학관 201호', null),
  ('f0000000-0000-0000-0000-000000000003', now() - interval '30 minutes', now() + interval '1 hour', '공학관 401호', 60),
  ('f0000000-0000-0000-0000-000000000006', now() - interval '5 days', now() - interval '5 days' + interval '90 minutes', '공학관 201호', null),
  ('f0000000-0000-0000-0000-00000000000a', now() + interval '4 days', now() + interval '4 days' + interval '2 hours', '대강당', 100),
  ('f0000000-0000-0000-0000-00000000000b', now() + interval '9 days', now() + interval '9 days' + interval '90 minutes', '온라인 (Zoom)', null),
  ('f0000000-0000-0000-0000-00000000000c', now() + interval '2 days', now() + interval '2 days' + interval '2 hours', '공학관 305호', 50),
  ('f0000000-0000-0000-0000-00000000000d', now() + interval '3 days', now() + interval '3 days' + interval '90 minutes', '공학관 302호', null),
  ('f0000000-0000-0000-0000-00000000000e', now() + interval '5 days', now() + interval '5 days' + interval '90 minutes', '공학관 302호', 40);

-- ===== lecture_join_codes: 강의 입장용 4자리 코드 =====
insert into lecture_join_codes (code, lecture_id) values
  ('1234', 'f0000000-0000-0000-0000-000000000002'),
  ('7421', 'f0000000-0000-0000-0000-000000000003'),
  ('3355', 'f0000000-0000-0000-0000-000000000006'),
  ('9981', 'f0000000-0000-0000-0000-00000000000a'),
  ('4420', 'f0000000-0000-0000-0000-00000000000b'),
  ('6612', 'f0000000-0000-0000-0000-00000000000c'),
  ('2580', 'f0000000-0000-0000-0000-00000000000d'),
  ('1357', 'f0000000-0000-0000-0000-00000000000e');

-- ===== my_nodes: A가 수강생 모드에서 즐겨찾기한 것들 =====
insert into my_nodes (user_id, node_id, folder_id) values
  ('6785527b-6fd4-4c61-b8ba-f1dcd0692c03', 'f0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000004'), -- 운영체제 -> 컴퓨터 과학 폴더 안에
  ('6785527b-6fd4-4c61-b8ba-f1dcd0692c03', 'f0000000-0000-0000-0000-000000000009', null), -- 수학 -> 최상위
  ('6785527b-6fd4-4c61-b8ba-f1dcd0692c03', 'f0000000-0000-0000-0000-00000000000d', 'f0000000-0000-0000-0000-000000000005'), -- 스택과 큐 -> 자료구조 폴더 안에
  ('6785527b-6fd4-4c61-b8ba-f1dcd0692c03', 'f0000000-0000-0000-0000-00000000000e', 'f0000000-0000-0000-0000-000000000007'); -- 정렬과 탐색 -> 알고리즘 폴더 안에

-- ===== posts: "트리와 그래프" 강의 =====
-- 최상위 질문 1 (비회원, 미해결) + 답글 3개(강의자 opinion / 비회원 질문 / 비회원 opinion)
insert into posts (id, lecture_id, parent_id, author_id, is_anonymous, guest_token, post_type, status, content, created_mode, created_at) values
  ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', null, null, true, 'd0000000-0000-0000-0000-000000000001', 'question', 'unresolved', 'DFS와 BFS의 메모리 사용량 차이와 실제 적용 사례가 궁금합니다.', 'student', now() - interval '50 minutes');

insert into posts (id, lecture_id, parent_id, author_id, is_anonymous, guest_token, post_type, status, content, created_mode, created_at) values
  ('e0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', '6785527b-6fd4-4c61-b8ba-f1dcd0692c03', false, null, 'opinion', null, '좋은 질문입니다! DFS는 트리 높이 h만큼의 공간(O(h))을 사용하고, BFS는 최대 너비 w만큼의 큐를 유지합니다(O(w)). 균형 이진 트리에서 h ≈ log n이므로 DFS가 훨씬 효율적입니다. 반면 최단 경로를 찾아야 할 때는 BFS가 필수입니다.', 'lecturer', now() - interval '48 minutes'),
  ('e0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', null, true, 'd0000000-0000-0000-0000-000000000002', 'question', null, '그렇다면 SNS 친구 관계처럼 매우 넓은 그래프에서는 BFS가 메모리 측면에서 불리한가요?', 'student', now() - interval '45 minutes'),
  ('e0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', null, true, 'd0000000-0000-0000-0000-000000000003', 'opinion', null, '저는 이 주제로 유튜브에서 본 시각화 영상이 이해에 많이 도움됐어요!', 'student', now() - interval '42 minutes');

-- 최상위 질문 2 (실명, 미해결)
insert into posts (id, lecture_id, parent_id, author_id, is_anonymous, guest_token, post_type, status, content, created_mode, created_at) values
  ('e0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000002', null, '0c58fd0c-8d15-4ed8-a546-134537590d8c', false, null, 'question', 'unresolved', '무방향 그래프에서 DFS로 사이클을 감지하는 방법이 방향 그래프와 어떻게 다른가요?', 'student', now() - interval '25 minutes');

-- 최상위 질문 3 (비회원, 해결됨) + 강의자 답글(opinion)
insert into posts (id, lecture_id, parent_id, author_id, is_anonymous, guest_token, post_type, status, resolved_at, content, created_mode, created_at) values
  ('e0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000002', null, null, true, 'd0000000-0000-0000-0000-000000000004', 'question', 'resolved', now() - interval '38 minutes', '트리의 정의에서 사이클이 없다는 조건이 왜 필요한가요?', 'student', now() - interval '40 minutes');

insert into posts (id, lecture_id, parent_id, author_id, is_anonymous, guest_token, post_type, status, content, created_mode, created_at) values
  ('e0000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000006', '6785527b-6fd4-4c61-b8ba-f1dcd0692c03', false, null, 'opinion', null, '사이클이 있으면 루트에서 특정 노드까지 가는 경로가 여러 개가 되어 트리의 계층 구조가 깨지기 때문입니다.', 'lecturer', now() - interval '38 minutes');

-- 최상위 질문 4 (실명, 해결됨, 답글 없음)
insert into posts (id, lecture_id, parent_id, author_id, is_anonymous, guest_token, post_type, status, resolved_at, content, created_mode, created_at) values
  ('e0000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000002', null, '6afee91c-3ce9-438f-9c0b-868b6ef45159', false, null, 'question', 'resolved', now() - interval '55 minutes', '최소 신장 트리에서 크루스칼과 프림 알고리즘의 시간 복잡도 차이를 다시 설명해 주실 수 있나요?', 'student', now() - interval '1 hour');

-- ===== posts: "데이터베이스 설계 입문" 강의 =====
insert into posts (id, lecture_id, parent_id, author_id, is_anonymous, guest_token, post_type, status, content, created_mode, created_at) values
  ('e0000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000003', null, null, true, 'd0000000-0000-0000-0000-000000000005', 'question', 'unresolved', '정규화 3단계(3NF)까지만 해도 충분한 경우와 그렇지 않은 경우의 기준이 궁금합니다.', 'student', now() - interval '20 minutes');

-- ===== post_likes: 좋아요 =====
insert into post_likes (post_id, voter_key) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-000000000001', '0c58fd0c-8d15-4ed8-a546-134537590d8c'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000004'),
  ('e0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000005');

-- ===== lecture_feedback_votes: 실시간 피드백 좋아요/싫어요 =====
insert into lecture_feedback_votes (lecture_id, feedback_type, voter_key, value) values
  ('f0000000-0000-0000-0000-000000000002', 'cold', 'd0000000-0000-0000-0000-000000000001', 1),
  ('f0000000-0000-0000-0000-000000000002', 'cold', 'd0000000-0000-0000-0000-000000000002', 1),
  ('f0000000-0000-0000-0000-000000000002', 'cold', '0c58fd0c-8d15-4ed8-a546-134537590d8c', -1),
  ('f0000000-0000-0000-0000-000000000002', 'hot', 'd0000000-0000-0000-0000-000000000003', -1),
  ('f0000000-0000-0000-0000-000000000002', 'hot', 'd0000000-0000-0000-0000-000000000004', -1),
  ('f0000000-0000-0000-0000-000000000002', 'quiet', 'd0000000-0000-0000-0000-000000000005', 1),
  ('f0000000-0000-0000-0000-000000000002', 'quiet', 'd0000000-0000-0000-0000-000000000006', 1),
  ('f0000000-0000-0000-0000-000000000002', 'dark', 'd0000000-0000-0000-0000-000000000001', 1),
  ('f0000000-0000-0000-0000-000000000003', 'cold', 'd0000000-0000-0000-0000-000000000002', 1),
  ('f0000000-0000-0000-0000-000000000003', 'quiet', 'd0000000-0000-0000-0000-000000000003', 1);

commit;
