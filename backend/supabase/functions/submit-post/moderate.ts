import { MODERATION_SYSTEM_PROMPT } from "./moderation-prompt.ts";

const OPENAI_MODEL = "gpt-4o-mini";

// 적절성 검사. GPT-4o-mini + 커스텀 프롬프트(moderation-prompt.ts)로 욕설/비속어/인신공격 등을
// 판단. OpenAI Moderation API(/v1/moderations)는 혐오/폭력/성적 콘텐츠 같은 안전 카테고리 위주라
// 특정 대상을 향하지 않는 일반 욕설·비속어(특히 한국어 변형 표기)를 잘 못 잡아서 chat completion
// 기반으로 전환함. 실패(키 누락, API 오류)해도 통과시켜 글쓰기 흐름 자체를 막지 않음.
export async function moderateContent(
  content: string,
): Promise<{ allowed: boolean; reason: string | null }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("OPENAI_API_KEY가 설정되어 있지 않습니다");
    return { allowed: true, reason: null };
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
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          { role: "system", content: MODERATION_SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI API 오류: ${response.status} ${await response.text()}`);
      return { allowed: true, reason: null };
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    if (parsed.allowed === false) {
      return {
        allowed: false,
        reason: typeof parsed.reason === "string" ? parsed.reason : "부적절한 내용이 감지되었습니다",
      };
    }
    return { allowed: true, reason: null };
  } catch (e) {
    console.error("OpenAI 적절성 검사 호출 실패:", e);
    return { allowed: true, reason: null };
  }
}
