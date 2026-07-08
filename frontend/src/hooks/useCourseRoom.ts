import { useCallback, useEffect, useState } from 'react'
import { createQuestion, createReply, deletePost, getCourseRoom, resetFeedbackOption, resolveQuestion, submitDraft, toggleFeedback, toggleQuestionLike, updateQuestion, updateReply } from '../services/api'
import type { ComposerSubmission, CourseRoom, FeedbackKey, Question, QuestionReply, SubmitPostResult } from '../types/room'

interface CourseRoomState {
  room: CourseRoom | null
  isLoading: boolean
  error: string | null
  actionError: string | null
}

export function useCourseRoom(courseId: string | undefined) {
  const [state, setState] = useState<CourseRoomState>({ room: null, isLoading: true, error: null, actionError: null })

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

  const likeQuestion = async (questionId: string): Promise<void> => {
    if (!courseId) return
    const { likeCount, isLikedByMe } = await toggleQuestionLike(courseId, questionId)
    setState((current) => {
      if (!current.room) return current
      const questions = current.room.questions.map((question) => (question.id === questionId ? { ...question, likeCount, isLikedByMe } : question))
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
    const { isResolved } = await resolveQuestion(courseId, questionId)
    setState((current) => {
      if (!current.room) return current
      const questions = current.room.questions.map((question) => (question.id === questionId ? { ...question, isResolved } : question))
      return { ...current, room: { ...current.room, questions } }
    })
  }

  return {
    ...state,
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
  }
}
