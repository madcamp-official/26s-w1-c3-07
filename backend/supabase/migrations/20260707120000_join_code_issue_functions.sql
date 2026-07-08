-- code 후보 생성 로직을 컬럼 default로 옮겨, insert ... (lecture_id)만으로 랜덤 4자리 코드가 채워지게 함
-- (nodes.id 등이 default gen_random_uuid()를 쓰는 것과 같은 패턴)
alter table lecture_join_codes
  alter column code set default lpad(floor(random() * 10000)::text, 4, '0');

-- 발급/재발급을 클라이언트 직접 INSERT/UPDATE로 못 하게 막고, 아래 두 함수로만 가능하게 강제.
-- 4자리 코드는 공간이 10000개뿐이라(uuid와 달리) 충돌 재시도 로직이 반드시 필요한데,
-- 클라이언트가 직접 INSERT하면 이 재시도를 챙길 수 없어서 함수 안으로 옮김.
-- 파기(DELETE)는 후보값 생성/충돌 재시도가 필요 없는 단순 삭제라 그대로 직접 쿼리 허용.
revoke insert, update on lecture_join_codes from anon, authenticated;

-- 위 revoke로 이제 발급 경로는 아래 SECURITY DEFINER 함수뿐이다. 이 프로젝트는 어떤 테이블에도
-- force row level security를 걸지 않았으므로, SECURITY DEFINER 함수 내부의 INSERT/DELETE는
-- RLS를 타지 않고 우회한다(테이블 소유자 권한으로 실행되므로). 그래서 "호출자가 이 강의의
-- 소유자인가"를 함수 안에서 직접 재검증한다.

-- lecture_join_codes_owner_all(insert 전용, 이제 도달 불가능한 죽은 정책)은 삭제한다.
-- 위 revoke로 직접 쿼리 경로 자체가 막혀 있고, 함수 경로는 SECURITY DEFINER라 이 정책을
-- 아예 타지 않으므로 남겨둘 이유가 없다.
drop policy "lecture_join_codes_owner_all" on lecture_join_codes;

-- 이미 발급된 코드가 있으면 그대로 반환하고, 없으면 발급까지 한 번에 처리(버튼 클릭 시 조회+발급을 한 번의 호출로).
create or replace function public.get_or_create_join_code(p_lecture_id uuid)
returns text
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_attempts int := 0;
begin
  if not exists (
    select 1 from public.lectures join public.nodes on nodes.id = lectures.id
    where lectures.id = p_lecture_id and nodes.created_by = auth.uid()
  ) then
    raise exception '본인 소유 강의의 join_code만 발급할 수 있습니다';
  end if;

  select code into v_code from public.lecture_join_codes where lecture_id = p_lecture_id;
  if v_code is not null then
    return v_code;
  end if;

  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'join code 발급 실패: 재시도 횟수 초과';
    end if;

    begin
      insert into public.lecture_join_codes (lecture_id) values (p_lecture_id)
        returning code into v_code;
      return v_code;
    exception
      when unique_violation then
        -- lecture_id unique 충돌이면 동시 요청이 이미 발급한 것이므로 그 값을 반환하고,
        -- code PK 충돌이면 위 select는 null이라 루프가 계속되어 default가 새 랜덤 값으로 재시도
        select code into v_code from public.lecture_join_codes where lecture_id = p_lecture_id;
        if v_code is not null then
          return v_code;
        end if;
    end;
  end loop;
end;
$$ language plpgsql;

revoke all on function public.get_or_create_join_code(uuid) from public;
grant execute on function public.get_or_create_join_code(uuid) to authenticated;

-- 기존 코드를 강제로 폐기하고 새 코드를 발급(DB_DESIGN.md의 "재발급 = DELETE 후 새 INSERT" 원칙).
create or replace function public.reissue_join_code(p_lecture_id uuid)
returns text
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_attempts int := 0;
begin
  if not exists (
    select 1 from public.lectures join public.nodes on nodes.id = lectures.id
    where lectures.id = p_lecture_id and nodes.created_by = auth.uid()
  ) then
    raise exception '본인 소유 강의의 join_code만 재발급할 수 있습니다';
  end if;

  delete from public.lecture_join_codes where lecture_id = p_lecture_id;

  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'join code 재발급 실패: 재시도 횟수 초과';
    end if;

    begin
      insert into public.lecture_join_codes (lecture_id) values (p_lecture_id)
        returning code into v_code;
      return v_code;
    exception
      when unique_violation then
        -- 방금 지웠으므로 lecture_id 충돌은 없고, code PK 충돌만 재시도 대상
        null;
    end;
  end loop;
end;
$$ language plpgsql;

revoke all on function public.reissue_join_code(uuid) from public;
grant execute on function public.reissue_join_code(uuid) to authenticated;
