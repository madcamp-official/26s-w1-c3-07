// AI 교정: 적절성 검사나 유사도 검사는 전혀 하지 않고, 글 초안을 다듬어 제안만 함.
// 실제 제출은 별도로 submit-post를 호출해야 함.
// 요청: { content: string }
// 응답: { corrected: string }
import { corsHeaders } from "../_shared/cors.ts";

// 실제 OpenAI 연동 전까지의 더미 구현. 나중엔 이 함수 본문만 실제 LLM 호출로 바꾸면 됨.
async function correctWithAI(content: string): Promise<string> {
  return `${content}\n\n[AI로 수정함]`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { content } = await req.json();
  const corrected = await correctWithAI(content);

  return new Response(
    JSON.stringify({ corrected }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
