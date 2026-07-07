import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./identity.ts";
import type { Identity } from "./identity.ts";

export type NewPostFields = {
  lecture_id: string;
  parent_id: string | null;
  type: "question" | "opinion";
  content: string;
  created_mode: "lecturer" | "student";
  is_anonymous: boolean;
};

// 유사 질문이 발견됐을 때 최종 제출본을 임시로 저장. "강행 제출"을 누르면 이 행을
// 그대로 posts에 옮기고, "보러 가기"/"취소"면 아무 것도 안 해도 됨(고아로 남아도 무해).
export async function createDraft(
  admin: SupabaseClient,
  fields: NewPostFields,
  authorId: string | null,
  guestToken: string | null,
): Promise<string> {
  const { data, error } = await admin
    .from("post_drafts")
    .insert({
      lecture_id: fields.lecture_id,
      parent_id: fields.parent_id,
      author_id: authorId,
      guest_token: guestToken,
      is_anonymous: fields.is_anonymous,
      type: fields.type,
      content: fields.content,
      created_mode: fields.created_mode,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new HttpError(500, "임시 저장에 실패했습니다");
  }
  return data.id as string;
}

// 강행 제출: draft를 조회해 요청자 identity가 draft를 만든 사람과 일치하는지 확인한 뒤
// (안 그러면 draft_id를 알아낸 다른 사람이 남의 글을 대신 제출시킬 수 있음) 반환.
// 적절성/유사도 검사는 이미 스테이징 시점에 통과했으므로 다시 하지 않는다.
export async function consumeDraft(
  admin: SupabaseClient,
  draftId: string,
  identity: Identity,
): Promise<NewPostFields> {
  const { data: draft, error } = await admin
    .from("post_drafts")
    .select("*")
    .eq("id", draftId)
    .maybeSingle();

  if (error || !draft) {
    throw new HttpError(404, "임시 저장된 글을 찾을 수 없습니다(만료되었거나 이미 제출됨)");
  }

  const isOwner = identity.kind === "member"
    ? draft.author_id === identity.userId
    : identity.kind === "guest" && draft.guest_token === identity.guestToken;

  if (!isOwner) {
    throw new HttpError(403, "본인이 작성한 임시 글만 제출할 수 있습니다");
  }

  await admin.from("post_drafts").delete().eq("id", draftId);

  return {
    lecture_id: draft.lecture_id,
    parent_id: draft.parent_id,
    type: draft.type,
    content: draft.content,
    created_mode: draft.created_mode,
    is_anonymous: draft.is_anonymous,
  };
}
