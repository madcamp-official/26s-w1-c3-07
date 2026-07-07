import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// 유사 질문 탐지. 지금은 항상 "유사한 글 없음"인 더미 — 나중에 실제 LLM/임베딩 비교로
// candidateIds를 채우면 이후 정렬·선택 로직은 그대로 재사용된다.
// 후보가 여럿이면 좋아요 개수 내림차순 → 동률이면 제출 시각(created_at) 오름차순으로
// 정렬해서 1등만 반환한다.
export async function findMostSimilarPostId(
  admin: SupabaseClient,
  lectureId: string,
  content: string,
): Promise<string | null> {
  // TODO: 실제 유사도 판단(LLM 프롬프트 또는 임베딩 비교, TODO.md #1/#2 결정 대기).
  // 지금은 이 강의의 미해결 질문들과 비교했다고 가정한 후보 id 목록이 없다고 취급.
  const candidateIds: string[] = [];

  if (candidateIds.length === 0) {
    return null;
  }

  const { data: candidates, error } = await admin
    .from("posts")
    .select("id, created_at, post_likes_counts(like_count)")
    .in("id", candidateIds);

  if (error || !candidates || candidates.length === 0) {
    return null;
  }

  const ranked = candidates
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

  return ranked[0].id;
}
