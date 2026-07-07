-- my_nodes.folder_id("이 즐겨찾기를 넣어둔 내 개인 폴더")는 실제로 내가 수강생 모드로 만든
-- 폴더여야 하는데, 지금까지는 이걸 검사하지 않아 남의 폴더나 내 강의자 모드 폴더를
-- folder_id로 넣어도 막히지 않았음. 다른 테이블(nodes) 조회가 필요해 check 제약으로는
-- 표현 불가(서브쿼리 금지)이므로 my_nodes_only_favorite_lecturer_mode와 동일한 패턴으로
-- RESTRICTIVE 정책을 추가함.
-- node_type = 'folder' 조건은 별도로 안 걸어도 됨: nodes의
-- check (node_type <> 'lecture' or created_mode = 'lecturer') 제약의 대우로
-- created_mode = 'student' -> node_type = 'folder'가 이미 보장되기 때문.
create policy "my_nodes_folder_must_be_own_student_folder_insert" on my_nodes as restrictive for insert
  with check (
    folder_id is null or exists (
      select 1 from nodes
      where nodes.id = folder_id
        and nodes.created_by = auth.uid()
        and nodes.created_mode = 'student'
    )
  );

create policy "my_nodes_folder_must_be_own_student_folder_update" on my_nodes as restrictive for update
  using (true)
  with check (
    folder_id is null or exists (
      select 1 from nodes
      where nodes.id = folder_id
        and nodes.created_by = auth.uid()
        and nodes.created_mode = 'student'
    )
  );
