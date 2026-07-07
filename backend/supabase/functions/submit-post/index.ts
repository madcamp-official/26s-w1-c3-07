import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { HttpError, resolveIdentity } from "./identity.ts";
import { moderateContent } from "./moderate.ts";
import { findMostSimilarPostId } from "./similarity.ts";
import { consumeDraft, createDraft } from "./drafts.ts";
import type { NewPostFields } from "./drafts.ts";

type RequestBody =
  | { draft_id: string }
  | (NewPostFields & { author_id?: string | null });

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isDraftConsume(body: RequestBody): body is { draft_id: string } {
  return typeof (body as { draft_id?: unknown }).draft_id === "string";
}

async function insertPost(
  admin: ReturnType<typeof createClient>,
  fields: NewPostFields,
  authorId: string | null,
  guestToken: string | null,
) {
  const { data: post, error } = await admin
    .from("posts")
    .insert({
      lecture_id: fields.lecture_id,
      parent_id: fields.parent_id,
      author_id: authorId,
      guest_token: guestToken,
      is_anonymous: fields.is_anonymous,
      type: fields.type,
      content: fields.content,
      created_mode: fields.created_mode,
      status: fields.parent_id === null ? "unresolved" : null,
      // created_at은 일부러 안 넣음 -> default now()가 "지금"으로 채움
      // (draft를 거쳐온 경우에도 스테이징 시각이 아니라 실제 제출 시각이 되도록)
    })
    .select("id, lecture_id, parent_id, is_anonymous, type, status, resolved_at, content, created_at, created_mode")
    .single();

  if (error || !post) {
    throw new HttpError(400, error?.message ?? "게시글 저장에 실패했습니다");
  }
  return post;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ result: "invalid", reason: "POST만 허용됩니다" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body: RequestBody = await req.json();
    const identity = await resolveIdentity(req);
    const authorId = identity.kind === "member" ? identity.userId : null;
    const guestToken = identity.kind === "guest" ? identity.guestToken : null;

    // ---- 경로 1: 강행 제출 (draft_id로 스테이징된 글을 그대로 제출) ----
    if (isDraftConsume(body)) {
      const fields = await consumeDraft(admin, body.draft_id, identity);
      const post = await insertPost(admin, fields, authorId, guestToken);
      return jsonResponse({ result: "created", post }, 201);
    }

    // ---- 경로 2: 신규 제출 ----
    const fields = body;

    if (!fields.lecture_id || !fields.type || !fields.content || !fields.created_mode) {
      return jsonResponse(
        { result: "invalid", reason: "lecture_id/type/content/created_mode는 필수입니다" },
        400,
      );
    }
    if (!["question", "opinion"].includes(fields.type)) {
      return jsonResponse({ result: "invalid", reason: "type은 question 또는 opinion이어야 합니다" }, 400);
    }
    if (!["lecturer", "student"].includes(fields.created_mode)) {
      return jsonResponse({ result: "invalid", reason: "created_mode 값이 올바르지 않습니다" }, 400);
    }

    if (fields.author_id && fields.author_id !== authorId) {
      return jsonResponse({ result: "invalid", reason: "author_id가 인증된 사용자와 일치하지 않습니다" }, 403);
    }
    if (!authorId && !fields.is_anonymous) {
      return jsonResponse({ result: "invalid", reason: "비회원은 반드시 익명으로 작성해야 합니다" }, 400);
    }

    if (fields.created_mode === "lecturer") {
      if (fields.parent_id === null || fields.type !== "opinion") {
        return jsonResponse(
          { result: "invalid", reason: "강의자 모드 글은 답글이면서 의견(opinion) 타입만 가능합니다" },
          400,
        );
      }
      const { data: ownedLecture } = await admin
        .from("lectures")
        .select("id, nodes!inner(created_by)")
        .eq("id", fields.lecture_id)
        .eq("nodes.created_by", authorId ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle();

      if (!ownedLecture) {
        return jsonResponse(
          { result: "invalid", reason: "강의자 모드로 작성하려면 해당 강의의 제작자여야 합니다" },
          403,
        );
      }
    }

    const moderation = await moderateContent(fields.content);
    if (!moderation.allowed) {
      return jsonResponse({ result: "rejected", reason: moderation.reason }, 422);
    }

    if (fields.type === "question") {
      const similarId = await findMostSimilarPostId(admin, fields.lecture_id, fields.content);
      if (similarId) {
        const draftId = await createDraft(admin, fields, authorId, guestToken);
        return jsonResponse({ result: "similar_found", draft_id: draftId, similar_id: similarId }, 409);
      }
    }

    const post = await insertPost(admin, fields, authorId, guestToken);
    return jsonResponse({ result: "created", post }, 201);
  } catch (e) {
    if (e instanceof HttpError) {
      return jsonResponse({ result: "invalid", reason: e.message }, e.status);
    }
    return jsonResponse({ result: "invalid", reason: "알 수 없는 오류가 발생했습니다" }, 500);
  }
});
