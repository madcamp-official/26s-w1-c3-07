-- nodes.parent_id가 가리키는 부모 노드와 created_by/created_mode가 반드시 일치해야 함
-- (남의 트리 밑에 내 노드를 끼워 넣거나, 내 강의자/수강생 모드 트리가 서로 섞이는 것을 방지).
-- 다른 행(부모 행)을 참조해야 해서 check 제약으로는 표현 불가(서브쿼리 금지) -> 트리거로 구현.
create or replace function enforce_nodes_parent_ownership()
returns trigger as $$
begin
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

create trigger trg_enforce_nodes_parent_ownership
before insert or update on nodes
for each row execute function enforce_nodes_parent_ownership();
