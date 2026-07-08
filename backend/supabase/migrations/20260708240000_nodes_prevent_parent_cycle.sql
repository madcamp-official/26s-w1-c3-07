-- enforce_nodes_parent_rules()는 지금까지 부모가 강의(lecture)가 아닌지, 소유자/모드가
-- 일치하는지만 검사하고 parent_id 체인에 사이클이 생기는 건 막지 않았음(TODO #2). INSERT는
-- 새 행이라 자기 자신의 자손이 될 수 없어 문제없지만, UPDATE로 어떤 노드의 parent_id를
-- 그 노드 자신의 하위 트리 안에 있는 노드로 바꾸면(예: A -> B -> C인데 A의 부모를 C로 변경)
-- 사이클이 생겨 재귀 조회(get_my_favorite_subtrees 등)가 무한 루프에 빠짐.
--
-- parent_id가 자기 자신인 경우는 즉시 비교로 걸러내고, 더 깊은 사이클(자기 자신의 자손을
-- 부모로 지정)은 새 부모 후보가 이 노드의 자손 트리에 속하는지 with recursive로 확인해야
-- 함(다른 행을 재귀적으로 조회해야 해서 check 제약으로는 표현 불가). 사이클은 parent_id가
-- 실제로 바뀌는 UPDATE에서만 발생할 수 있어 INSERT와 parent_id 변경이 없는 UPDATE는 검사하지
-- 않음(불필요한 재귀 조회 방지).
create or replace function enforce_nodes_parent_rules()
returns trigger as $$
begin
  if new.parent_id is not null and exists (
    select 1 from nodes parent
    where parent.id = new.parent_id
      and parent.type = 'lecture'
  )
  then
    raise exception '강의는 자식 노드(폴더/강의)를 가질 수 없습니다';
  end if;

  if new.parent_id is not null and exists (
    select 1 from nodes parent
    where parent.id = new.parent_id
      and (parent.created_by is distinct from new.created_by
           or parent.created_mode is distinct from new.created_mode)
  )
  then
    raise exception '부모 폴더와 소유자/모드가 일치해야 합니다';
  end if;

  if tg_op = 'UPDATE' and new.parent_id is not null and new.parent_id is distinct from old.parent_id then
    if new.parent_id = new.id then
      raise exception '자기 자신을 부모로 지정할 수 없습니다';
    end if;

    if exists (
      with recursive descendants as (
        select id from nodes where parent_id = new.id
        union all
        select n.id from nodes n join descendants d on n.parent_id = d.id
      )
      select 1 from descendants where id = new.parent_id
    )
    then
      raise exception '자기 자신의 하위 노드를 부모로 지정할 수 없습니다 (트리에 사이클이 생깁니다)';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;
