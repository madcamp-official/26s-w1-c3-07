-- my_nodes RLS 정책 이름을 다른 테이블과 같은 <테이블>_<동작>_<설명> 순서로 통일
-- (동작이 맨 뒤에 붙어 있던 my_nodes_*_insert/_update 예외를 없앰)
drop policy "my_nodes_only_favorite_lecturer_mode_insert" on my_nodes;
create policy "my_nodes_insert_only_favorite_lecturer_mode" on my_nodes as restrictive for insert
  with check (
    exists (select 1 from nodes where nodes.id = node_id and nodes.created_mode = 'lecturer')
  );

drop policy "my_nodes_only_favorite_lecturer_mode_update" on my_nodes;
create policy "my_nodes_update_only_favorite_lecturer_mode" on my_nodes as restrictive for update
  using (true)
  with check (
    exists (select 1 from nodes where nodes.id = node_id and nodes.created_mode = 'lecturer')
  );

drop policy "my_nodes_folder_must_be_own_student_folder_insert" on my_nodes;
create policy "my_nodes_insert_folder_must_be_own_student_folder" on my_nodes as restrictive for insert
  with check (
    folder_id is null or exists (
      select 1 from nodes
      where nodes.id = folder_id
        and nodes.created_by = auth.uid()
        and nodes.created_mode = 'student'
    )
  );

drop policy "my_nodes_folder_must_be_own_student_folder_update" on my_nodes;
create policy "my_nodes_update_folder_must_be_own_student_folder" on my_nodes as restrictive for update
  using (true)
  with check (
    folder_id is null or exists (
      select 1 from nodes
      where nodes.id = folder_id
        and nodes.created_by = auth.uid()
        and nodes.created_mode = 'student'
    )
  );
