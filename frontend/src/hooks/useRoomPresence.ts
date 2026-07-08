import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { getGuestToken } from '../services/guestToken'

/**
 * 강의실의 실시간 접속자 수를 Realtime Presence(`lecture:<courseId>` 채널)로 집계합니다.
 *
 * `capacity`(`lectures.max_participants`)는 강의실 입장 자체를 막는 값이 아닙니다 -
 * Presence는 웹소켓 채널 상태일 뿐이라 "이 채널에 등록 안 하고 그냥 페이지 정보만
 * 요청하는" 접근을 DB/서버 차원에서 막을 방법이 없고(막을 필요도 없음), 그러니 입장
 * 자체를 강제하는 건 애초에 의미가 없습니다. 대신 "실시간 집계에 반영되는(=track되는)
 * 인원의 최대치"로 정의합니다 - 구독 시점 인원이 이미 정원이면 이 사람은 그냥
 * track()하지 않고 관전만 합니다(페이지 이용 자체는 평소와 동일, 접속자 수 카운트에만
 * 안 잡힘). 그래서 표시되는 참여자 수는 항상 `capacity`를 넘지 않습니다.
 */
export function useRoomPresence(courseId: string | undefined, capacity: number | null): number {
  const [participantCount, setParticipantCount] = useState(0)

  useEffect(() => {
    if (!courseId) return

    let cancelled = false
    let hasDecided = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function join() {
      const { data: sessionData } = await supabase.auth.getSession()
      if (cancelled) return
      const presenceKey = sessionData.session?.user.id ?? getGuestToken()

      channel = supabase.channel(`lecture:${courseId}`, {
        config: { presence: { key: presenceKey } },
      })

      channel.on('presence', { event: 'sync' }, () => {
        if (cancelled || !channel) return
        const state = channel.presenceState()
        const count = Object.keys(state).length
        setParticipantCount(count)

        if (!hasDecided) {
          hasDecided = true
          const isFull = capacity != null && count >= capacity
          if (!isFull) void channel.track({ joined_at: new Date().toISOString() })
        }
      })

      channel.subscribe()
    }

    void join()

    return () => {
      cancelled = true
      if (channel) {
        void channel.untrack()
        void supabase.removeChannel(channel)
      }
    }
  }, [courseId, capacity])

  return participantCount
}
