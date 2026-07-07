-- "내 강의" 페이지(수강생 모드)에서 즐겨찾기한 노드들의 서브트리를 한 번에 가져오는 RPC.
-- my_nodes에 등록된 즐겨찾기 루트별로 재귀적으로 자손까지 모두 가져오되, 결과 행마다
-- anchor_node_id(어느 즐겨찾기 루트에서 나온 행인지)를 같이 실어서, 프론트가 anchor_node_id로
-- 그룹핑해 즐겨찾기 루트별로 독립된 서브트리를 조립하도록 함.
--
-- union(중복 제거)이 아니라 union all을 써서, 어떤 노드가 두 즐겨찾기 루트의 서브트리에
-- 동시에 속하는 경우(예: 폴더 A와 그 하위 강의 B를 각각 따로 즐겨찾기한 경우) 일부러
-- 중복된 행을 유지한다 -- B가 A의 자손으로서, 그리고 B 자신의 루트로서 각각 화면에
-- 독립적으로 나타나야 하기 때문(전역 id 기준 dedup을 하면 이 요구사항이 깨짐).
--
-- 즐겨찾기가 정리된 개인 폴더(my_nodes.folder_id)는 이 함수 결과에 넣지 않는다. 프론트가
-- my_nodes를 직접 조회하면(RLS로 본인 행만 허용) node_id-folder_id 매핑을 이미 얻을 수 있어서,
-- 서브트리의 모든 행에 folder_id를 중복해서 실어 보낼 필요가 없다.
--
-- security invoker가 기본값이라 별도로 명시하지 않음. nodes는 이미 전체 공개 읽기이고,
-- my_nodes는 CTE 안에서 user_id = auth.uid()로 직접 걸러서 호출자 권한을 벗어나지 않는다.
create or replace function get_my_favorite_subtrees()
returns table (
  id uuid,
  parent_id uuid,
  node_type text,
  name text,
  created_by uuid,
  created_mode text,
  created_at timestamptz,
  anchor_node_id uuid
)
as $$
  with recursive favorite_roots as (
    select node_id as anchor_node_id
    from my_nodes
    where user_id = auth.uid()
  ),
  subtree as (
    select n.*, r.anchor_node_id
    from nodes n
    join favorite_roots r on n.id = r.anchor_node_id
    union all
    select n.*, s.anchor_node_id
    from nodes n
    join subtree s on n.parent_id = s.id
  )
  select id, parent_id, node_type, name, created_by, created_mode, created_at, anchor_node_id
  from subtree;
$$ language sql;
