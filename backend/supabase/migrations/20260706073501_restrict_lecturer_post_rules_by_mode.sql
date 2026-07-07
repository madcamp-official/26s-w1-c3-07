-- 같은 계정이라도 "수강생 모드"로 자기 강의에 들어왔을 때는 일반 수강생처럼
-- 게시글/질문을 자유롭게 쓸 수 있어야 함. 프론트가 매 요청마다 x-mode 커스텀
-- 헤더(lecturer/student)를 실어 보내고, 이 트리거는 x-mode가 lecturer일 때만
-- (헤더가 없으면 기존 동작과 동일하게 안전하게 lecturer로 간주) 제한을 적용함.
-- x-mode는 클라이언트 자율 신고값이라 강의자가 student로 위장해 우회할 수 있는데,
-- 이 정도 느슨함은 감수하기로 함(guest_token과 달리 위변조 방지 목적이 아니라
-- "지금 어떤 화면으로 들어왔는지"를 서버에 알려주는 용도).
create or replace function restrict_lecturer_post_rules()
returns trigger as $$
begin
  if exists (
    select 1 from lectures join nodes on nodes.id = lectures.node_id
    where lectures.node_id = new.lecture_id and nodes.created_by = new.author_id
  )
  and coalesce(current_setting('request.headers', true)::json ->> 'x-mode', 'lecturer') = 'lecturer'
  then
    if new.parent_id is null then
      raise exception '강의자는 게시글(최상위 글)을 작성할 수 없습니다. 답글만 작성 가능합니다';
    end if;
    if new.post_type = 'question' then
      raise exception '강의자의 답글은 의견(opinion) 타입만 가능합니다';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
