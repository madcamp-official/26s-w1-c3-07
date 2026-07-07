-- submit-post Edge Function 전용 임시 스테이징 테이블.
-- 유사 질문이 발견되면 최종 제출본을 여기 잠깐 저장해두고, 사용자가 "강행 제출"을
-- 누르면 이 행 내용 그대로 posts에 insert한 뒤 삭제한다. "보러 가기"/"취소"를
-- 누르면 아무 것도 안 해도 됨 — 고아로 남은 draft는 posts에 반영되지 않으니 무해하고,
-- 필요하면 나중에 created_at 기준으로 오래된 것만 가끔 청소하면 된다.
--
-- anon/authenticated에게 어떤 권한도 주지 않음 — submit-post가 service_role로만
-- 접근하는 내부 스크래치 공간이라 RLS 정책도 필요 없음(정책이 하나도 없으면 그 자체로
-- anon/authenticated에게는 기본 거부이고, service_role은 BYPASSRLS라 무관하게 접근 가능).
create table post_drafts (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references lectures(id) on delete cascade,
  parent_id uuid references posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  is_anonymous boolean not null,
  guest_token uuid,
  type text not null check (type in ('question', 'opinion')),
  content text not null,
  created_mode text not null check (created_mode in ('lecturer', 'student')),
  created_at timestamptz not null default now() -- draft가 "언제 스테이징됐는지"일 뿐, 실제 posts.created_at은 강행 제출 시점에 새로 채워짐
);

alter table post_drafts enable row level security;
revoke all on post_drafts from anon, authenticated;
