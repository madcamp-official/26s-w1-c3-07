import { mockCourseFolders, mockCourseRooms, mockCurrentUser, mockStandaloneCourses } from '../mock/data'
import type { Course, CourseFolder, CreateCourseInput, CreateFolderInput, DeleteItemInput, MoveItemInput, RenameItemInput } from '../types/course'
import type { ComposerSubmission, CourseRoom, FeedbackKey, Question, QuestionReply } from '../types/room'
import type { User, UserRole } from '../types/user'

const MOCK_DELAY = 250

const delay = (ms = MOCK_DELAY): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

const clone = <T,>(value: T): T => structuredClone(value)

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
  return clone(room)
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

export async function createQuestion(courseId: string, submission: ComposerSubmission): Promise<Question> {
  await delay(300)
  const authorName = submission.isAnonymous ? '익명' : mockCurrentUser.name
  const question: Question = {
    id: `question-${crypto.randomUUID()}`,
    authorName,
    authorRole: submission.isAnonymous ? 'anonymous' : 'student',
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
  const authorName = submission.isAnonymous ? '익명' : mockCurrentUser.name
  const reply: QuestionReply = {
    id: `reply-${crypto.randomUUID()}`,
    authorName,
    authorRole: submission.isAnonymous ? 'anonymous' : 'student',
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

export async function toggleQuestionLike(courseId: string, questionId: string): Promise<Question> {
  await delay(150)
  const room = mockCourseRooms[courseId]
  const question = room?.questions.find((item) => item.id === questionId)
  if (!question) throw new Error('질문을 찾을 수 없습니다.')

  question.isLikedByMe = !question.isLikedByMe
  question.likeCount += question.isLikedByMe ? 1 : -1
  return clone(question)
}

export async function toggleFeedback(courseId: string, key: FeedbackKey, vote: 'like' | 'dislike'): Promise<CourseRoom> {
  await delay(150)
  if (isPrivilegedEditor()) throw new Error('강의자는 실시간 피드백에 투표할 수 없습니다.')

  const room = mockCourseRooms[courseId]
  if (!room) throw new Error('강의실을 찾을 수 없습니다.')

  const option = room.feedbackOptions.find((item) => item.key === key)
  if (!option) throw new Error('피드백 항목을 찾을 수 없습니다.')

  if (option.myVote === vote) {
    if (vote === 'like') option.likeCount -= 1
    else option.dislikeCount -= 1
    option.myVote = null
  } else {
    if (option.myVote === 'like') option.likeCount -= 1
    if (option.myVote === 'dislike') option.dislikeCount -= 1
    if (vote === 'like') option.likeCount += 1
    else option.dislikeCount += 1
    option.myVote = vote
  }

  return clone(room)
}
