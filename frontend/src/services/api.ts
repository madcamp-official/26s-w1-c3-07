import { mockCourseFolders, mockCourseRooms, mockCurrentUser, mockStandaloneCourses } from '../mock/data'
import type { Course, CourseFolder, CreateCourseInput, CreateFolderInput, DeleteItemInput, MoveItemInput, RenameItemInput, UpdateCourseInput } from '../types/course'
import type { ComposerSubmission, CourseRoom, FeedbackKey, Question, QuestionReply, UnansweredFolderNode, UnansweredQuestion } from '../types/room'
import type { User, UserRole } from '../types/user'

const MOCK_DELAY = 250

const delay = (ms = MOCK_DELAY): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

const clone = <T,>(value: T): T => structuredClone(value)

/**
 * mock 데이터의 likeCount/dislikeCount는 모든 사용자의 합산 값이고,
 * "내가 누른 투표"는 사용자별로 별도 관리해야 다른 사용자(예: 강의자)에게
 * 내 투표 상태가 그대로 보이는 문제를 막을 수 있습니다.
 *
 * 데모 환경에는 계정이 하나뿐이고 "역할 전환"으로 수강생/강의자 화면을
 * 오가므로, 계정 id만으로는 두 역할을 구분할 수 없습니다. 따라서
 * `id:role`을 투표자 키로 사용해 역할별로 다른 사람처럼 취급합니다.
 */
const feedbackVotesByUser = new Map<string, Map<FeedbackKey, 'like' | 'dislike'>>()
const questionLikesByUser = new Map<string, Set<string>>()

function getViewerKey(): string {
  return `${mockCurrentUser.id}:${mockCurrentUser.role}`
}

function getFeedbackVotes(voterKey: string): Map<FeedbackKey, 'like' | 'dislike'> {
  let votes = feedbackVotesByUser.get(voterKey)
  if (!votes) {
    votes = new Map()
    feedbackVotesByUser.set(voterKey, votes)
  }
  return votes
}

function getQuestionLikes(voterKey: string): Set<string> {
  let likes = questionLikesByUser.get(voterKey)
  if (!likes) {
    likes = new Set()
    questionLikesByUser.set(voterKey, likes)
  }
  return likes
}

function applyViewerVotes(room: CourseRoom, voterKey: string): CourseRoom {
  const votes = getFeedbackVotes(voterKey)
  const likes = getQuestionLikes(voterKey)

  const applyToQuestion = (question: Question): Question => ({
    ...question,
    isLikedByMe: likes.has(question.id),
    replies: question.replies.map((reply) => ({ ...reply, isLikedByMe: likes.has(reply.id) })),
  })

  return {
    ...room,
    feedbackOptions: room.feedbackOptions.map((option) => ({ ...option, myVote: votes.get(option.key) ?? null })),
    questions: room.questions.map(applyToQuestion),
  }
}

/** Supabase 연동 시 함수 시그니처는 유지하고 내부 구현만 교체합니다. */
export async function getCurrentUser(): Promise<User> {
  await delay()
  return clone(mockCurrentUser)
}

export async function switchUserRole(role: UserRole): Promise<User> {
  await delay(150)
  mockCurrentUser.role = role
  return clone(mockCurrentUser)
}

export async function getCourseFolders(): Promise<CourseFolder[]> {
  await delay()
  return clone(mockCourseFolders)
}

export async function getStandaloneCourses(): Promise<Course[]> {
  await delay()
  return clone(mockStandaloneCourses)
}

export async function joinCourse(code: string): Promise<Course> {
  await delay(400)

  if (!/^\d{4}$/.test(code)) {
    throw new Error('4자리 강의 코드를 입력해 주세요.')
  }

  const demoRoom = mockCourseRooms['course-tree']
  return {
    id: 'course-tree',
    title: demoRoom.title,
    participantCount: demoRoom.participantCount,
    questionCount: demoRoom.questions.length,
    updatedAt: '방금 전',
    color: 'blue',
    ownership: 'registered',
  }
}

export async function createRootFolder(input: CreateFolderInput): Promise<CourseFolder> {
  await delay(350)
  return {
    id: `folder-${crypto.randomUUID()}`,
    name: input.name,
    ownership: 'owned',
    children: [],
    courses: [],
  }
}

function generateJoinCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export async function createCourse(input: CreateCourseInput): Promise<Course> {
  await delay(350)
  const course: Course = {
    id: `course-${crypto.randomUUID()}`,
    title: input.title,
    participantCount: 0,
    questionCount: 0,
    color: 'purple',
    ownership: 'owned',
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location,
    capacity: input.capacity ?? null,
    joinCode: generateJoinCode(),
  }

  if (input.folderId) {
    const folder = findFolder(mockCourseFolders, input.folderId)
    if (folder) folder.courses.push(course)
  } else {
    mockStandaloneCourses.push(course)
  }

  return course
}

/** 강의의 기본 정보를 수정합니다. 강의자는 본인의 모든 강의를, 수강생은 본인이 만든 강의만 수정할 수 있습니다. */
export async function updateCourse(input: UpdateCourseInput): Promise<Course> {
  await delay(350)
  const course = findCourse(mockCourseFolders, mockStandaloneCourses, input.id)
  if (!course) throw new Error('강의를 찾을 수 없습니다.')
  if (course.ownership !== 'owned' && !isPrivilegedEditor()) throw new Error('내가 만든 강의만 수정할 수 있습니다.')

  course.title = input.title
  course.date = input.date
  course.startTime = input.startTime
  course.endTime = input.endTime
  course.location = input.location
  course.capacity = input.capacity ?? null

  return clone(course)
}

function findFolder(folders: CourseFolder[], folderId: string): CourseFolder | null {
  for (const folder of folders) {
    if (folder.id === folderId) return folder
    const found = findFolder(folder.children, folderId)
    if (found) return found
  }
  return null
}

function detachFolder(folders: CourseFolder[], folderId: string): CourseFolder | null {
  const index = folders.findIndex((folder) => folder.id === folderId)
  if (index !== -1) return folders.splice(index, 1)[0]

  for (const folder of folders) {
    const detached = detachFolder(folder.children, folderId)
    if (detached) return detached
  }
  return null
}

function detachCourseFromFolders(folders: CourseFolder[], courseId: string): Course | null {
  for (const folder of folders) {
    const index = folder.courses.findIndex((course) => course.id === courseId)
    if (index !== -1) return folder.courses.splice(index, 1)[0]

    const detached = detachCourseFromFolders(folder.children, courseId)
    if (detached) return detached
  }
  return null
}

function detachCourse(folders: CourseFolder[], rootCourses: Course[], courseId: string): Course | null {
  const rootIndex = rootCourses.findIndex((course) => course.id === courseId)
  if (rootIndex !== -1) return rootCourses.splice(rootIndex, 1)[0]

  return detachCourseFromFolders(folders, courseId)
}

function isPrivilegedEditor(): boolean {
  return mockCurrentUser.role === 'instructor'
}

/**
 * 폴더/강의를 다른 폴더 또는 최상위로 이동합니다. (강의자 본인은 소유권 제한 없이 자유롭게 이동 가능)
 * 수강생 기준: 등록된(파란) 폴더 자체는 이동할 수 없고, 등록된 폴더 안으로는 아무것도 넣을 수 없습니다.
 * 단, 등록된(파란) 개별 강의는 위치 정리를 위해 내가 만든(보라) 폴더로 이동할 수 있습니다 (소유권은 유지되어 여전히 수정/삭제 불가).
 */
export async function moveCourseItem(input: MoveItemInput): Promise<void> {
  await delay(300)
  const canBypassOwnership = isPrivilegedEditor()

  if (input.targetFolderId !== null) {
    const target = findFolder(mockCourseFolders, input.targetFolderId)
    if (!target) throw new Error('대상 폴더를 찾을 수 없습니다.')
    if (target.ownership === 'registered' && !canBypassOwnership) throw new Error('강의자가 공유한 폴더 안으로는 이동할 수 없습니다.')
  }

  if (input.itemType === 'folder') {
    const folder = findFolder(mockCourseFolders, input.itemId)
    if (!folder) throw new Error('폴더를 찾을 수 없습니다.')
    if (folder.ownership === 'registered' && !canBypassOwnership) throw new Error('강의자가 공유한 폴더는 이동할 수 없습니다.')

    const detached = detachFolder(mockCourseFolders, input.itemId)
    if (!detached) return

    if (input.targetFolderId === null) {
      mockCourseFolders.push(detached)
    } else {
      const target = findFolder(mockCourseFolders, input.targetFolderId)
      if (!target) throw new Error('대상 폴더를 찾을 수 없습니다.')
      target.children.push(detached)
    }
    return
  }

  const allCourses = [...mockStandaloneCourses, ...flattenCourses(mockCourseFolders)]
  const course = allCourses.find((item) => item.id === input.itemId)
  if (!course) throw new Error('강의를 찾을 수 없습니다.')
  if (!canBypassOwnership && isInsideRegisteredFolder(mockCourseFolders, input.itemId)) {
    throw new Error('등록된 폴더 안의 강의는 폴더 단위로만 관리할 수 있습니다.')
  }

  const detached = detachCourse(mockCourseFolders, mockStandaloneCourses, input.itemId)
  if (!detached) return

  if (input.targetFolderId === null) {
    mockStandaloneCourses.push(detached)
  } else {
    const target = findFolder(mockCourseFolders, input.targetFolderId)
    if (!target) throw new Error('대상 폴더를 찾을 수 없습니다.')
    target.courses.push(detached)
  }
}

function flattenCourses(folders: CourseFolder[]): Course[] {
  return folders.flatMap((folder) => [...folder.courses, ...flattenCourses(folder.children)])
}

function findCourse(folders: CourseFolder[], rootCourses: Course[], courseId: string): Course | null {
  return [...rootCourses, ...flattenCourses(folders)].find((course) => course.id === courseId) ?? null
}

/** 강의가 등록된(공유받은) 폴더 안에 속해 있는지 확인합니다. 그런 강의는 폴더라는 하나의 덩어리에 묶여 있어 단독으로 다룰 수 없습니다. */
function isInsideRegisteredFolder(folders: CourseFolder[], courseId: string): boolean {
  for (const folder of folders) {
    if (folder.ownership === 'registered' && folder.courses.some((course) => course.id === courseId)) return true
    if (isInsideRegisteredFolder(folder.children, courseId)) return true
  }
  return false
}

/** 폴더/강의 이름을 변경합니다. 강의자가 공유한 항목은 변경할 수 없습니다. (강의자 본인은 예외) */
export async function renameCourseItem(input: RenameItemInput): Promise<void> {
  await delay(250)
  const canBypassOwnership = isPrivilegedEditor()

  if (input.itemType === 'folder') {
    const folder = findFolder(mockCourseFolders, input.itemId)
    if (!folder) throw new Error('폴더를 찾을 수 없습니다.')
    if (folder.ownership === 'registered' && !canBypassOwnership) throw new Error('강의자가 공유한 폴더는 이름을 변경할 수 없습니다.')
    folder.name = input.name
    return
  }

  const course = findCourse(mockCourseFolders, mockStandaloneCourses, input.itemId)
  if (!course) throw new Error('강의를 찾을 수 없습니다.')
  if (course.ownership === 'registered' && !canBypassOwnership) throw new Error('강의자가 공유한 강의는 이름을 변경할 수 없습니다.')
  course.title = input.name
}

/** 폴더/강의를 내 목록에서 제거합니다. 내가 만든 항목은 완전히 삭제되고, 등록된(공유받은) 항목은 등록만 취소됩니다. */
export async function deleteCourseItem(input: DeleteItemInput): Promise<void> {
  await delay(250)
  const canBypassOwnership = isPrivilegedEditor()

  if (input.itemType === 'folder') {
    const folder = findFolder(mockCourseFolders, input.itemId)
    if (!folder) throw new Error('폴더를 찾을 수 없습니다.')
    detachFolder(mockCourseFolders, input.itemId)
    return
  }

  const course = findCourse(mockCourseFolders, mockStandaloneCourses, input.itemId)
  if (!course) throw new Error('강의를 찾을 수 없습니다.')
  if (!canBypassOwnership && isInsideRegisteredFolder(mockCourseFolders, input.itemId)) {
    throw new Error('등록된 폴더 안의 강의는 폴더 단위로만 등록취소할 수 있습니다.')
  }
  detachCourse(mockCourseFolders, mockStandaloneCourses, input.itemId)
}

export async function getCourseRoom(courseId: string): Promise<CourseRoom> {
  await delay()
  const room = mockCourseRooms[courseId]
  if (!room) {
    throw new Error('강의실을 찾을 수 없습니다.')
  }
  return clone(applyViewerVotes(room, getViewerKey()))
}

function isAnsweredByLecturer(question: Question): boolean {
  return question.replies.some((reply) => reply.authorRole === 'lecturer')
}

function findUnansweredInCourses(courses: Course[]): Array<{ id: string; title: string; questions: UnansweredQuestion[] }> {
  const groups: Array<{ id: string; title: string; questions: UnansweredQuestion[] }> = []

  for (const course of courses) {
    const room = mockCourseRooms[course.id]
    if (!room) continue

    const questions = room.questions
      .filter((question) => question.postType === 'question' && !isAnsweredByLecturer(question))
      .map((question) => ({ ...question, courseId: course.id, courseTitle: course.title }))

    if (questions.length > 0) groups.push({ id: course.id, title: course.title, questions })
  }

  return groups
}

function buildUnansweredTree(folders: CourseFolder[]): UnansweredFolderNode[] {
  const nodes: UnansweredFolderNode[] = []

  for (const folder of folders) {
    const courses = findUnansweredInCourses(folder.courses)
    const children = buildUnansweredTree(folder.children)
    const count = courses.reduce((sum, group) => sum + group.questions.length, 0) + children.reduce((sum, child) => sum + child.count, 0)

    if (count > 0) nodes.push({ id: folder.id, name: folder.name, count, children, courses })
  }

  return nodes
}

/** 강의자의 모든 강의에서 강의자 본인이 아직 답변하지 않은 '질문' 유형 게시글만 폴더 구조로 모아 반환합니다. */
export async function getUnansweredQuestions(): Promise<{ folders: UnansweredFolderNode[]; standaloneCourses: Array<{ id: string; title: string; questions: UnansweredQuestion[] }>; totalCount: number }> {
  await delay()

  const folders = buildUnansweredTree(mockCourseFolders)
  const standaloneCourses = findUnansweredInCourses(mockStandaloneCourses)
  const totalCount = folders.reduce((sum, folder) => sum + folder.count, 0) + standaloneCourses.reduce((sum, group) => sum + group.questions.length, 0)

  return { folders, standaloneCourses, totalCount }
}

export function refineWithAi(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return trimmed
  return /[.?!]$/.test(trimmed) ? trimmed : `${trimmed}. 관련하여 구체적인 예시를 들어 설명해 주실 수 있을까요?`
}

const BLOCKED_WORDS = ['씨발', '개새끼', '병신', '지랄', '좆', '섹스', '죽어', '바보야']

export function containsInappropriateContent(content: string): boolean {
  const normalized = content.toLowerCase()
  return BLOCKED_WORDS.some((word) => normalized.includes(word))
}

function resolveAuthor(submission: ComposerSubmission): { authorName: string; authorRole: 'lecturer' | 'anonymous' | 'student' } {
  if (isPrivilegedEditor()) return { authorName: mockCurrentUser.name, authorRole: 'lecturer' }
  if (submission.isAnonymous) return { authorName: '익명', authorRole: 'anonymous' }
  return { authorName: mockCurrentUser.name, authorRole: 'student' }
}

export async function createQuestion(courseId: string, submission: ComposerSubmission): Promise<Question> {
  await delay(300)
  if (isPrivilegedEditor()) throw new Error('강의자는 답글만 작성할 수 있습니다.')

  const { authorName, authorRole } = resolveAuthor(submission)
  const question: Question = {
    id: `question-${crypto.randomUUID()}`,
    authorName,
    authorRole,
    postType: submission.postType,
    createdAt: '방금 전',
    content: submission.content,
    likeCount: 0,
    isLikedByMe: false,
    isResolved: false,
    replies: [],
  }

  const room = mockCourseRooms[courseId]
  if (room) room.questions = [question, ...room.questions]

  return question
}

export async function createReply(courseId: string, questionId: string, submission: ComposerSubmission): Promise<QuestionReply> {
  await delay(300)
  const { authorName, authorRole } = resolveAuthor(submission)
  const reply: QuestionReply = {
    id: `reply-${crypto.randomUUID()}`,
    authorName,
    authorRole,
    postType: submission.postType,
    isEditable: true,
    createdAt: '방금 전',
    content: submission.content,
    likeCount: 0,
    isLikedByMe: false,
    depth: 0,
  }

  const room = mockCourseRooms[courseId]
  const question = room?.questions.find((item) => item.id === questionId)
  if (question) question.replies = [...question.replies, reply]

  return reply
}

/** 답글을 수정합니다. 작성자 본인(강의자 본인 포함)만 수정할 수 있습니다. */
export async function updateReply(courseId: string, questionId: string, replyId: string, content: string): Promise<QuestionReply> {
  await delay(250)
  const room = mockCourseRooms[courseId]
  const question = room?.questions.find((item) => item.id === questionId)
  const reply = question?.replies.find((item) => item.id === replyId)
  if (!reply) throw new Error('답글을 찾을 수 없습니다.')
  if (!reply.isEditable) throw new Error('수정할 수 없는 답글입니다.')

  reply.content = content
  return clone(reply)
}

export async function toggleQuestionLike(courseId: string, questionId: string): Promise<Question> {
  await delay(150)
  const room = mockCourseRooms[courseId]
  const question = room?.questions.find((item) => item.id === questionId)
  if (!question) throw new Error('질문을 찾을 수 없습니다.')

  const likes = getQuestionLikes(getViewerKey())
  const isLikedByMe = !likes.has(questionId)
  if (isLikedByMe) likes.add(questionId)
  else likes.delete(questionId)
  question.likeCount += isLikedByMe ? 1 : -1

  return clone({ ...question, isLikedByMe })
}

/** 강의자가 질문을 해결 완료로 표시합니다. */
export async function resolveQuestion(courseId: string, questionId: string): Promise<Question> {
  await delay(200)
  if (!isPrivilegedEditor()) throw new Error('강의자만 질문을 해결 처리할 수 있습니다.')

  const room = mockCourseRooms[courseId]
  const question = room?.questions.find((item) => item.id === questionId)
  if (!question) throw new Error('질문을 찾을 수 없습니다.')

  question.isResolved = true
  return clone(question)
}

export async function toggleFeedback(courseId: string, key: FeedbackKey, vote: 'like' | 'dislike'): Promise<CourseRoom> {
  await delay(150)
  if (isPrivilegedEditor()) throw new Error('강의자는 실시간 피드백에 투표할 수 없습니다.')

  const room = mockCourseRooms[courseId]
  if (!room) throw new Error('강의실을 찾을 수 없습니다.')

  const option = room.feedbackOptions.find((item) => item.key === key)
  if (!option) throw new Error('피드백 항목을 찾을 수 없습니다.')

  const votes = getFeedbackVotes(getViewerKey())
  const myVote = votes.get(key) ?? null

  if (myVote === vote) {
    if (vote === 'like') option.likeCount -= 1
    else option.dislikeCount -= 1
    votes.delete(key)
  } else {
    if (myVote === 'like') option.likeCount -= 1
    if (myVote === 'dislike') option.dislikeCount -= 1
    if (vote === 'like') option.likeCount += 1
    else option.dislikeCount += 1
    votes.set(key, vote)
  }

  return clone(applyViewerVotes(room, getViewerKey()))
}

/** 강의자가 실시간 피드백 항목을 확인/반영 처리하여 해당 항목의 집계를 초기화합니다. */
export async function resetFeedbackOption(courseId: string, key: FeedbackKey): Promise<CourseRoom> {
  await delay(150)
  if (!isPrivilegedEditor()) throw new Error('강의자만 피드백을 초기화할 수 있습니다.')

  const room = mockCourseRooms[courseId]
  if (!room) throw new Error('강의실을 찾을 수 없습니다.')

  const option = room.feedbackOptions.find((item) => item.key === key)
  if (!option) throw new Error('피드백 항목을 찾을 수 없습니다.')

  option.likeCount = 0
  option.dislikeCount = 0
  for (const votes of feedbackVotesByUser.values()) votes.delete(key)

  return clone(applyViewerVotes(room, getViewerKey()))
}
