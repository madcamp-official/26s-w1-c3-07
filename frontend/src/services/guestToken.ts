const GUEST_TOKEN_KEY = 'qroom_guest_token'

/** 비회원 식별용 토큰을 localStorage에서 가져오거나, 없으면 새로 만들어 저장합니다. */
export function getGuestToken(): string {
  const existing = window.localStorage.getItem(GUEST_TOKEN_KEY)
  if (existing) return existing

  const token = crypto.randomUUID()
  window.localStorage.setItem(GUEST_TOKEN_KEY, token)
  return token
}
