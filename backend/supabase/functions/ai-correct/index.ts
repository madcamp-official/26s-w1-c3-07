// AI 교정: 적절성 검사나 유사도 검사는 전혀 하지 않고, 글 초안을 다듬어 제안만 함.
// 실제 제출은 별도로 submit-post를 호출해야 함.
// 요청: { content: string }
// 응답: { corrected: string }
import { corsHeaders } from "../_shared/cors.ts";
import { CORRECTION_SYSTEM_PROMPT } from "./correction-prompt.ts";

const OPENAI_MODEL = "gpt-4o-mini";

async function correctWithAI(content: string): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("OPENAI_API_KEY가 설정되어 있지 않습니다");
    return content;
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
      return content; // 실패 시 원문 그대로 반환 (교정은 부가 기능이라 제출 흐름을 막지 않음)
    }

    const data = await response.json();
    const corrected = data.choices?.[0]?.message?.content?.trim();
    return corrected || content;
  } catch (e) {
    console.error("OpenAI 호출 실패:", e);
    return content;
  }
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
