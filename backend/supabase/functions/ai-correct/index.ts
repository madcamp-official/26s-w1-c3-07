// AI 교정: 적절성 검사나 유사도 검사는 전혀 하지 않고, 글 초안을 다듬어 제안만 함.
// 실제 제출은 별도로 submit-post를 호출해야 함.
// 요청: { content: string }
// 응답: { corrected: string, used_ai: boolean }
// used_ai: OpenAI를 실제로 호출해서 그 결과를 반환한 게 맞으면 true. false면 키 누락/API
// 오류/예외로 실패해 원문을 그대로 돌려준 것 - "AI가 고칠 게 없다고 판단"과 "AI 연결 자체가
// 실패해서 원문이 그대로 나온 것"이 corrected만 보면 구분이 안 되기 때문에 별도로 알려줌.
import { corsHeaders } from "../_shared/cors.ts";
import { CORRECTION_SYSTEM_PROMPT } from "./correction-prompt.ts";

const OPENAI_MODEL = "gpt-4o-mini";

async function correctWithAI(content: string): Promise<{ corrected: string; usedAi: boolean }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("OPENAI_API_KEY가 설정되어 있지 않습니다");
    return { corrected: content, usedAi: false };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: CORRECTION_SYSTEM_PROMPT },
          { role: "user", content },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI API 오류: ${response.status} ${await response.text()}`);
      return { corrected: content, usedAi: false }; // 실패 시 원문 그대로 반환 (교정은 부가 기능이라 제출 흐름을 막지 않음)
    }

    const data = await response.json();
    const corrected = data.choices?.[0]?.message?.content?.trim();
    return { corrected: corrected || content, usedAi: true };
  } catch (e) {
    console.error("OpenAI 호출 실패:", e);
    return { corrected: content, usedAi: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { content } = await req.json();
  const { corrected, usedAi } = await correctWithAI(content);

  return new Response(
    JSON.stringify({ corrected, used_ai: usedAi }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
