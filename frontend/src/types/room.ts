export type FeedbackKey = 'cold' | 'hot' | 'quiet' | 'unclear'
export type PostType = 'question' | 'opinion'

export interface FeedbackOption {
  key: FeedbackKey
  label: string
  likeCount: number
  dislikeCount: number
  myLiked: boolean
  myDisliked: boolean
}

export interface QuestionReply {
  id: string
  authorName: string
  authorRole: 'lecturer' | 'anonymous' | 'student'
  postType: PostType
  isEditable: boolean
  canDelete: boolean
  createdAt: string
  content: string
  likeCount: number
  isLikedByMe: boolean
  depth: number
}

export interface Question {
  id: string
  authorName: string
  authorRole: 'lecturer' | 'anonymous' | 'student'
  postType: PostType
  isEditable: boolean
  canDelete: boolean
  createdAt: string
  /** 정렬 전용 원본 타임스탬프(ISO). createdAt은 "3분 전" 같은 표시용 상대시간이라 정렬엔 못 씀. */
  createdAtRaw: string
  content: string
  likeCount: number
  isLikedByMe: boolean
  isResolved: boolean
  replies: QuestionReply[]
}

export interface CourseRoom {
  id: string
  title: string
  date: string
  lecturerName: string
  participantCount: number
  capacity: number | null
  feedbackOptions: FeedbackOption[]
  questions: Question[]
}

export type QuestionFilter = 'unresolved' | 'resolved'

export interface ComposerTarget {
  questionId: string
  label: string
}

export interface ComposerSubmission {
  content: string
  postType: PostType
  isAnonymous: boolean
}

export type SubmitPostResult =
  | { result: 'created'; post: Question | QuestionReply }
  | { result: 'similar_found'; draftId: string; similarId: string }
  | { result: 'rejected'; reason: string }

export interface UnansweredQuestion extends Question {
  courseId: string
  courseTitle: string
}

export interface UnansweredFolderNode {
  id: string
  name: string
  count: number
  children: UnansweredFolderNode[]
  courses: Array<{ id: string; title: string; questions: UnansweredQuestion[] }>
}
