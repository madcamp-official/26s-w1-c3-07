import { createClient } from "npm:@supabase/supabase-js@2";

export type Identity =
  | { kind: "member"; userId: string }
  | { kind: "guest"; guestToken: string | null };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Authorization 헤더의 JWT를 anon 키 클라이언트로 검증해서 회원 여부/uid를 얻음.
// 비회원도 supabase-js가 Authorization 헤더에 anon/publishable 키를 그대로 실어 보내는데,
// 이건 실제 사용자 JWT가 아니라서 검증에 실패한다 — 이 경우 에러 내지 않고 그냥
// 비회원(guest)으로 취급한다(로그인 세션이 없거나 만료된 경우도 동일하게 처리).
export async function resolveIdentity(req: Request): Promise<Identity> {
  const authHeader = req.headers.get("Authorization");
  const guestToken = req.headers.get("x-guest-token");

  if (authHeader) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data, error } = await authClient.auth.getUser();
    if (!error && data.user) {
      return { kind: "member", userId: data.user.id };
    }
  }

  return { kind: "guest", guestToken: guestToken ?? null };
}
