-- 즐겨찾기(my_nodes)는 "남이 강의자 모드로 만든 노드"만 등록 가능해야 함
-- (남의 개인 정리용 수강생 모드 폴더까지 즐겨찾기할 수 있으면 안 됨).
-- CHECK 제약은 다른 테이블(nodes)을 서브쿼리로 참조 못 하므로 RLS로 구현.
-- my_nodes_owner_all이 이미 for all(permissive)로 열려 있어서, 여기에 그냥 permissive
-- 정책을 추가하면 OR로 합쳐져 오히려 더 넓어지기만 함 -- RESTRICTIVE로 만들어서
-- 기존 정책과 AND로 합쳐지게 함. node_id는 PK 컬럼이라 이론상 UPDATE도 가능해서
-- INSERT/UPDATE 둘 다 막음(posts_update_lecturer_mode_matches_owner와 동일한 패턴).
create policy "my_nodes_only_favorite_lecturer_mode_insert" on my_nodes as restrictive for insert
  with check (
    exists (select 1 from nodes where nodes.id = node_id and nodes.created_mode = 'lecturer')
  );

create policy "my_nodes_only_favorite_lecturer_mode_update" on my_nodes as restrictive for update
  using (true)
  with check (
    exists (select 1 from nodes where nodes.id = node_id and nodes.created_mode = 'lecturer')
  );
