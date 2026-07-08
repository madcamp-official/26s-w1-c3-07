-- nodes.parent_id가 가리키는 부모 노드가 강의(type = 'lecture')면 안 됨을 추가로 강제.
-- 강의는 트리의 리프(leaf)여야 하고 그 밑에 폴더/강의를 또 만들 수 있으면 안 되는데,
-- 지금까지는 이걸 막는 제약이 하나도 없었음(부모의 type을 참조해야 해서 check 제약으로는
-- 표현 불가 -> 기존 enforce_nodes_parent_ownership 트리거에 조건을 추가).
create or replace function enforce_nodes_parent_ownership()
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
  return new;
end;
$$ language plpgsql;
