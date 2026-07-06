import { useCallback, useEffect, useState } from 'react'
import { createQuestion, createReply, getCourseRoom, resetFeedbackOption, resolveQuestion, toggleFeedback, toggleQuestionLike } from '../services/api'
import type { ComposerSubmission, CourseRoom, FeedbackKey } from '../types/room'

interface CourseRoomState {
  room: CourseRoom | null
  isLoading: boolean
  error: string | null
}

export function useCourseRoom(courseId: string | undefined) {
  const [state, setState] = useState<CourseRoomState>({ room: null, isLoading: true, error: null })

  const load = useCallback(async () => {
    if (!courseId) return
    setState((current) => ({ ...current, isLoading: true, error: null }))

    try {
      const room = await getCourseRoom(courseId)
      setState({ room, isLoading: false, error: null })
    } catch (error) {
      setState({
        room: null,
        isLoading: false,
        error: error instanceof Error ? error.message : '강의실을 불러오지 못했습니다.',
      })
    }
  }, [courseId])

  useEffect(() => {
    void load()
  }, [load])

  const submitQuestion = async (submission: ComposerSubmission): Promise<void> => {
    if (!courseId) return
    const question = await createQuestion(courseId, submission)
    setState((current) => (current.room ? { ...current, room: { ...current.room, questions: [question, ...current.room.questions] } } : current))
  }

  const submitReply = async (questionId: string, submission: ComposerSubmission): Promise<void> => {
    if (!courseId) return
    const reply = await createReply(courseId, questionId, submission)
    setState((current) => {
      if (!current.room) return current
      const questions = current.room.questions.map((question) =>
        question.id === questionId ? { ...question, replies: [...question.replies, reply] } : question,
      )
      return { ...current, room: { ...current.room, questions } }
    })
  }

  const likeQuestion = async (questionId: string): Promise<void> => {
    if (!courseId) return
    const updated = await toggleQuestionLike(courseId, questionId)
    setState((current) => {
      if (!current.room) return current
      const questions = current.room.questions.map((question) => (question.id === questionId ? updated : question))
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
    const updated = await resetFeedbackOption(courseId, key)
    setState((current) => (current.room ? { ...current, room: updated } : current))
  }

  const resolveQuestionById = async (questionId: string): Promise<void> => {
    if (!courseId) return
    const updated = await resolveQuestion(courseId, questionId)
    setState((current) => {
      if (!current.room) return current
      const questions = current.room.questions.map((question) => (question.id === questionId ? updated : question))
      return { ...current, room: { ...current.room, questions } }
    })
  }

  return {
    ...state,
    reload: load,
    submitQuestion,
    submitReply,
    likeQuestion,
    voteFeedback,
    resetFeedback,
    resolveQuestion: resolveQuestionById,
  }
}
