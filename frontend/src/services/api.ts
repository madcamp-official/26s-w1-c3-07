import {
  mockCourseRooms,
  mockCurrentUser,
  mockInstructorCourses,
  mockInstructorFolders,
  mockStudentCourses,
  mockStudentFolders,
} from '../mock/data'
import { supabase } from './supabaseClient'
import type { Course, CourseFolder, CreateCourseInput, CreateFolderInput, DeleteItemInput, FolderOwnership, MoveItemInput, RenameItemInput, UpdateCourseInput } from '../types/course'
import type { ComposerSubmission, CourseRoom, FeedbackKey, Question, QuestionReply, UnansweredFolderNode, UnansweredQuestion } from '../types/room'
import type { User, UserRole } from '../types/user'

type DbMode = 'lecturer' | 'student'

function modeToRole(mode: DbMode): UserRole {
  return mode === 'lecturer' ? 'instructor' : 'student'
}

function roleToMode(role: UserRole): DbMode {
  return role === 'instructor' ? 'lecturer' : 'student'
}

function avatarTextOf(name: string): string {
  return name.trim().slice(0, 1) || '?'
}

interface ProfileRow {
  id: string
  name: string | null
  mode: DbMode
}

/** Supabase 세션 + profiles 행을 프론트에서 쓰는 User 모양으로 합칩니다. */
async function loadUserFromSession(authUser: { id: string; email?: string }): Promise<User> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, name, mode')
    .eq('id', authUser.id)
    .single<ProfileRow>()

  if (error) throw error

  const name = profile.name ?? authUser.email ?? '이름 없음'
  const user: User = {
    id: profile.id,
    name,
    email: authUser.email ?? '',
    role: modeToRole(profile.mode),
    avatarText: avatarTextOf(name),
  }

  // 강의/게시글 등 아직 목업 데이터로 남아 있는 로직이 mockCurrentUser를 기준으로 동작하므로,
  // 실제 세션 정보를 그대로 반영해 둡니다 (단계적 마이그레이션 동안의 임시 다리 역할).
  mockCurrentUser.id = user.id
  mockCurrentUser.name = user.name
  mockCurrentUser.email = user.email
  mockCurrentUser.role = user.role
  mockCurrentUser.avatarText = user.avatarText

  return user
}

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

/**
 * 답글의 "수정하기"는 실제로 그 글을 작성한 사람에게만 보여야 합니다.
 * 데모 계정은 역할 전환으로 수강생/강의자를 오가므로, 답글을 작성할 때의
 * 뷰어 키(`id:role`)를 기록해 두었다가 현재 뷰어와 비교해 판단합니다.
 * 시드 데이터의 답글은 mockCurrentUser 명의로 작성된 것으로 간주해
 * 아래에서 초기값을 채워 넣습니다.
 */
const replyAuthorKeyById = new Map<string, string>([
  ['reply-1', 'user-1:instructor'],
  ['reply-3', 'user-1:instructor'],
])

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
    replies: question.replies.map((reply) => ({
      ...reply,
      isLikedByMe: likes.has(reply.id),
      isEditable: replyAuthorKeyById.get(reply.id) === voterKey,
    })),
  })

  return {
    ...room,
    feedbackOptions: room.feedbackOptions.map((option) => ({ ...option, myVote: votes.get(option.key) ?? null })),
    questions: room.questions.map(applyToQuestion),
  }
}

/** 로그인 안 한 상태면 null을 반환합니다. */
export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error

  const authUser = data.session?.user
  if (!authUser) return null

  return loadUserFromSession(authUser)
}

/** Google OAuth 로그인을 시작합니다. 리다이렉트 후 돌아오면 세션이 생깁니다. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/** 회원 탈퇴: 본인 auth.users 행을 삭제하는 RPC를 호출한 뒤 로그아웃 처리합니다. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_own_account')
  if (error) throw error
  await signOut()
}

export async function switchUserRole(role: UserRole): Promise<User> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUser = sessionData.session?.user
  if (!authUser) throw new Error('로그인이 필요합니다.')

  const { error } = await supabase
    .from('profiles')
    .update({ mode: roleToMode(role) })
    .eq('id', authUser.id)
  if (error) throw error

  return loadUserFromSession(authUser)
}

export async function updateUserName(name: string): Promise<User> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('닉네임을 입력해 주세요.')

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const authUser = sessionData.session?.user
  if (!authUser) throw new Error('로그인이 필요합니다.')

  const { error } = await supabase
    .from('profiles')
    .update({ name: trimmed })
    .eq('id', authUser.id)
  if (error) throw error

  return loadUserFromSession(authUser)
}

interface NodeRow {
  id: string
  parent_id: string | null
  type: 'folder' | 'lecture'
  name: string
  created_by: string | null
  created_mode: DbMode
  created_at: string
  lectures?: { start_time: string; end_time: string; location: string | null; max_participants: number | null } | null
}

interface FavoriteSubtreeRow extends NodeRow {
  anchor_node_id: string
}

async function requireAuthUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const userId = data.session?.user.id
  if (!userId) throw new Error('로그인이 필요합니다.')
  return userId
}

function nodeToItem(node: NodeRow, ownership: FolderOwnership): CourseFolder | Course {
  if (node.type === 'lecture') {
    const course: Course = {
      id: node.id,
      title: node.name,
      participantCount: 0,
      questionCount: 0,
      color: ownership === 'owned' ? 'purple' : 'blue',
      ownership,
      date: node.lectures?.start_time,
      startTime: node.lectures?.start_time,
      endTime: node.lectures?.end_time,
      location: node.lectures?.location ?? undefined,
      capacity: node.lectures?.max_participants ?? null,
    }
    return course
  }

  const folder: CourseFolder = { id: node.id, name: node.name, ownership, children: [], courses: [] }
  return folder
}

function isCourseFolder(item: CourseFolder | Course): item is CourseFolder {
  return 'children' in item
}

/** parent_id 기준 평평한 노드 목록을 중첩 트리로 조립합니다. */
function buildFolderTree(flatNodes: NodeRow[], ownership: FolderOwnership): { folders: CourseFolder[]; rootCourses: Course[] } {
  const byId = new Map(flatNodes.map((node) => [node.id, nodeToItem(node, ownership)]))
  const folders: CourseFolder[] = []
  const rootCourses: Course[] = []

  for (const node of flatNodes) {
    const item = byId.get(node.id)
    if (!item) continue
    const parent = node.parent_id ? byId.get(node.parent_id) : null

    if (parent && isCourseFolder(parent)) {
      if (isCourseFolder(item)) parent.children.push(item)
      else parent.courses.push(item)
    } else if (isCourseFolder(item)) {
      folders.push(item)
    } else {
      rootCourses.push(item)
    }
  }

  return { folders, rootCourses }
}

/** 즐겨찾기 서브트리(get_my_favorite_subtrees)를 anchor_node_id별로 묶어 각각 독립된 트리로 조립합니다. */
function buildFavoriteRoots(rows: FavoriteSubtreeRow[]): Map<string, CourseFolder | Course> {
  const byAnchor = new Map<string, FavoriteSubtreeRow[]>()
  for (const row of rows) {
    const bucket = byAnchor.get(row.anchor_node_id)
    if (bucket) bucket.push(row)
    else byAnchor.set(row.anchor_node_id, [row])
  }

  const roots = new Map<string, CourseFolder | Course>()
  for (const [anchorNodeId, anchorRows] of byAnchor) {
    const { folders, rootCourses } = buildFolderTree(anchorRows, 'registered')
    const root = folders[0] ?? rootCourses[0]
    if (root) roots.set(anchorNodeId, root)
  }
  return roots
}

async function getInstructorDataset(userId: string): Promise<{ folders: CourseFolder[]; rootCourses: Course[] }> {
  const { data, error } = await supabase
    .from('nodes')
    .select('id, parent_id, type, name, created_by, created_mode, created_at, lectures(start_time, end_time, location, max_participants)')
    .eq('created_by', userId)
    .eq('created_mode', 'lecturer')

  if (error) throw error
  return buildFolderTree((data ?? []) as NodeRow[], 'owned')
}

async function getStudentDataset(userId: string): Promise<{ folders: CourseFolder[]; rootCourses: Course[] }> {
  const [{ data: created, error: createdError }, { data: favorites, error: favoritesError }, { data: favoriteRows, error: favoriteRowsError }] = await Promise.all([
    supabase
      .from('nodes')
      .select('id, parent_id, type, name, created_by, created_mode, created_at')
      .eq('created_by', userId)
      .eq('created_mode', 'student'),
    supabase.from('favorites').select('node_id, anchor_id').eq('user_id', userId),
    supabase.rpc('get_my_favorite_subtrees'),
  ])

  if (createdError) throw createdError
  if (favoritesError) throw favoritesError
  if (favoriteRowsError) throw favoriteRowsError

  const { folders: ownedFolders } = buildFolderTree((created ?? []) as NodeRow[], 'owned')
  const anchorByNodeId = new Map((favorites ?? []).map((row) => [row.node_id as string, row.anchor_id as string | null]))
  const favoriteRoots = buildFavoriteRoots((favoriteRows ?? []) as FavoriteSubtreeRow[])

  const topLevel: Array<CourseFolder | Course> = []
  const rootsByAnchorId = new Map<string, Array<CourseFolder | Course>>()

  for (const [anchorNodeId, root] of favoriteRoots) {
    const anchorId = anchorByNodeId.get(anchorNodeId) ?? null
    if (anchorId === null) {
      topLevel.push(root)
    } else {
      const bucket = rootsByAnchorId.get(anchorId)
      if (bucket) bucket.push(root)
      else rootsByAnchorId.set(anchorId, [root])
    }
  }

  const attachFavorites = (folder: CourseFolder): void => {
    folder.children.forEach(attachFavorites)
    for (const root of rootsByAnchorId.get(folder.id) ?? []) {
      if (isCourseFolder(root)) folder.children.push(root)
      else folder.courses.push(root)
    }
  }
  ownedFolders.forEach(attachFavorites)

  const folders = [...ownedFolders, ...topLevel.filter(isCourseFolder)]
  const rootCourses = topLevel.filter((item): item is Course => !isCourseFolder(item))

  return { folders, rootCourses }
}

async function getRemoteDataset(): Promise<{ folders: CourseFolder[]; rootCourses: Course[] }> {
  const userId = await requireAuthUserId()
  return isPrivilegedEditor() ? getInstructorDataset(userId) : getStudentDataset(userId)
}

export async function getCourseFolders(): Promise<CourseFolder[]> {
  const { folders } = await getRemoteDataset()
  return folders
}

export async function getStandaloneCourses(): Promise<Course[]> {
  const { rootCourses } = await getRemoteDataset()
  return rootCourses
}

interface NodeWithLectureRow {
  id: string
  name: string
  lectures: { start_time: string; end_time: string; location: string | null; max_participants: number | null } | null
}

async function findCourseByJoinCode(code: string): Promise<Course> {
  if (!/^\d{4}$/.test(code)) {
    throw new Error('4자리 강의 코드를 입력해 주세요.')
  }

  const { data: joinCodeRow, error: joinCodeError } = await supabase
    .from('lecture_join_codes')
    .select('lecture_id')
    .eq('code', code)
    .maybeSingle<{ lecture_id: string }>()

  if (joinCodeError) throw joinCodeError
  if (!joinCodeRow) throw new Error('유효하지 않은 강의 코드입니다.')

  const { data: node, error: nodeError } = await supabase
    .from('nodes')
    .select('id, name, lectures(start_time, end_time, location, max_participants)')
    .eq('id', joinCodeRow.lecture_id)
    .single<NodeWithLectureRow>()

  if (nodeError) throw nodeError

  return {
    id: node.id,
    title: node.name,
    participantCount: 0,
    questionCount: 0,
    updatedAt: '방금 전',
    color: 'blue',
    ownership: 'registered',
    date: node.lectures?.start_time,
    startTime: node.lectures?.start_time,
    endTime: node.lectures?.end_time,
    location: node.lectures?.location ?? undefined,
    capacity: node.lectures?.max_participants ?? null,
  }
}

/** 4자리 코드로 강의를 찾아 강의실에 "입장"만 합니다. 내 강의 목록에 등록하지 않습니다. */
export async function joinCourse(code: string): Promise<Course> {
  return findCourseByJoinCode(code)
}

/** 4자리 코드로 강의를 찾아 "내 강의" 목록(favorites)에 등록합니다. 항상 최상위에 등록되고, 이후 moveCourseItem으로 정리합니다. */
export async function registerCourseByCode(code: string): Promise<Course> {
  const course = await findCourseByJoinCode(code)
  const userId = await requireAuthUserId()

  const { error } = await supabase.from('favorites').insert({ user_id: userId, node_id: course.id, anchor_id: null })
  if (error) throw error

  return course
}

export async function createRootFolder(input: CreateFolderInput): Promise<CourseFolder> {
  const userId = await requireAuthUserId()
  const createdMode = roleToMode(mockCurrentUser.role)

  const { data, error } = await supabase
    .from('nodes')
    .insert({ name: input.name, type: 'folder', created_by: userId, created_mode: createdMode })
    .select('id, name')
    .single<{ id: string; name: string }>()

  if (error) throw error

  return { id: data.id, name: data.name, ownership: 'owned', children: [], courses: [] }
}

function generateJoinCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export async function createCourse(input: CreateCourseInput): Promise<Course> {
  const userId = await requireAuthUserId()

  const { data: node, error: nodeError } = await supabase
    .from('nodes')
    .insert({ name: input.title, type: 'lecture', created_by: userId, created_mode: 'lecturer', parent_id: input.folderId ?? null })
    .select('id, name')
    .single<{ id: string; name: string }>()

  if (nodeError) throw nodeError

  const startTime = new Date(`${input.date}T${input.startTime}`).toISOString()
  const endTime = new Date(`${input.date}T${input.endTime}`).toISOString()

  const { error: lectureError } = await supabase
    .from('lectures')
    .insert({ id: node.id, start_time: startTime, end_time: endTime, location: input.location ?? null, max_participants: input.capacity ?? null })

  if (lectureError) throw lectureError

  const joinCode = generateJoinCode()
  const { error: joinCodeError } = await supabase.from('lecture_join_codes').insert({ code: joinCode, lecture_id: node.id })
  if (joinCodeError) throw joinCodeError

  return {
    id: node.id,
    title: node.name,
    participantCount: 0,
    questionCount: 0,
    color: 'purple',
    ownership: 'owned',
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location,
    capacity: input.capacity ?? null,
    joinCode,
  }
}

/** 강의의 기본 정보를 수정합니다. 강의자 본인이 만든 강의만 수정할 수 있습니다(RLS: lectures_owner_all). */
export async function updateCourse(input: UpdateCourseInput): Promise<Course> {
  const { data: node, error: nodeError } = await supabase
    .from('nodes')
    .update({ name: input.title })
    .eq('id', input.id)
    .select('id, name')
    .single<{ id: string; name: string }>()

  if (nodeError) throw nodeError

  const startTime = new Date(`${input.date}T${input.startTime}`).toISOString()
  const endTime = new Date(`${input.date}T${input.endTime}`).toISOString()

  const { error: lectureError } = await supabase
    .from('lectures')
    .update({ start_time: startTime, end_time: endTime, location: input.location ?? null, max_participants: input.capacity ?? null })
    .eq('id', input.id)

  if (lectureError) throw lectureError

  return {
    id: node.id,
    title: node.name,
    participantCount: 0,
    questionCount: 0,
    color: 'purple',
    ownership: 'owned',
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location,
    capacity: input.capacity ?? null,
  }
}

function isPrivilegedEditor(): boolean {
  return mockCurrentUser.role === 'instructor'
}

/**
 * 강의자 역할일 때는 "내가 만든 강의", 수강생 역할일 때는 "내가 등록한 강의"를
 * 보여줘야 하므로 역할에 따라 완전히 다른 폴더/강의 목록을 사용합니다.
 */
function getActiveDataset(): { folders: CourseFolder[]; rootCourses: Course[] } {
  return isPrivilegedEditor()
    ? { folders: mockInstructorFolders, rootCourses: mockInstructorCourses }
    : { folders: mockStudentFolders, rootCourses: mockStudentCourses }
}

async function isOwnNode(nodeId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('nodes').select('id').eq('id', nodeId).eq('created_by', userId).maybeSingle<{ id: string }>()
  if (error) throw error
  return Boolean(data)
}

/**
 * 폴더/강의를 다른 폴더 또는 최상위로 이동합니다.
 * 내가 만든(owned) 폴더/강의는 nodes.parent_id를 직접 옮깁니다(enforce_nodes_parent_ownership이 "내 것·같은 모드"만 강제).
 * 즐겨찾기한(registered) 항목은 실제 nodes 구조가 아니라 favorites.anchor_id(내 정리 위치)만 바뀝니다.
 */
export async function moveCourseItem(input: MoveItemInput): Promise<void> {
  const userId = await requireAuthUserId()
  const owned = await isOwnNode(input.itemId, userId)

  if (owned) {
    const { error } = await supabase.from('nodes').update({ parent_id: input.targetFolderId }).eq('id', input.itemId)
    if (error) throw error
    return
  }

  if (input.itemType === 'folder') throw new Error('강의자가 공유한 폴더는 이동할 수 없습니다.')

  const { error } = await supabase.from('favorites').update({ anchor_id: input.targetFolderId }).eq('user_id', userId).eq('node_id', input.itemId)
  if (error) throw error
}

/** 폴더/강의 이름을 변경합니다. 내가 만든(owned) 항목만 가능합니다(RLS: nodes_update_own). */
export async function renameCourseItem(input: RenameItemInput): Promise<void> {
  const { error } = await supabase.from('nodes').update({ name: input.name }).eq('id', input.itemId)
  if (error) throw error
}

/** 폴더/강의를 내 목록에서 제거합니다. 내가 만든 항목은 완전히 삭제(cascade)되고, 즐겨찾기한 항목은 등록만 취소됩니다. */
export async function deleteCourseItem(input: DeleteItemInput): Promise<void> {
  const userId = await requireAuthUserId()
  const owned = await isOwnNode(input.itemId, userId)

  if (owned) {
    const { error } = await supabase.from('nodes').delete().eq('id', input.itemId)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('node_id', input.itemId)
  if (error) throw error
}

interface NodeWithLectureAndOwnerRow {
  id: string
  name: string
  created_by: string | null
  lectures: { start_time: string; end_time: string; location: string | null } | null
}

function formatLectureDate(startTime: string): string {
  const date = new Date(startTime)
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`
}

/** 실제 DB(nodes+lectures)에서 강의 메타데이터만 조회합니다. 질문/답글/피드백은 아직 posts 연동 전이라 빈 값으로 채웁니다. */
async function getCourseRoomFromDb(courseId: string): Promise<CourseRoom> {
  const { data: node, error } = await supabase
    .from('nodes')
    .select('id, name, created_by, lectures(start_time, end_time, location)')
    .eq('id', courseId)
    .eq('type', 'lecture')
    .single<NodeWithLectureAndOwnerRow>()

  if (error || !node) throw new Error('강의실을 찾을 수 없습니다.')

  let lecturerName = '강의자'
  if (node.created_by) {
    const { data: owner } = await supabase.from('profiles').select('name').eq('id', node.created_by).maybeSingle<{ name: string | null }>()
    if (owner?.name) lecturerName = owner.name
  }

  return {
    id: node.id,
    title: node.name,
    date: node.lectures ? formatLectureDate(node.lectures.start_time) : '',
    lecturerName,
    participantCount: 0,
    feedbackOptions: [
      { key: 'cold', label: '추워요', likeCount: 0, dislikeCount: 0, myVote: null },
      { key: 'hot', label: '더워요', likeCount: 0, dislikeCount: 0, myVote: null },
      { key: 'quiet', label: '소리가 작아요', likeCount: 0, dislikeCount: 0, myVote: null },
      { key: 'blurry', label: '잘 안 보여요', likeCount: 0, dislikeCount: 0, myVote: null },
    ],
    questions: [],
  }
}

export async function getCourseRoom(courseId: string): Promise<CourseRoom> {
  const room = mockCourseRooms[courseId]
  if (room) {
    await delay()
    return clone(applyViewerVotes(room, getViewerKey()))
  }

  return getCourseRoomFromDb(courseId)
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

  const { folders: activeFolders, rootCourses } = getActiveDataset()
  const folders = buildUnansweredTree(activeFolders)
  const standaloneCourses = findUnansweredInCourses(rootCourses)
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
  replyAuthorKeyById.set(reply.id, getViewerKey())

  const room = mockCourseRooms[courseId]
  const question = room?.questions.find((item) => item.id === questionId)
  if (question) question.replies = [...question.replies, reply]

  return reply
}

/** 답글을 수정합니다. 실제로 그 답글을 작성한 본인만 수정할 수 있습니다. */
export async function updateReply(courseId: string, questionId: string, replyId: string, content: string): Promise<QuestionReply> {
  await delay(250)
  const room = mockCourseRooms[courseId]
  const question = room?.questions.find((item) => item.id === questionId)
  const reply = question?.replies.find((item) => item.id === replyId)
  if (!reply) throw new Error('답글을 찾을 수 없습니다.')
  if (replyAuthorKeyById.get(replyId) !== getViewerKey()) throw new Error('내가 작성한 답글만 수정할 수 있습니다.')

  reply.content = content
  return clone({ ...reply, isEditable: true })
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

/** 강의자가 질문의 해결 여부를 전환합니다. */
export async function resolveQuestion(courseId: string, questionId: string): Promise<Question> {
  await delay(200)
  if (!isPrivilegedEditor()) throw new Error('강의자만 질문을 해결 처리할 수 있습니다.')

  const room = mockCourseRooms[courseId]
  const question = room?.questions.find((item) => item.id === questionId)
  if (!question) throw new Error('질문을 찾을 수 없습니다.')

  question.isResolved = !question.isResolved
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
