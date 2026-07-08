import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  createQuestion,
  createReply,
  deletePost,
  formatRelativeTime,
  getCourseRoom,
  isPrivilegedEditor,
  postAuthorRole,
  resetFeedbackOption,
  resolvePostAuthorName,
  resolveQuestion,
  subscribeToRoomChannel,
  submitDraft,
  toggleCourseRegistration,
  toggleFeedback,
  toggleQuestionLike,
  updateQuestion,
  updateReply,
} from '../services/api'
import type { PostChangePayload } from '../services/api'
import type { ComposerSubmission, CourseRoom, FeedbackKey, Question, QuestionReply, SubmitPostResult } from '../types/room'

interface CourseRoomState {
  room: CourseRoom | null
  isLoading: boolean
  error: string | null
  actionError: string | null
}

function findOwnerQuestion(questions: Question[], postId: string): Question | undefined {
  return questions.find((question) => question.id === postId || question.replies.some((reply) => reply.id === postId))
}

/**
 * 미해결 게시글은 좋아요 개수 내림차순(동률이면 제출 시각 최신순)으로 정렬돼야 하므로,
 * 좋아요가 바뀌거나 새 글이 도착할 때마다 순위를 즉시 다시 매김. 동률 tie-break를
 * createdAtRaw로 직접 비교해서, 안정 정렬의 "현재 배열상 위치"에 의존하지 않게 함
 * (좋아요를 눌렀다 취소했을 때도 항상 원래 제출 시각 순서로 정확히 복귀).
 * 해결된 게시글은 좋아요와 무관한 기준(해결 시각)으로 정렬되므로 순서를 건드리지 않음.
 */
function reorderQuestions(questions: Question[]): Question[] {
  const unresolved = questions
    .filter((question) => !question.isResolved)
    .sort((a, b) => b.likeCount - a.likeCount || b.createdAtRaw.localeCompare(a.createdAtRaw))
  const resolved = questions
    .filter((question) => question.isResolved)
    .sort((a, b) => (b.resolvedAtRaw ?? '').localeCompare(a.resolvedAtRaw ?? ''))
  return [...unresolved, ...resolved]
}

/**
 * post_change 브로드캐스트를 로컬 state에 반영합니다. author_id/guest_token이 페이로드에
 * 없어 "내 글인지"를 알 수 없으므로, 이미 로컬에 있는 항목(내가 방금 쓴 글의 echo 포함)은
 * identity 기반 필드(authorName/authorRole/isEditable/canDelete)를 건드리지 않고 공개
 * 필드만 갱신하고, 로컬에 없던(=남이 쓴) 새 글은 isEditable: false, canDelete는 강의자
 * 권한만 반영합니다.
 */
function mergePostChange(setState: Dispatch<SetStateAction<CourseRoomState>>, payload: PostChangePayload) {
  setState((current) => {
    if (!current.room) return current
    const { questions } = current.room

    if (payload.op === 'DELETE') {
      const nextQuestions = questions
        .filter((question) => question.id !== payload.id)
        .map((question) => ({ ...question, replies: question.replies.filter((reply) => reply.id !== payload.id) }))
      return { ...current, room: { ...current.room, questions: nextQuestions } }
    }

    const isResolved = payload.status === 'resolved'

    const existingQuestion = questions.find((question) => question.id === payload.id)
    if (existingQuestion) {
      const nextQuestions = reorderQuestions(questions.map((question) =>
        question.id === payload.id
          ? { ...question, content: payload.content ?? question.content, isResolved, resolvedAtRaw: payload.resolved_at ?? null }
          : question,
      ))
      return { ...current, room: { ...current.room, questions: nextQuestions } }
    }

    const existingReplyOwner = questions.find((question) => question.replies.some((reply) => reply.id === payload.id))
    if (existingReplyOwner) {
      const nextQuestions = questions.map((question) =>
        question.id === existingReplyOwner.id
          ? { ...question, replies: question.replies.map((reply) => (reply.id === payload.id ? { ...reply, content: payload.content ?? reply.content } : reply)) }
          : question,
      )
      return { ...current, room: { ...current.room, questions: nextQuestions } }
    }

    // 로컬에 없던 새 글/답글 -> 남이 쓴 것으로 간주.
    const authorName = resolvePostAuthorName({ is_anonymous: payload.is_anonymous ?? false, author_display_name: payload.author_display_name ?? null })
    const authorRole = postAuthorRole({ is_anonymous: payload.is_anonymous ?? false, created_mode: payload.created_mode ?? 'student' })
    const createdAtRaw = payload.created_at ?? new Date().toISOString()
    const createdAt = formatRelativeTime(createdAtRaw)
    const canDelete = isPrivilegedEditor()

    if (payload.parent_id === null) {
      const question: Question = {
        id: payload.id,
        authorName,
        authorRole,
        postType: payload.type ?? 'question',
        isEditable: false,
        canDelete,
        createdAt,
        createdAtRaw,
        resolvedAtRaw: payload.resolved_at ?? null,
        content: payload.content ?? '',
        likeCount: 0,
        isLikedByMe: false,
        isResolved,
        replies: [],
      }
      return { ...current, room: { ...current.room, questions: reorderQuestions([question, ...questions]) } }
    }

    const ownerQuestion = findOwnerQuestion(questions, payload.parent_id)
    if (!ownerQuestion) return current // 부모 글을 아직 못 찾으면(이벤트 순서 문제 등) 무시 - 새로고침하면 정상 반영됨

    const parentDepth = ownerQuestion.id === payload.parent_id
      ? -1
      : (ownerQuestion.replies.find((reply) => reply.id === payload.parent_id)?.depth ?? -1)

    const reply: QuestionReply = {
      id: payload.id,
      authorName,
      authorRole,
      postType: payload.type ?? 'opinion',
      isEditable: false,
      canDelete,
      createdAt,
      content: payload.content ?? '',
      likeCount: 0,
      isLikedByMe: false,
      depth: parentDepth + 1,
    }
    const nextQuestions = questions.map((question) =>
      question.id === ownerQuestion.id ? { ...question, replies: [...question.replies, reply] } : question,
    )
    return { ...current, room: { ...current.room, questions: nextQuestions } }
  })
}

export type AdmissionStatus = 'pending' | 'admitted' | 'full'

export function useCourseRoom(courseId: string | undefined) {
  const [state, setState] = useState<CourseRoomState>({ room: null, isLoading: true, error: null, actionError: null })
  const [participantCount, setParticipantCount] = useState(0)
  const [admissionStatus, setAdmissionStatus] = useState<AdmissionStatus>('pending')

  const load = useCallback(async () => {
    if (!courseId) return
    setState((current) => ({ ...current, isLoading: true, error: null }))

    try {
      const room = await getCourseRoom(courseId)
      setState({ room, isLoading: false, error: null, actionError: null })
    } catch (error) {
      setState({
        room: null,
        isLoading: false,
        error: error instanceof Error ? error.message : '강의실을 불러오지 못했습니다.',
        actionError: null,
      })
    }
  }, [courseId])

  useEffect(() => {
    void load()
  }, [load])

  // 강의 정보가 로드된 뒤에 실시간 채널을 엽니다. capacity를 알아야 presence track 여부를
  // 정할 수 있고, 로드 전에 오는 브로드캐스트는 room이 null이라 어차피 버려지기 때문.
  const capacity = state.room?.capacity ?? null
  const roomLoaded = state.room !== null

  // 강의실 실시간 갱신(질문/답글/좋아요/피드백/강의 제목·일정)과 접속자 수(Presence)를
  // 단일 채널로 구독. 같은 토픽으로 채널을 두 개 열면 먼저 열린 쪽이 서버에서 닫히므로
  // 반드시 하나의 채널을 공유해야 함(subscribeToRoomChannel 주석 참고).
  useEffect(() => {
    if (!courseId || !roomLoaded) return

    setAdmissionStatus('pending')
    // Presence 동기화가 안 와서 입장 가능 여부가 영영 안 정해지는 경우(네트워크 문제 등)를
    // 대비해, 일정 시간 안에 결정 안 나면 안전하게 입장 허용 쪽으로 열어둠(fail-open).
    const admissionFallbackTimer = window.setTimeout(() => {
      setAdmissionStatus((current) => (current === 'pending' ? 'admitted' : current))
    }, 5000)

    const unsubscribe = subscribeToRoomChannel(courseId, capacity, {
      onParticipantCount: setParticipantCount,
      onAdmissionDecided: (admitted) => {
        window.clearTimeout(admissionFallbackTimer)
        setAdmissionStatus(admitted ? 'admitted' : 'full')
      },
      onPostChange: (payload) => mergePostChange(setState, payload),
      onLikeChange: (payload) => {
        setState((current) => {
          if (!current.room) return current
          const questions = reorderQuestions(current.room.questions.map((question) => ({
            ...question,
            likeCount: question.id === payload.post_id ? payload.like_count : question.likeCount,
            replies: question.replies.map((reply) =>
              reply.id === payload.post_id ? { ...reply, likeCount: payload.like_count } : reply,
            ),
          })))
          return { ...current, room: { ...current.room, questions } }
        })
      },
      onFeedbackChange: (payload) => {
        setState((current) => {
          if (!current.room) return current
          // 좋아요/싫어요가 둘 다 0이면 해당 항목에 남은 투표 행이 하나도 없다는 뜻이므로
          // (강의자가 초기화했든 마지막 투표가 취소됐든) 내 투표 표시(초록/빨강)도 같이
          // 지워야 함 - 안 그러면 다른 사람이 초기화했을 때 새로고침 전까지 색이 안 없어짐.
          const isCleared = payload.like_count === 0 && payload.dislike_count === 0
          const feedbackOptions = current.room.feedbackOptions.map((option) =>
            option.key === payload.feedback_type
              ? {
                  ...option,
                  likeCount: payload.like_count,
                  dislikeCount: payload.dislike_count,
                  myLiked: isCleared ? false : option.myLiked,
                  myDisliked: isCleared ? false : option.myDisliked,
                }
              : option,
          )
          return { ...current, room: { ...current.room, feedbackOptions } }
        })
      },
      onLectureUpdated: (payload) => {
        setState((current) => (current.room ? { ...current, room: { ...current.room, title: payload.name } } : current))
      },
      // 일정/장소는 CourseRoom에 포맷된 date 문자열로만 노출돼 있어(원본 필드 없음) 직접
      // 패치하지 않고 재조회함. 자주 바뀌는 값이 아니라 비용 부담은 적음.
      onLectureDetailsUpdated: () => {
        void load()
      },
    })

    return () => {
      window.clearTimeout(admissionFallbackTimer)
      unsubscribe()
    }
  }, [courseId, load, roomLoaded, capacity])

  const addQuestionToState = (question: Question) => {
    setState((current) => (current.room ? { ...current, room: { ...current.room, questions: [question, ...current.room.questions] } } : current))
  }

  const addReplyToState = (questionId: string, reply: QuestionReply) => {
    setState((current) => {
      if (!current.room) return current
      const questions = current.room.questions.map((question) =>
        question.id === questionId ? { ...question, replies: [...question.replies, reply] } : question,
      )
      return { ...current, room: { ...current.room, questions } }
    })
  }

  const submitQuestion = async (submission: ComposerSubmission): Promise<SubmitPostResult> => {
    if (!courseId) return { result: 'rejected', reason: '강의실을 찾을 수 없습니다.' }
    const outcome = await createQuestion(courseId, submission)
    if (outcome.result === 'created') addQuestionToState(outcome.post as Question)
    return outcome
  }

  const submitReply = async (questionId: string, submission: ComposerSubmission): Promise<SubmitPostResult> => {
    if (!courseId) return { result: 'rejected', reason: '강의실을 찾을 수 없습니다.' }
    const outcome = await createReply(courseId, questionId, submission)
    if (outcome.result === 'created') addReplyToState(questionId, outcome.post as QuestionReply)
    return outcome
  }

  const submitDraftPost = async (draftId: string, submission: ComposerSubmission, questionId: string | null): Promise<void> => {
    const post = await submitDraft(draftId, submission, questionId !== null)
    if (questionId) addReplyToState(questionId, post as QuestionReply)
    else addQuestionToState(post as Question)
  }

  const deletePostById = async (postId: string): Promise<void> => {
    if (!courseId) return
    await deletePost(courseId, postId)
    setState((current) => {
      if (!current.room) return current
      const questions = current.room.questions
        .filter((question) => question.id !== postId)
        .map((question) => ({ ...question, replies: question.replies.filter((reply) => reply.id !== postId) }))
      return { ...current, room: { ...current.room, questions } }
    })
  }

  const editQuestion = async (questionId: string, content: string): Promise<void> => {
    if (!courseId) return
    const updated = await updateQuestion(courseId, questionId, content)
    setState((current) => {
      if (!current.room) return current
      const questions = current.room.questions.map((question) =>
        question.id === questionId ? { ...question, content: updated.content, isEditable: updated.isEditable } : question,
      )
      return { ...current, room: { ...current.room, questions } }
    })
  }

  const editReply = async (questionId: string, replyId: string, content: string): Promise<void> => {
    if (!courseId) return
    const updated = await updateReply(courseId, questionId, replyId, content)
    setState((current) => {
      if (!current.room) return current
      const questions = current.room.questions.map((question) =>
        question.id === questionId
          ? { ...question, replies: question.replies.map((reply) => (reply.id === replyId ? updated : reply)) }
          : question,
      )
      return { ...current, room: { ...current.room, questions } }
    })
  }

  const likeQuestion = async (postId: string): Promise<void> => {
    if (!courseId) return
    const { likeCount, isLikedByMe } = await toggleQuestionLike(courseId, postId)
    setState((current) => {
      if (!current.room) return current
      const questions = reorderQuestions(current.room.questions.map((question) => {
        if (question.id === postId) return { ...question, likeCount, isLikedByMe }
        if (!question.replies.some((reply) => reply.id === postId)) return question
        return {
          ...question,
          replies: question.replies.map((reply) => (reply.id === postId ? { ...reply, likeCount, isLikedByMe } : reply)),
        }
      }))
      return { ...current, room: { ...current.room, questions } }
    })
  }

  const voteFeedback = async (key: FeedbackKey, vote: 'like' | 'dislike'): Promise<void> => {
    if (!courseId) return
    const updated = await toggleFeedback(courseId, key, vote)
    setState((current) => (current.room ? { ...current, room: updated } : current))
  }

  const resetFeedback = async (key: FeedbackKey): Promise<void> => {
    if (!courseId) return
    try {
      const updated = await resetFeedbackOption(courseId, key)
      setState((current) => (current.room ? { ...current, room: updated, actionError: null } : current))
    } catch (error) {
      setState((current) => ({ ...current, actionError: error instanceof Error ? error.message : '피드백 초기화에 실패했습니다.' }))
    }
  }

  const resolveQuestionById = async (questionId: string): Promise<void> => {
    if (!courseId) return
    const { isResolved, resolvedAtRaw } = await resolveQuestion(courseId, questionId)
    setState((current) => {
      if (!current.room) return current
      const questions = reorderQuestions(current.room.questions.map((question) => (question.id === questionId ? { ...question, isResolved, resolvedAtRaw } : question)))
      return { ...current, room: { ...current.room, questions } }
    })
  }

  const toggleRegistration = async (): Promise<void> => {
    if (!courseId) return
    const { isFavorited } = await toggleCourseRegistration(courseId)
    setState((current) => (current.room ? { ...current, room: { ...current.room, isFavorited } } : current))
  }

  return {
    ...state,
    participantCount,
    admissionStatus,
    reload: load,
    submitQuestion,
    submitReply,
    submitDraftPost,
    editQuestion,
    editReply,
    deletePost: deletePostById,
    likeQuestion,
    voteFeedback,
    resetFeedback,
    resolveQuestion: resolveQuestionById,
    toggleRegistration,
  }
}
