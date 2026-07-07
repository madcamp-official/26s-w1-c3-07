export type FeedbackKey = 'cold' | 'hot' | 'quiet' | 'dark'
export type PostType = 'question' | 'opinion'

export interface FeedbackOption {
  key: FeedbackKey
  label: string
  likeCount: number
  dislikeCount: number
  myVote: 'like' | 'dislike' | null
}

export interface QuestionReply {
  id: string
  authorName: string
  authorRole: 'lecturer' | 'anonymous' | 'student'
  postType: PostType
  isEditable: boolean
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
  createdAt: string
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
