// 적절성 검사. 지금은 항상 통과하는 더미 — 나중에 실제 LLM 호출로 이 함수 본문만
// 바꾸면 되고, 호출부(index.ts)는 이미 "거부되면 rejected로 응답"하는 분기를 갖추고 있음.
export async function moderateContent(
  content: string,
): Promise<{ allowed: boolean; reason: string | null }> {
  return { allowed: true, reason: null };
}
