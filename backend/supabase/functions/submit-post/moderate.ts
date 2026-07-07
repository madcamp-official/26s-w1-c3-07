// 적절성 검사. OpenAI Moderation API로 비속어/혐오/폭력 등 부적절한 내용을 걸러냄.
// 실패(키 누락, API 오류)해도 통과시켜 글쓰기 흐름 자체를 막지 않음.
export async function moderateContent(
  content: string,
): Promise<{ allowed: boolean; reason: string | null }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("OPENAI_API_KEY가 설정되어 있지 않습니다");
    return { allowed: true, reason: null };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input: content }),
    });

    if (!response.ok) {
      console.error(`OpenAI Moderation API 오류: ${response.status} ${await response.text()}`);
      return { allowed: true, reason: null };
    }

    const data = await response.json();
    const result = data.results?.[0];
    if (!result?.flagged) {
      return { allowed: true, reason: null };
    }

    const flaggedCategories = Object.entries(result.categories ?? {})
      .filter(([, flagged]) => flagged)
      .map(([category]) => category);

    return {
      allowed: false,
      reason: `부적절한 내용이 감지되었습니다${flaggedCategories.length ? ` (${flaggedCategories.join(", ")})` : ""}`,
    };
  } catch (e) {
    console.error("OpenAI Moderation 호출 실패:", e);
    return { allowed: true, reason: null };
  }
}
