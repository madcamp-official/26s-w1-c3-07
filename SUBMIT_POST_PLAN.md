# 계획: AI 보조 글 제출 워크플로우 — `submit-post` Edge Function

## Context

지금까지는 `posts` 작성이 클라이언트에서 `supabase.from('posts').insert(...)`로 직접 이뤄졌고(RLS `posts_insert_anyone`/`posts_insert_lecturer_mode_matches_owner`로 허용), README 필수 기능인 "AI 적절성 검사"/"AI 유사 질문 탐지"/"AI 교정"은 아직 실제 구현이 없어 3개의 더미 Edge Function(`ai-correct`, `ai-moderate`, `ai-similarity`)만 배포되어 있었다.

사용자가 실제로 원하는 흐름은 이렇다:

1. 사용자가 글 작성란에서 "AI 교정" 토글을 켜거나 끈 채로 제출
2. 서버가 (a) 적절성 검사 → 부적절하면 거부, (b) 유사 질문 존재 여부 판별(질문 타입일 때만) → 있으면 해당 글 id들을 반환하고 **아직 저장하지 않음**
3. 유사 질문이 있으면 프론트는 "보러 가기 / 강행 제출 / 취소" 중 선택. **강행 제출**을 선택하면 서버에 다시 요청(이번엔 유사도 검사를 건너뜀)
4. 이 두 번째(혹은 강행) 요청에서: AI 교정이 켜져 있었으면 교정 결과만 반환(역시 아직 저장 안 함, 프론트가 더 고쳐서 재제출), 꺼져 있었으면 그 자리에서 바로 DB에 저장
5. 교정 후 재제출은 완전히 새 요청으로, 다시 1번(적절성 검사)부터 시작

이 흐름을 "강제"하려면(클라이언트가 검사를 우회해 `posts`에 직접 insert 못 하게) 현재 열려 있는 두 INSERT RLS 정책을 막고, 모든 쓰기를 이 Edge Function(`service_role` 키 사용, RLS 우회)으로만 하도록 전환하기로 사용자와 확정했다. 상태 관리는 **완전히 무상태(stateless)**로 간다 — 서버는 아무것도 임시 저장하지 않고, 매 호출마다 적절성 검사를 새로 수행한다(어차피 교정 후 재제출은 내용이 바뀌므로 다시 검사하는 게 맞고, 그럴 경우 서버 쪽 스테이징 테이블/구분 로직이 필요 없어져 훨씬 단순해짐). 이건 사용자가 직접 지적하고 확인한 설계 포인트.

## 확정된 설계

### 요청/응답 계약

**`POST /functions/v1/submit-post`**

요청 헤더: `Authorization: Bearer <jwt>`(회원, 선택) + `x-guest-token: <uuid>`(비회원, 선택) — 기존 `guest_token` 관례(SUPABASE_GUIDE.md 7번) 그대로 재사용.

요청 바디:
```ts
{
  lecture_id: string,
  parent_id: string | null,
  type: 'question' | 'opinion',
  content: string,
  created_mode: 'lecturer' | 'student',
  is_anonymous: boolean,
  author_id?: string | null,       // 클라이언트가 주장하는 값, 인증된 identity와 대조만 함
  use_ai_correction: boolean,
  force?: boolean,                  // 기본 false. true = 유사도 검사 건너뜀("강행 제출")
}
```

서버 로직 순서 (매 호출마다 처음부터 재검증, 상태 없음):

1. **요청 형태 검증** — 필수 필드/enum 값 확인. 실패 시 `400 { result: 'invalid', reason }`.
2. **identity 확인** — `Authorization` 있으면 anon-key 클라이언트로 `.auth.getUser()`(JWT 검증) → `resolvedAuthorId`. 없으면 게스트(`x-guest-token`을 `guest_token`으로). 클라이언트가 보낸 `author_id`가 있으면 identity와 일치하는지 확인(불일치 시 `403`). `!resolvedAuthorId && !is_anonymous`면 `400`(비회원은 반드시 익명).
3. **강의자 모드 소유권 검증** (기존 `posts_insert_lecturer_mode_matches_owner` 재현) — `created_mode === 'lecturer'`면 `lectures join nodes`로 `nodes.created_by = resolvedAuthorId` 확인, 실패 시 `403`. 추가로 `created_mode === 'lecturer'`인데 `parent_id === null || type !== 'opinion'`이면(테이블 CHECK가 걸리기 전에) 미리 `400`으로 친절하게 거부.
4. **적절성 검사** (`moderateContent`, 지금은 더미: 항상 통과) — 거부되면 `422 { result: 'rejected', reason }`.
5. **유사도 검사** — `type === 'question' && !force`일 때만 수행(`checkSimilarity`, 지금은 더미: 항상 빈 배열). 유사 글 있으면 `409 { result: 'similar_found', similar_ids: [...] }`, **저장 안 함**.
6. **AI 교정** — `use_ai_correction === true`면 `correctContent` 호출(더미: 원문 그대로) 후 `200 { result: 'corrected', corrected }` 반환, **저장 안 함**. 프론트는 이 내용을 다듬어 `force: false, use_ai_correction: false`로 재요청(1번부터 재시작).
7. **실제 INSERT** — 여기 도달했다는 건 검사 통과 + 교정 요청 안 함. `service_role` 클라이언트로 `posts`에 insert(`status`는 클라이언트를 안 믿고 `parent_id === null ? 'unresolved' : null`로 서버가 직접 계산). 성공 시 `201 { result: 'created', post }`.

### RLS 변경 (새 마이그레이션)

```sql
-- posts INSERT를 anon/authenticated 클라이언트에서 완전히 차단.
-- 이후 posts 작성은 submit-post Edge Function(service_role)을 통해서만 이뤄짐.
drop policy "posts_insert_anyone" on posts;
drop policy "posts_insert_lecturer_mode_matches_owner" on posts;
revoke insert on posts from anon, authenticated;
```

확인된 사실:
- `service_role`은 Postgres `BYPASSRLS` 속성을 가지므로 위 REVOKE/정책 삭제와 무관하게 계속 insert 가능 — 추가 GRANT 불필요.
- `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`는 모든 배포된 Edge Function에 자동 주입됨(`supabase secrets set` 불필요, 이름 자체가 예약어라 수동 설정 시도하면 CLI가 거부함).
- 테이블 `check` 제약은 `service_role`로도 우회되지 않음(RLS만 우회됨) — 그래도 에러 메시지를 친절하게 하기 위해 3번 단계에서 미리 검증.
- UPDATE/DELETE 관련 RLS(`posts_update_own`, `posts_delete_own`, `posts_lecturer_update_status`, `posts_lecturer_delete` 등)는 이번 변경 범위 밖 — 그대로 유지(이 작업은 "새 글 제출" 게이트에만 해당, 기존 글 수정/삭제는 여전히 클라이언트 직접 RLS 경로).

### 파일 구조

기존 3개 더미 함수(`ai-correct`, `ai-moderate`, `ai-similarity`)는 **삭제**하고 하나로 통합(별도 배포 유지 시 내부 HTTP 왕복만 늘고 얻는 게 없음 — 지금도 미래도 순수 로직이라 굳이 분리 배포할 이유 없음):

```
backend/supabase/functions/
  submit-post/
    index.ts        -- Deno.serve 핸들러: 파싱 → 단계별 오케스트레이션 → 응답
    identity.ts      -- resolveIdentity(req): JWT 검증 또는 guest_token 추출
    moderate.ts       -- moderateContent(content): 더미
    similarity.ts      -- checkSimilarity(lectureId, content): 더미
    correct.ts          -- correctContent(content): 더미
  _shared/
    cors.ts          (기존 그대로, 모든 응답 분기에서 빠짐없이 사용할 것 — 3개 더미 함수를 하나로 합치면서 흔히 생기는 실수)
```

`index.ts`/`identity.ts`의 정확한 코드 스케치, HTTP 상태 코드 표(`rejected`→422, `similar_found`→409, `corrected`→200, `created`→201, `invalid`→400/401/403), 그리고 아래 짚어둘 점들은 이번 세션에서 이미 상세 설계 완료(Deno `npm:@supabase/supabase-js@2` import, service-role/anon 클라이언트 분리 사용 패턴 포함).

## 변경할 파일 목록

- `backend/supabase/functions/submit-post/index.ts`, `identity.ts`, `moderate.ts`, `similarity.ts`, `correct.ts` (신규)
- `backend/supabase/functions/{ai-correct,ai-moderate,ai-similarity}/` 삭제
- `backend/supabase/migrations/20260707000000_posts_insert_via_edge_function_only.sql` (신규 — 위 RLS 변경)
- `DB_DESIGN.md` — `posts` RLS 섹션에서 삭제된 두 정책 반영, 배포 현황에 새 마이그레이션 항목 추가, 설계 노트에 "글 제출은 이제 `submit-post` Edge Function 전용" 설명 추가
- `SUPABASE_GUIDE.md` — 지금은 읽기 패턴만 있고 쓰기(글 작성) 패턴이 아예 없음. `submit-post` 호출 방법(요청/응답 계약, 5가지 결과 분기 처리법) 새 섹션으로 추가
- `TODO.md` — "AI 보조 기능 서버 아키텍처" 항목(#4)에 "일단 Edge Function으로 확정, 더미 스텁으로 프론트 연동 가능한 상태" 업데이트. #2/#3(유사도 비교 범위, 벡터 컬럼 여부)은 여전히 미결이므로 `checkSimilarity`가 더미라는 점과 함께 그대로 열어둠

## 짚어둘 잠재 이슈 (구현 시 반영)

- `status`/`resolved_at`은 클라이언트 입력을 안 믿고 서버가 `parent_id` 기준으로 직접 계산
- `created_mode === 'lecturer'`인데 `parent_id === null`이거나 `type !== 'opinion'`이면 DB CHECK 위반 에러가 나기 전에 미리 걸러서 친절한 메시지 반환
- `force: true` + `use_ai_correction: true` 조합 시: 유사도 검사는 건너뛰지만 교정은 여전히 저장 없이 반환만 함(설계상 자연스러운 조합, 별도 특별 처리 불필요)
- 모든 조기 반환(400/401/403 등)에도 `corsHeaders`를 빠짐없이 포함(공통 `jsonResponse` 헬퍼로 통일)
- 로컬 `supabase functions serve` 테스트 시 env는 로컬 스택 기준으로 자동 채워짐 — 원격 키를 수동으로 넣지 말 것

## 검증

1. `npx supabase db push`로 새 마이그레이션 적용 후, `posts`에 anon/authenticated 키로 직접 insert 시도 → 거부되는지 확인(`db query --linked`로 검증 가능)
2. `npx supabase functions deploy submit-post` (기존 3개 함수는 `supabase functions delete`로 정리)
3. curl 또는 스크립트로 5가지 분기(정상 생성/적절성 거부/유사 질문 발견/교정 반환/강행 제출) 각각 호출해 응답 확인
4. 회원(JWT)/비회원(`x-guest-token`) 양쪽 경로 모두 테스트
5. `DB_DESIGN.md`/`SUPABASE_GUIDE.md`/`TODO.md` 갱신 후 dev→backend 워크플로우로 반영
