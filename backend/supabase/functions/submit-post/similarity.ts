import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SIMILARITY_SYSTEM_PROMPT } from "./similarity-prompt.ts";

type Candidate = { id: string; content: string };

// 비교 대상: 같은 강의의 미해결 게시글(타입 무관: 질문/의견) 전부 + 그 답글(get_similarity_candidates RPC).
async function fetchCandidates(admin: SupabaseClient, lectureId: string): Promise<{ candidates: Candidate[]; ok: boolean }> {
  const { data, error } = await admin.rpc("get_similarity_candidates", { p_lecture_id: lectureId });
  if (error || !data) {
    console.error("유사도 후보 조회 실패:", error);
    return { candidates: [], ok: false };
  }
  return { candidates: data as Candidate[], ok: true };
}

// AI에게 "새로 안 써도 될 정도로 겹치는 글"의 id들을 받음. 실패하면 안전하게 빈 배열
// (검사를 건너뛰고 통과시킴 — 적절성 검사와 달리 유사도는 부가 기능이라 실패로 제출을 막지 않음).
// checked: AI 판단을 실제로 거쳤으면(또는 비교할 후보가 아예 없어 판단이 필요 없었으면) true.
// false면 키 누락/API 오류/예외로 검사 자체를 건너뛴 것 - "AI가 비슷한 글이 없다고 판단"과
// "AI 연결이 실패해서 그냥 통과시킨 것"이 결과만 보면 구분이 안 되기 때문에 별도로 알려줌.
async function askAIForSimilarIds(newContent: string, candidates: Candidate[]): Promise<{ ids: string[]; checked: boolean }> {
  if (candidates.length === 0) return { ids: [], checked: true };

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("OPENAI_API_KEY가 설정되어 있지 않습니다");
    return { ids: [], checked: false };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: SIMILARITY_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ new_question: newContent, existing_posts: candidates }),
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI API 오류: ${response.status} ${await response.text()}`);
      return { ids: [], checked: false };
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const ids = parsed.similar_ids;
    return { ids: Array.isArray(ids) ? ids.filter((id: unknown) => typeof id === "string") : [], checked: true };
  } catch (e) {
    console.error("OpenAI 유사도 검사 호출 실패:", e);
    return { ids: [], checked: false };
  }
}

// 후보가 여럿이면 좋아요 개수 내림차순 → 동률이면 제출 시각(created_at) 오름차순으로
// 정렬해서 1등만 반환한다.
export async function findMostSimilarPostId(
  admin: SupabaseClient,
  lectureId: string,
  content: string,
): Promise<{ similarId: string | null; checked: boolean }> {
  const { candidates, ok: candidatesOk } = await fetchCandidates(admin, lectureId);
  if (!candidatesOk) {
    return { similarId: null, checked: false };
  }

  const { ids: similarIds, checked } = await askAIForSimilarIds(content, candidates);

  if (similarIds.length === 0) {
    return { similarId: null, checked };
  }

  const { data: ranked, error } = await admin
    .from("posts")
    .select("id, created_at, post_likes_counts(like_count)")
    .in("id", similarIds);

  if (error || !ranked || ranked.length === 0) {
    return { similarId: null, checked };
  }

  const sorted = ranked
    .map((post) => ({
      id: post.id as string,
      createdAt: post.created_at as string,
      likeCount: (post as { post_likes_counts?: { like_count: number }[] })
        .post_likes_counts?.[0]?.like_count ?? 0,
    }))
    .sort((a, b) => {
      if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  return { similarId: sorted[0].id, checked };
}
