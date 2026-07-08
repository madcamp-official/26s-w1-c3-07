import { MODERATION_SYSTEM_PROMPT } from "./moderation-prompt.ts";

const OPENAI_MODEL = "gpt-4o-mini";

// 적절성 검사. GPT-4o-mini + 커스텀 프롬프트(moderation-prompt.ts)로 욕설/비속어/인신공격 등을
// 판단. OpenAI Moderation API(/v1/moderations)는 혐오/폭력/성적 콘텐츠 같은 안전 카테고리 위주라
// 특정 대상을 향하지 않는 일반 욕설·비속어(특히 한국어 변형 표기)를 잘 못 잡아서 chat completion
// 기반으로 전환함. 실패(키 누락, API 오류)해도 통과시켜 글쓰기 흐름 자체를 막지 않음.
// checked: AI 판단을 실제로 거쳤으면 true. false면 키 누락/API 오류/예외로 검사 자체를
// 건너뛰고 통과시킨 것 - "AI가 적절하다고 판단"과 "AI 연결이 실패해서 그냥 통과시킨 것"이
// allowed만 보면 구분이 안 되기 때문에 별도로 알려줌.
export async function moderateContent(
  content: string,
): Promise<{ allowed: boolean; reason: string | null; checked: boolean }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("OPENAI_API_KEY가 설정되어 있지 않습니다");
    return { allowed: true, reason: null, checked: false };
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
      return { allowed: true, reason: null, checked: false };
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    if (parsed.allowed === false) {
      return {
        allowed: false,
        reason: typeof parsed.reason === "string" ? parsed.reason : "부적절한 내용이 감지되었습니다",
        checked: true,
      };
    }
    return { allowed: true, reason: null, checked: true };
  } catch (e) {
    console.error("OpenAI 적절성 검사 호출 실패:", e);
    return { allowed: true, reason: null, checked: false };
  }
}
