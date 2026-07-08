import {
  mockCourseRooms,
  mockCurrentUser,
  mockInstructorCourses,
  mockInstructorFolders,
  mockStudentCourses,
  mockStudentFolders,
} from '../mock/data'
import { getGuestToken } from './guestToken'
import { supabase } from './supabaseClient'
import type { Course, CourseFolder, CreateCourseInput, CreateFolderInput, DeleteItemInput, FolderOwnership, MoveItemInput, RenameItemInput, UpdateCourseInput } from '../types/course'
import type { ComposerSubmission, CourseRoom, FeedbackKey, FeedbackOption, PostType, Question, QuestionReply, SubmitPostResult, UnansweredFolderNode, UnansweredQuestion } from '../types/room'
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
const feedbackVotesByUser = new Map<string, Map<FeedbackKey, Set<'like' | 'dislike'>>>()
const questionLikesByUser = new Map<string, Set<string>>()

/**
 * 질문/답글의 "수정하기"는 실제로 그 글을 작성한 사람에게만 보여야 합니다.
 * 데모 계정은 역할 전환으로 수강생/강의자를 오가므로, 글을 작성할 때의
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

function getFeedbackVotes(voterKey: string): Map<FeedbackKey, Set<'like' | 'dislike'>> {
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

  const applyToQuestion = (question: Question): Question => {
    const isOwnQuestion = replyAuthorKeyById.get(question.id) === voterKey
    return {
      ...question,
      isLikedByMe: likes.has(question.id),
      isEditable: isOwnQuestion,
      canDelete: isOwnQuestion || isPrivilegedEditor(),
      replies: question.replies.map((reply) => {
        const isOwn = replyAuthorKeyById.get(reply.id) === voterKey
        return {
          ...reply,
          isLikedByMe: likes.has(reply.id),
          isEditable: isOwn,
          canDelete: isOwn || isPrivilegedEditor(),
        }
      }),
    }
  }

  return {
    ...room,
    feedbackOptions: room.feedbackOptions.map((option) => ({
      ...option,
      myLiked: votes.get(option.key)?.has('like') ?? false,
      myDisliked: votes.get(option.key)?.has('dislike') ?? false,
    })),
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

/** Google OAuth 로그인을 시작합니다. 로그인을 호출한 페이지로 그대로 돌아옵니다. */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
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
    .order('created_at')

  if (error) throw error
  return buildFolderTree((data ?? []) as NodeRow[], 'owned')
}

async function getStudentDataset(userId: string): Promise<{ folders: CourseFolder[]; rootCourses: Course[] }> {
  const [{ data: created, error: createdError }, { data: favorites, error: favoritesError }, { data: favoriteRows, error: favoriteRowsError }] = await Promise.all([
    supabase
      .from('nodes')
      .select('id, parent_id, type, name, created_by, created_mode, created_at')
      .eq('created_by', userId)
      .eq('created_mode', 'student')
      .order('created_at'),
    supabase.from('favorites').select('node_id, anchor_id').eq('user_id', userId),
    supabase.rpc('get_my_favorite_subtrees').order('created_at'),
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

function collectCourses(folders: CourseFolder[], rootCourses: Course[]): Course[] {
  const collected: Course[] = [...rootCourses]
  const visit = (folder: CourseFolder): void => {
    collected.push(...folder.courses)
    folder.children.forEach(visit)
  }
  folders.forEach(visit)
  return collected
}

/** posts_counts 뷰에서 강의별 게시글 개수를 일괄 조회해 트리 안의 Course.questionCount를 실제 값으로 채웁니다. */
async function fillQuestionCounts(folders: CourseFolder[], rootCourses: Course[]): Promise<void> {
  const courses = collectCourses(folders, rootCourses)
  if (courses.length === 0) return

  const { data: counts, error } = await supabase
    .from('posts_counts')
    .select('lecture_id, post_count')
    .in('lecture_id', courses.map((course) => course.id))
  if (error) throw error

  const countByLectureId = new Map((counts ?? []).map((row) => [row.lecture_id as string, row.post_count as number]))
  for (const course of courses) {
    course.questionCount = countByLectureId.get(course.id) ?? 0
  }
}

async function getRemoteDataset(): Promise<{ folders: CourseFolder[]; rootCourses: Course[] }> {
  const userId = await requireAuthUserId()
  const dataset = isPrivilegedEditor() ? await getInstructorDataset(userId) : await getStudentDataset(userId)
  await fillQuestionCounts(dataset.folders, dataset.rootCourses)
  return dataset
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

  const { data: countRow } = await supabase.from('posts_counts').select('post_count').eq('lecture_id', node.id).maybeSingle<{ post_count: number }>()

  return {
    id: node.id,
    title: node.name,
    questionCount: countRow?.post_count ?? 0,
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 강의/폴더 UUID(nodes.id)로 강의자 모드로 만든 노드가 맞는지 확인합니다. */
async function findRegistrableNodeById(id: string): Promise<{ id: string; type: 'folder' | 'lecture' }> {
  const { data: node, error: nodeError } = await supabase
    .from('nodes')
    .select('id, type, created_mode')
    .eq('id', id)
    .maybeSingle<{ id: string; type: 'folder' | 'lecture'; created_mode: DbMode }>()

  if (nodeError) throw nodeError
  if (!node) throw new Error('존재하지 않는 강의/폴더입니다.')
  if (node.created_mode !== 'lecturer') throw new Error('강의자 모드로 만든 강의/폴더만 등록할 수 있습니다.')
  return node
}

/** 강의/폴더 UUID로 "내 강의" 목록(favorites)에 등록합니다. 항상 최상위에 등록되고, 이후 moveCourseItem으로 정리합니다. */
export async function registerCourseByCode(id: string): Promise<void> {
  if (!UUID_PATTERN.test(id)) throw new Error('강의/폴더 UUID를 입력해 주세요.')

  const node = await findRegistrableNodeById(id)
  const userId = await requireAuthUserId()

  const { error } = await supabase.from('favorites').insert({ user_id: userId, node_id: node.id, anchor_id: null })
  if (error) throw error
}

async function isCourseFavorited(courseId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('favorites').select('node_id').eq('user_id', userId).eq('node_id', courseId).maybeSingle()
  if (error) throw error
  return !!data
}

/**
 * 강의실 헤더의 "내 강의로 등록" 토글. 이미 등록돼 있으면 취소, 아니면 최상위에 등록.
 * deleteCourseItem과 달리 owned 여부를 따지지 않고 항상 favorites만 다룸(이 버튼은
 * 강의 자체를 삭제하는 용도가 아니라 즐겨찾기 등록/취소 전용이라서).
 */
export async function toggleCourseRegistration(courseId: string): Promise<{ isFavorited: boolean }> {
  const userId = await requireAuthUserId()
  const alreadyFavorited = await isCourseFavorited(courseId, userId)

  if (alreadyFavorited) {
    const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('node_id', courseId)
    if (error) throw error
    return { isFavorited: false }
  }

  const { error } = await supabase.from('favorites').insert({ user_id: userId, node_id: courseId, anchor_id: null })
  if (error) throw error
  return { isFavorited: true }
}

export async function createRootFolder(input: CreateFolderInput): Promise<CourseFolder> {
  const userId = await requireAuthUserId()
  const createdMode = roleToMode(mockCurrentUser.role)

  const { data, error } = await supabase
    .from('nodes')
    .insert({ name: input.name, type: 'folder', created_by: userId, created_mode: createdMode, parent_id: input.parentId ?? null })
    .select('id, name')
    .single<{ id: string; name: string }>()

  if (error) throw error

  return { id: data.id, name: data.name, ownership: 'owned', children: [], courses: [] }
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

  const { data: joinCode, error: joinCodeError } = await supabase.rpc('get_or_create_join_code', { p_lecture_id: node.id })
  if (joinCodeError) throw joinCodeError

  return {
    id: node.id,
    title: node.name,
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

/** 이미 발급된 강의 코드가 있으면 그대로, 없으면 새로 발급해 반환합니다(RPC: get_or_create_join_code). */
export async function getOrCreateJoinCode(courseId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_join_code', { p_lecture_id: courseId })
  if (error) throw error
  return data
}

/** 기존 코드를 폐기하고 새 코드를 발급합니다(RPC: reissue_join_code). */
export async function reissueJoinCode(courseId: string): Promise<string> {
  const { data, error } = await supabase.rpc('reissue_join_code', { p_lecture_id: courseId })
  if (error) throw error
  return data
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

export function isPrivilegedEditor(): boolean {
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

/**
 * 지금 보고 있는 화면(강의자/수강생 모드)에서 "내가 만든" 노드인지 판별합니다.
 * created_by만 보면 안 되는 이유: 같은 계정이 강의자 모드로 만든 폴더/강의를
 * 수강생 모드에서 즐겨찾기(등록)할 수 있는데, 이때 created_by는 여전히 본인이지만
 * 지금 보이는 화면(수강생 모드) 기준으로는 "등록만 한" 항목이라 owned가 아닙니다.
 * created_mode까지 함께 확인해야 "지금 이 화면에서 실제로 만든 것"만 owned로 판별됩니다.
 */
async function isOwnNode(nodeId: string, userId: string): Promise<boolean> {
  const createdMode = roleToMode(mockCurrentUser.role)
  const { data, error } = await supabase
    .from('nodes')
    .select('id')
    .eq('id', nodeId)
    .eq('created_by', userId)
    .eq('created_mode', createdMode)
    .maybeSingle<{ id: string }>()
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

interface LecturePublicRow {
  id: string
  title: string
  start_time: string
  end_time: string
  location: string | null
  max_participants: number | null
  lecturer_name: string | null
}

function formatLectureDate(startTime: string): string {
  const date = new Date(startTime)
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`
}

interface CourseRoomMeta {
  id: string
  title: string
  date: string
  lecturerName: string
  participantCount: number
  capacity: number | null
  isFavorited: boolean
}

/** 실제 DB(lectures_public)에서 강의 메타데이터만 조회합니다. */
async function getCourseRoomFromDb(courseId: string): Promise<CourseRoomMeta> {
  const { data: lecture, error } = await supabase
    .from('lectures_public')
    .select('id, title, start_time, end_time, location, max_participants, lecturer_name')
    .eq('id', courseId)
    .single<LecturePublicRow>()

  if (error || !lecture) throw new Error('강의실을 찾을 수 없습니다.')

  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  const isFavorited = userId ? await isCourseFavorited(courseId, userId) : false

  return {
    id: lecture.id,
    title: lecture.title,
    date: formatLectureDate(lecture.start_time),
    // lecturer_name이 null이면 강의를 만든 계정이 탈퇴한 것입니다.
    lecturerName: lecture.lecturer_name ?? '탈퇴한 계정입니다',
    participantCount: 0,
    capacity: lecture.max_participants,
    isFavorited,
  }
}

export async function getCourseRoom(courseId: string): Promise<CourseRoom> {
  const room = mockCourseRooms[courseId]
  if (room) {
    await delay()
    return clone(applyViewerVotes(room, getViewerKey()))
  }

  const meta = await getCourseRoomFromDb(courseId)
  const [questions, feedbackOptions] = await Promise.all([
    getQuestionsFromDb(courseId),
    getFeedbackOptionsFromDb(courseId),
  ])
  return { ...meta, questions, feedbackOptions }
}

/** 현재 뷰어(회원이면 auth.uid, 비회원이면 guest_token)를 나타내는 voter_key를 가져옵니다. */
async function getCurrentVoterKey(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? getGuestToken()
}

interface PostPublicRow {
  id: string
  lecture_id: string
  parent_id: string | null
  author_display_name: string | null
  is_anonymous: boolean
  type: 'question' | 'opinion'
  status: 'unresolved' | 'resolved' | null
  resolved_at: string | null
  content: string
  created_at: string
  created_mode: DbMode
  is_mine: boolean
}

export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return '방금 전'
  if (diffMinutes < 60) return `${diffMinutes}분 전`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}시간 전`
  return `${Math.floor(diffHours / 24)}일 전`
}

/** posts_public.created_mode를 그대로 사용해 강의자/수강생/익명을 정확히 판별합니다. */
export function postAuthorRole(row: Pick<PostPublicRow, 'is_anonymous' | 'created_mode'>): 'lecturer' | 'anonymous' | 'student' {
  if (row.is_anonymous) return 'anonymous'
  return row.created_mode === 'lecturer' ? 'lecturer' : 'student'
}

/**
 * 익명 글은 항상 "익명"으로 표시합니다. 실명 글인데 author_display_name이 null이면
 * 작성자가 탈퇴한 회원이라는 뜻이라 "탈퇴한 계정입니다"로 표시합니다.
 */
export function resolvePostAuthorName(row: Pick<PostPublicRow, 'is_anonymous' | 'author_display_name'>): string {
  if (row.is_anonymous) return '익명'
  return row.author_display_name ?? '탈퇴한 계정입니다'
}

/** 유사 질문 발견 모달에서 보여줄 글 내용을 조회합니다. */
export async function getSimilarQuestionPreview(postId: string): Promise<{ content: string; authorName: string } | null> {
  const { data, error } = await supabase
    .from('posts_public')
    .select('content, is_anonymous, author_display_name')
    .eq('id', postId)
    .maybeSingle<{ content: string; is_anonymous: boolean; author_display_name: string | null }>()

  if (error || !data) return null
  return { content: data.content, authorName: resolvePostAuthorName(data) }
}

/** posts_public(flat) + 좋아요/내 투표 정보를 합쳐 최상위 질문(Question[]) 트리로 조립합니다. */
async function getQuestionsFromDb(lectureId: string): Promise<Question[]> {
  const { data: sessionData } = await supabase.auth.getSession()
  const isLoggedIn = Boolean(sessionData.session?.user.id)
  const voterKey = await getCurrentVoterKey()

  const [{ data: rows, error: postsError }, { data: likeCounts, error: likeCountsError }, { data: myLikes, error: myLikesError }] = await Promise.all([
    withGuestHeader(
      supabase.from('posts_public').select('id, lecture_id, parent_id, author_display_name, is_anonymous, type, status, resolved_at, content, created_at, created_mode, is_mine').eq('lecture_id', lectureId),
      isLoggedIn,
    ),
    supabase.from('post_likes_counts').select('post_id, like_count'),
    withGuestHeader(supabase.from('post_likes').select('post_id').eq('voter_key', voterKey), isLoggedIn),
  ])

  if (postsError) throw postsError
  if (likeCountsError) throw likeCountsError
  if (myLikesError) throw myLikesError

  const likeCountByPostId = new Map((likeCounts ?? []).map((row) => [row.post_id as string, row.like_count as number]))
  const likedPostIds = new Set((myLikes ?? []).map((row) => row.post_id as string))

  const postRows = (rows ?? []) as PostPublicRow[]
  const byParent = new Map<string | null, PostPublicRow[]>()
  for (const row of postRows) {
    const bucket = byParent.get(row.parent_id)
    if (bucket) bucket.push(row)
    else byParent.set(row.parent_id, [row])
  }
  // 답글은 최근에 제출한 게 아래로 가도록(자연스러운 대화 순서) 제출 시각 오름차순 정렬.
  // parent_id === null(최상위 글) 버킷은 아래에서 별도 규칙으로 다시 정렬하므로 여기서
  // 건드려도 상관없음(어차피 덮어씀).
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
  }

  const canDelete = (row: PostPublicRow): boolean => row.is_mine || isPrivilegedEditor()

  const toReply = (row: PostPublicRow, depth: number): QuestionReply => ({
    id: row.id,
    authorName: resolvePostAuthorName(row),
    authorRole: postAuthorRole(row),
    postType: row.type,
    isEditable: row.is_mine,
    canDelete: canDelete(row),
    createdAt: formatRelativeTime(row.created_at),
    content: row.content,
    likeCount: likeCountByPostId.get(row.id) ?? 0,
    isLikedByMe: likedPostIds.has(row.id),
    depth,
  })

  const collectReplies = (parentId: string, depth: number): QuestionReply[] => {
    const children = byParent.get(parentId) ?? []
    return children.flatMap((child) => [toReply(child, depth), ...collectReplies(child.id, depth + 1)])
  }

  const topLevel = byParent.get(null) ?? []
  // 미해결/해결 게시글은 정렬 기준이 완전히 달라서(좋아요·제출시각 vs 해결시각) 한 배열에
  // 섞은 채로 비교 함수 하나로 처리하면 비교 함수가 추이성을 잃어 Array.sort 결과가
  // 불안정해짐 - 두 그룹으로 나눠 각자 정렬한 뒤 합침(필터 탭이 어차피 나눠서 보여주므로
  // 두 그룹 사이의 상대 순서는 의미 없음).
  const unresolved = topLevel.filter((row) => row.status !== 'resolved')
  const resolved = topLevel.filter((row) => row.status === 'resolved')

  // 미해결: 좋아요 개수 내림차순, 동률이면 제출 시각 최신순(최근 제출일수록 위).
  unresolved.sort((a, b) => {
    const likeDiff = (likeCountByPostId.get(b.id) ?? 0) - (likeCountByPostId.get(a.id) ?? 0)
    if (likeDiff !== 0) return likeDiff
    return b.created_at.localeCompare(a.created_at)
  })
  // 해결됨: 해결된 시각 내림차순(최근에 해결될수록 위).
  resolved.sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''))

  const sortedTopLevel = [...unresolved, ...resolved]

  return sortedTopLevel.map((row): Question => ({
    id: row.id,
    authorName: resolvePostAuthorName(row),
    authorRole: postAuthorRole(row),
    postType: row.type,
    isEditable: row.is_mine,
    canDelete: canDelete(row),
    createdAt: formatRelativeTime(row.created_at),
    createdAtRaw: row.created_at,
    resolvedAtRaw: row.resolved_at,
    content: row.content,
    likeCount: likeCountByPostId.get(row.id) ?? 0,
    isLikedByMe: likedPostIds.has(row.id),
    isResolved: row.status === 'resolved',
    replies: collectReplies(row.id, 0),
  }))
}

const FEEDBACK_LABELS: Record<FeedbackKey, string> = { cold: '추워요', hot: '더워요', quiet: '소리가 작아요', unclear: '잘 안 보여요' }
const FEEDBACK_KEYS: FeedbackKey[] = ['cold', 'hot', 'quiet', 'unclear']

async function getFeedbackOptionsFromDb(lectureId: string): Promise<FeedbackOption[]> {
  const { data: sessionData } = await supabase.auth.getSession()
  const isLoggedIn = Boolean(sessionData.session?.user.id)
  const voterKey = await getCurrentVoterKey()

  const [{ data: counts, error: countsError }, { data: myVotes, error: myVotesError }] = await Promise.all([
    supabase.from('lecture_feedback_votes_counts').select('feedback_type, like_count, dislike_count').eq('lecture_id', lectureId),
    withGuestHeader(
      supabase.from('lecture_feedback_votes').select('feedback_type, value').eq('lecture_id', lectureId).eq('voter_key', voterKey),
      isLoggedIn,
    ),
  ])

  if (countsError) throw countsError
  if (myVotesError) throw myVotesError

  const countByType = new Map((counts ?? []).map((row) => [row.feedback_type as FeedbackKey, { likeCount: row.like_count as number, dislikeCount: row.dislike_count as number }]))
  const myLikedTypes = new Set((myVotes ?? []).filter((row) => row.value === 1).map((row) => row.feedback_type as FeedbackKey))
  const myDislikedTypes = new Set((myVotes ?? []).filter((row) => row.value === -1).map((row) => row.feedback_type as FeedbackKey))

  return FEEDBACK_KEYS.map((key) => ({
    key,
    label: FEEDBACK_LABELS[key],
    likeCount: countByType.get(key)?.likeCount ?? 0,
    dislikeCount: countByType.get(key)?.dislikeCount ?? 0,
    myLiked: myLikedTypes.has(key),
    myDisliked: myDislikedTypes.has(key),
  }))
}

function isAnsweredByLecturer(question: Question): boolean {
  return question.replies.some((reply) => reply.authorRole === 'lecturer')
}

/** posts 트리거가 브로드캐스트하는 post_change 페이로드(DB_DESIGN.md의 broadcast_post_change 참고). */
export interface PostChangePayload {
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  id: string
  lecture_id: string
  parent_id: string | null
  author_display_name?: string | null
  is_anonymous?: boolean
  type?: PostType
  status?: 'unresolved' | 'resolved' | null
  resolved_at?: string | null
  content?: string
  created_at?: string
  created_mode?: DbMode
}

export interface LikeChangePayload {
  post_id: string
  like_count: number
}

export interface FeedbackChangePayload {
  feedback_type: FeedbackKey
  like_count: number
  dislike_count: number
}

export interface LectureUpdatedPayload {
  id: string
  name: string
}

export interface LectureDetailsUpdatedPayload {
  id: string
  start_time: string
  end_time: string
  location: string | null
  max_participants: number | null
}

interface RoomBroadcastHandlers {
  onPostChange: (payload: PostChangePayload) => void
  onLikeChange: (payload: LikeChangePayload) => void
  onFeedbackChange: (payload: FeedbackChangePayload) => void
  onLectureUpdated: (payload: LectureUpdatedPayload) => void
  onLectureDetailsUpdated: (payload: LectureDetailsUpdatedPayload) => void
  onParticipantCount: (count: number) => void
  /**
   * 이 채널 구독 시점에 정원이 이미 다 찼는지(=track() 여부) 딱 한 번 알려줍니다.
   * 이후 인원 변동으로 count가 capacity에 도달/초과해도 다시 호출되지 않습니다 -
   * "입장 가능 여부"는 입장 시점에만 판단하고, 이미 들어와 있는 사람을 나중에
   * 강제로 내쫓지는 않기 위함입니다.
   */
  onAdmissionDecided: (admitted: boolean) => void
}

/**
 * 강의실 실시간 채널(`lecture:<lectureId>`) 구독 - 브로드캐스트(질문/답글, 좋아요, 실시간
 * 피드백, 강의 제목/일정)와 Presence(접속자 수)를 하나의 채널로 처리합니다.
 *
 * 반드시 한 채널이어야 함: 같은 웹소켓에서 같은 토픽으로 두 번째 join이 들어오면 Realtime
 * 서버가 먼저 붙어 있던 채널을 닫아버리므로, Presence용/브로드캐스트용 채널을 따로 만들면
 * 먼저 열린 쪽이 조용히 죽습니다(접속자 수가 0으로 고정되던 버그의 원인).
 *
 * `capacity`(`lectures.max_participants`)는 강의실 입장 자체를 막는 값이 아닙니다 -
 * Presence는 웹소켓 채널 상태일 뿐이라 "이 채널에 등록 안 하고 그냥 페이지 정보만
 * 요청하는" 접근을 DB/서버 차원에서 막을 방법이 없고(막을 필요도 없음), 그러니 입장
 * 자체를 강제하는 건 애초에 의미가 없습니다. 대신 "실시간 집계에 반영되는(=track되는)
 * 인원의 최대치"로 정의합니다 - 구독 시점 인원이 이미 정원이면 이 사람은 그냥
 * track()하지 않고 관전만 합니다(페이지 이용 자체는 평소와 동일, 접속자 수 카운트에만
 * 안 잡힘). 그래서 표시되는 참여자 수는 항상 `capacity`를 넘지 않습니다.
 *
 * 반환값을 호출해 구독을 해제합니다.
 */
export function subscribeToRoomChannel(lectureId: string, capacity: number | null, handlers: RoomBroadcastHandlers): () => void {
  let cancelled = false
  let hasDecided = false
  let channel: ReturnType<typeof supabase.channel> | null = null

  void (async () => {
    const presenceKey = await getCurrentVoterKey()
    if (cancelled) return

    channel = supabase.channel(`lecture:${lectureId}`, {
      config: { presence: { key: presenceKey } },
    })

    channel
      .on('broadcast', { event: 'post_change' }, ({ payload }) => handlers.onPostChange(payload as PostChangePayload))
      .on('broadcast', { event: 'like_change' }, ({ payload }) => handlers.onLikeChange(payload as LikeChangePayload))
      .on('broadcast', { event: 'feedback_change' }, ({ payload }) => handlers.onFeedbackChange(payload as FeedbackChangePayload))
      .on('broadcast', { event: 'lecture_updated' }, ({ payload }) => handlers.onLectureUpdated(payload as LectureUpdatedPayload))
      .on('broadcast', { event: 'lecture_details_updated' }, ({ payload }) => handlers.onLectureDetailsUpdated(payload as LectureDetailsUpdatedPayload))
      .on('presence', { event: 'sync' }, () => {
        if (cancelled || !channel) return
        const count = Object.keys(channel.presenceState()).length
        handlers.onParticipantCount(count)

        if (!hasDecided) {
          hasDecided = true
          const isFull = capacity != null && count >= capacity
          if (!isFull) void channel.track({ joined_at: new Date().toISOString() })
          handlers.onAdmissionDecided(!isFull)
        }
      })
      .subscribe()
  })()

  return () => {
    cancelled = true
    if (channel) {
      void channel.untrack()
      void supabase.removeChannel(channel)
    }
  }
}

function collectAllCourses(folders: CourseFolder[], rootCourses: Course[]): Course[] {
  const collected: Course[] = [...rootCourses]
  const visit = (folder: CourseFolder): void => {
    collected.push(...folder.courses)
    folder.children.forEach(visit)
  }
  folders.forEach(visit)
  return collected
}

function findUnansweredInCourses(
  courses: Course[],
  questionsByCourseId: Map<string, Question[]>,
): Array<{ id: string; title: string; questions: UnansweredQuestion[] }> {
  const groups: Array<{ id: string; title: string; questions: UnansweredQuestion[] }> = []

  for (const course of courses) {
    const roomQuestions = mockCourseRooms[course.id]?.questions ?? questionsByCourseId.get(course.id) ?? []

    const questions = roomQuestions
      .filter((question) => question.postType === 'question' && !isAnsweredByLecturer(question))
      .map((question) => ({ ...question, courseId: course.id, courseTitle: course.title }))

    if (questions.length > 0) groups.push({ id: course.id, title: course.title, questions })
  }

  return groups
}

function buildUnansweredTree(folders: CourseFolder[], questionsByCourseId: Map<string, Question[]>): UnansweredFolderNode[] {
  const nodes: UnansweredFolderNode[] = []

  for (const folder of folders) {
    const courses = findUnansweredInCourses(folder.courses, questionsByCourseId)
    const children = buildUnansweredTree(folder.children, questionsByCourseId)
    const count = courses.reduce((sum, group) => sum + group.questions.length, 0) + children.reduce((sum, child) => sum + child.count, 0)

    if (count > 0) nodes.push({ id: folder.id, name: folder.name, count, children, courses })
  }

  return nodes
}

/** 강의자의 모든 강의에서 강의자 본인이 아직 답변하지 않은 '질문' 유형 게시글만 폴더 구조로 모아 반환합니다. */
export async function getUnansweredQuestions(): Promise<{ folders: UnansweredFolderNode[]; standaloneCourses: Array<{ id: string; title: string; questions: UnansweredQuestion[] }>; totalCount: number }> {
  const userId = await requireAuthUserId()
  const { folders: activeFolders, rootCourses } = await getInstructorDataset(userId)

  const dbCourses = collectAllCourses(activeFolders, rootCourses).filter((course) => !mockCourseRooms[course.id])
  const questionLists = await Promise.all(dbCourses.map((course) => getQuestionsFromDb(course.id)))
  const questionsByCourseId = new Map(dbCourses.map((course, index) => [course.id, questionLists[index]]))

  const folders = buildUnansweredTree(activeFolders, questionsByCourseId)
  const standaloneCourses = findUnansweredInCourses(rootCourses, questionsByCourseId)
  const totalCount = folders.reduce((sum, folder) => sum + folder.count, 0) + standaloneCourses.reduce((sum, group) => sum + group.questions.length, 0)

  return { folders, standaloneCourses, totalCount }
}

/** AI 교정(ai-correct Edge Function)을 호출합니다. 실패해도 에러를 던지지 않고 원문을 그대로 돌려줍니다. */
export async function refineWithAi(content: string): Promise<string> {
  const headers = await guestHeaderIfNeeded()
  const { data, error } = await supabase.functions.invoke<{ corrected: string }>('ai-correct', {
    body: { content },
    headers,
  })
  if (error || !data) return content
  return data.corrected
}

/** 요청에 회원이면 아무것도, 비회원이면 x-guest-token 헤더를 붙인 쿼리 빌더를 반환합니다. */
function withGuestHeader<T extends { setHeader: (name: string, value: string) => T }>(query: T, isLoggedIn: boolean): T {
  return isLoggedIn ? query : query.setHeader('x-guest-token', getGuestToken())
}

/** 로그인 상태면 빈 헤더, 비회원이면 x-guest-token 헤더를 담은 객체를 돌려줍니다(Edge Function 호출용). */
async function guestHeaderIfNeeded(): Promise<Record<string, string>> {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session?.user.id) return {}
  return { 'x-guest-token': getGuestToken() }
}

interface SubmitPostFunctionResponse {
  result: 'created' | 'rejected' | 'similar_found'
  post?: { id: string; content: string; status: 'unresolved' | 'resolved' | null; created_at: string }
  reason?: string
  draft_id?: string
  similar_id?: string
}

/** submit-post Edge Function의 non-2xx 응답 본문을 파싱합니다(FunctionsHttpError는 원본 Response를 context로 담아 던짐). */
async function parseFunctionsHttpError(error: unknown): Promise<SubmitPostFunctionResponse | null> {
  if (!(error instanceof Error) || error.name !== 'FunctionsHttpError') return null
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) return null
  try {
    return await context.json()
  } catch {
    return null
  }
}

/**
 * 글 작성(새 질문/의견/답글)을 submit-post Edge Function으로 제출합니다.
 * 적절성 검사 → (질문 타입이면) 유사 질문 탐지 → 저장까지 서버에서 한 번에 처리합니다.
 */
async function submitPostToServer(
  lectureId: string,
  parentId: string | null,
  submission: ComposerSubmission,
): Promise<{ postId: string; createdAt: string; status: 'unresolved' | 'resolved' | null } | { similarFound: true; draftId: string; similarId: string }> {
  const createdMode: DbMode = isPrivilegedEditor() ? 'lecturer' : 'student'
  const isAnonymous = isPrivilegedEditor() ? false : submission.isAnonymous
  const headers = await guestHeaderIfNeeded()

  const { data, error } = await supabase.functions.invoke<SubmitPostFunctionResponse>('submit-post', {
    body: {
      lecture_id: lectureId,
      parent_id: parentId,
      type: submission.postType,
      content: submission.content,
      created_mode: createdMode,
      is_anonymous: isAnonymous,
    },
    headers,
  })

  if (error) {
    const parsed = await parseFunctionsHttpError(error)
    if (parsed?.result === 'rejected') throw new Error(parsed.reason ?? '부적절한 내용이 감지되었습니다.')
    if (parsed?.result === 'similar_found' && parsed.draft_id && parsed.similar_id) {
      return { similarFound: true, draftId: parsed.draft_id, similarId: parsed.similar_id }
    }
    throw new Error(parsed?.reason ?? '등록하지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
  if (!data?.post) throw new Error('등록하지 못했습니다. 잠시 후 다시 시도해주세요.')

  return { postId: data.post.id, createdAt: data.post.created_at, status: data.post.status }
}

/** "그래도 제출"(유사 질문 무시하고 강행 제출)을 처리합니다. */
async function submitDraftToServer(draftId: string): Promise<{ postId: string; createdAt: string; status: 'unresolved' | 'resolved' | null }> {
  const headers = await guestHeaderIfNeeded()
  const { data, error } = await supabase.functions.invoke<SubmitPostFunctionResponse>('submit-post', {
    body: { draft_id: draftId },
    headers,
  })

  if (error) {
    const parsed = await parseFunctionsHttpError(error)
    throw new Error(parsed?.reason ?? '등록하지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
  if (!data?.post) throw new Error('등록하지 못했습니다. 잠시 후 다시 시도해주세요.')

  return { postId: data.post.id, createdAt: data.post.created_at, status: data.post.status }
}

function resolveAuthor(submission: ComposerSubmission): { authorName: string; authorRole: 'lecturer' | 'anonymous' | 'student' } {
  if (isPrivilegedEditor()) return { authorName: mockCurrentUser.name, authorRole: 'lecturer' }
  if (submission.isAnonymous) return { authorName: '익명', authorRole: 'anonymous' }
  return { authorName: mockCurrentUser.name, authorRole: 'student' }
}

function buildOwnQuestion(id: string, createdAt: string, status: 'unresolved' | 'resolved' | null, submission: ComposerSubmission): Question {
  const { authorName, authorRole } = resolveAuthor(submission)
  return {
    id,
    authorName,
    authorRole,
    postType: submission.postType,
    isEditable: true,
    canDelete: true,
    createdAt: formatRelativeTime(createdAt),
    createdAtRaw: createdAt,
    resolvedAtRaw: status === 'resolved' ? new Date().toISOString() : null,
    content: submission.content,
    likeCount: 0,
    isLikedByMe: false,
    isResolved: status === 'resolved',
    replies: [],
  }
}

function buildOwnReply(id: string, createdAt: string, submission: ComposerSubmission): QuestionReply {
  const { authorName, authorRole } = resolveAuthor(submission)
  return {
    id,
    authorName,
    authorRole,
    postType: submission.postType,
    isEditable: true,
    canDelete: true,
    createdAt: formatRelativeTime(createdAt),
    content: submission.content,
    likeCount: 0,
    isLikedByMe: false,
    depth: 0,
  }
}

export async function createQuestion(courseId: string, submission: ComposerSubmission): Promise<SubmitPostResult> {
  if (isPrivilegedEditor()) throw new Error('강의자는 답글만 작성할 수 있습니다.')

  const room = mockCourseRooms[courseId]
  if (room) {
    await delay(300)
    const question = buildOwnQuestion(`question-${crypto.randomUUID()}`, new Date().toISOString(), 'unresolved', submission)
    replyAuthorKeyById.set(question.id, getViewerKey())
    room.questions = [question, ...room.questions]
    return { result: 'created', post: question }
  }

  const outcome = await submitPostToServer(courseId, null, submission)
  if ('similarFound' in outcome) return { result: 'similar_found', draftId: outcome.draftId, similarId: outcome.similarId }
  return { result: 'created', post: buildOwnQuestion(outcome.postId, outcome.createdAt, outcome.status, submission) }
}

export async function createReply(courseId: string, questionId: string, submission: ComposerSubmission): Promise<SubmitPostResult> {
  const room = mockCourseRooms[courseId]
  if (room) {
    await delay(300)
    const reply = buildOwnReply(`reply-${crypto.randomUUID()}`, new Date().toISOString(), submission)
    replyAuthorKeyById.set(reply.id, getViewerKey())
    const question = room.questions.find((item) => item.id === questionId)
    if (question) question.replies = [...question.replies, reply]
    return { result: 'created', post: reply }
  }

  const outcome = await submitPostToServer(courseId, questionId, submission)
  if ('similarFound' in outcome) return { result: 'similar_found', draftId: outcome.draftId, similarId: outcome.similarId }
  return { result: 'created', post: buildOwnReply(outcome.postId, outcome.createdAt, submission) }
}

/** 유사 질문 발견 후 "그래도 제출"을 눌렀을 때 호출합니다. draft를 그대로 저장합니다. */
export async function submitDraft(draftId: string, submission: ComposerSubmission, isReply: boolean): Promise<Question | QuestionReply> {
  const outcome = await submitDraftToServer(draftId)
  return isReply ? buildOwnReply(outcome.postId, outcome.createdAt, submission) : buildOwnQuestion(outcome.postId, outcome.createdAt, outcome.status, submission)
}

/** 답글을 수정합니다. 실제로 그 답글을 작성한 본인만 수정할 수 있습니다(RLS: posts_update_own). */
export async function updateReply(courseId: string, questionId: string, replyId: string, content: string): Promise<QuestionReply> {
  const room = mockCourseRooms[courseId]
  if (room) {
    await delay(250)
    const question = room.questions.find((item) => item.id === questionId)
    const reply = question?.replies.find((item) => item.id === replyId)
    if (!reply) throw new Error('답글을 찾을 수 없습니다.')
    if (replyAuthorKeyById.get(replyId) !== getViewerKey()) throw new Error('내가 작성한 답글만 수정할 수 있습니다.')
    reply.content = content
    return clone({ ...reply, isEditable: true })
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const isLoggedIn = Boolean(sessionData.session?.user.id)
  const query = withGuestHeader(supabase.from('posts').update({ content }).eq('id', replyId), isLoggedIn)
  const { error } = await query
  if (error) throw new Error('내가 작성한 답글만 수정할 수 있습니다.')

  const { data: updated, error: fetchError } = await supabase
    .from('posts_public')
    .select('id, is_anonymous, type, created_at, created_mode')
    .eq('id', replyId)
    .single<Pick<PostPublicRow, 'id' | 'is_anonymous' | 'type' | 'created_at' | 'created_mode'>>()
  if (fetchError) throw fetchError

  return {
    id: updated.id,
    authorName: updated.is_anonymous ? '익명' : mockCurrentUser.name,
    authorRole: postAuthorRole(updated),
    postType: updated.type,
    isEditable: true,
    canDelete: true,
    createdAt: formatRelativeTime(updated.created_at),
    content,
    likeCount: 0,
    isLikedByMe: false,
    depth: 0,
  }
}

/** 최상위 질문/의견 글을 수정합니다. 실제로 그 글을 작성한 본인만 수정할 수 있습니다(RLS: posts_update_own). */
export async function updateQuestion(courseId: string, questionId: string, content: string): Promise<Question> {
  const room = mockCourseRooms[courseId]
  if (room) {
    await delay(250)
    const question = room.questions.find((item) => item.id === questionId)
    if (!question) throw new Error('질문을 찾을 수 없습니다.')
    if (replyAuthorKeyById.get(questionId) !== getViewerKey()) throw new Error('내가 작성한 글만 수정할 수 있습니다.')
    question.content = content
    return clone({ ...question, isEditable: true })
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const isLoggedIn = Boolean(sessionData.session?.user.id)
  const query = withGuestHeader(supabase.from('posts').update({ content }).eq('id', questionId), isLoggedIn)
  const { error } = await query
  if (error) throw new Error('내가 작성한 글만 수정할 수 있습니다.')

  const { data: updated, error: fetchError } = await supabase
    .from('posts_public')
    .select('id, is_anonymous, type, status, resolved_at, created_at, created_mode')
    .eq('id', questionId)
    .single<Pick<PostPublicRow, 'id' | 'is_anonymous' | 'type' | 'status' | 'resolved_at' | 'created_at' | 'created_mode'>>()
  if (fetchError) throw fetchError

  return {
    id: updated.id,
    authorName: updated.is_anonymous ? '익명' : mockCurrentUser.name,
    authorRole: postAuthorRole(updated),
    postType: updated.type,
    isEditable: true,
    canDelete: true,
    createdAt: formatRelativeTime(updated.created_at),
    createdAtRaw: updated.created_at,
    resolvedAtRaw: updated.resolved_at,
    content,
    likeCount: 0,
    isLikedByMe: false,
    isResolved: updated.status === 'resolved',
    replies: [],
  }
}

/**
 * 질문/답글을 삭제합니다. 본인 글이거나(RLS: posts_delete_own), 강의자면 자기 강의의 어떤 글이든
 * 삭제할 수 있습니다(RLS: posts_lecturer_delete). 최상위 질문을 지우면 그 답글들도 cascade로 함께 삭제됩니다.
 */
export async function deletePost(courseId: string, postId: string): Promise<void> {
  const room = mockCourseRooms[courseId]
  if (room) {
    await delay(200)
    const question = room.questions.find((item) => item.id === postId)
    if (question) {
      room.questions = room.questions.filter((item) => item.id !== postId)
      return
    }
    for (const item of room.questions) {
      const before = item.replies.length
      item.replies = item.replies.filter((reply) => reply.id !== postId)
      if (item.replies.length !== before) return
    }
    throw new Error('삭제할 글을 찾을 수 없습니다.')
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const isLoggedIn = Boolean(sessionData.session?.user.id)
  const { data: deleted, error } = await withGuestHeader(supabase.from('posts').delete().eq('id', postId), isLoggedIn).select('id')
  if (error) throw new Error('삭제 권한이 없습니다.')
  if (!deleted || deleted.length === 0) throw new Error('삭제 권한이 없습니다.')
}

export async function toggleQuestionLike(courseId: string, questionId: string): Promise<{ likeCount: number; isLikedByMe: boolean }> {
  const room = mockCourseRooms[courseId]
  if (room) {
    await delay(150)
    const question = room.questions.find((item) => item.id === questionId)
    if (!question) throw new Error('질문을 찾을 수 없습니다.')
    const likes = getQuestionLikes(getViewerKey())
    const isLikedByMe = !likes.has(questionId)
    if (isLikedByMe) likes.add(questionId)
    else likes.delete(questionId)
    question.likeCount += isLikedByMe ? 1 : -1
    return { likeCount: question.likeCount, isLikedByMe }
  }

  return togglePostLike(questionId)
}

async function togglePostLike(postId: string): Promise<{ likeCount: number; isLikedByMe: boolean }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const isLoggedIn = Boolean(sessionData.session?.user.id)
  const voterKey = await getCurrentVoterKey()

  const { data: existing, error: existingError } = await withGuestHeader(
    supabase.from('post_likes').select('post_id').eq('post_id', postId).eq('voter_key', voterKey),
    isLoggedIn,
  ).maybeSingle()
  if (existingError) throw existingError

  if (existing) {
    const { error } = await withGuestHeader(supabase.from('post_likes').delete().eq('post_id', postId).eq('voter_key', voterKey), isLoggedIn)
    if (error) throw error
  } else {
    const { error } = await withGuestHeader(supabase.from('post_likes').insert({ post_id: postId, voter_key: voterKey }), isLoggedIn)
    if (error) throw error
  }

  const { data: countRow, error: countError } = await supabase.from('post_likes_counts').select('like_count').eq('post_id', postId).maybeSingle<{ like_count: number }>()
  if (countError) throw countError

  return { likeCount: countRow?.like_count ?? 0, isLikedByMe: !existing }
}

/** 강의자가 질문의 해결 여부를 전환합니다(RLS: posts_lecturer_update_status). */
export async function resolveQuestion(courseId: string, questionId: string): Promise<{ isResolved: boolean; resolvedAtRaw: string | null }> {
  if (!isPrivilegedEditor()) throw new Error('강의자만 질문을 해결 처리할 수 있습니다.')

  const room = mockCourseRooms[courseId]
  if (room) {
    await delay(200)
    const question = room.questions.find((item) => item.id === questionId)
    if (!question) throw new Error('질문을 찾을 수 없습니다.')
    question.isResolved = !question.isResolved
    return { isResolved: question.isResolved, resolvedAtRaw: question.isResolved ? new Date().toISOString() : null }
  }

  const { data: current, error: currentError } = await supabase.from('posts_public').select('status').eq('id', questionId).single<{ status: 'unresolved' | 'resolved' | null }>()
  if (currentError) throw currentError

  const nextStatus = current.status === 'resolved' ? 'unresolved' : 'resolved'
  const { data: updated, error } = await supabase.from('posts').update({ status: nextStatus }).eq('id', questionId).select('resolved_at').single<{ resolved_at: string | null }>()
  if (error) throw error

  return { isResolved: nextStatus === 'resolved', resolvedAtRaw: updated.resolved_at }
}

export async function toggleFeedback(courseId: string, key: FeedbackKey, vote: 'like' | 'dislike'): Promise<CourseRoom> {
  if (isPrivilegedEditor()) throw new Error('강의자는 실시간 피드백에 투표할 수 없습니다.')

  const room = mockCourseRooms[courseId]
  if (room) {
    await delay(150)
    const option = room.feedbackOptions.find((item) => item.key === key)
    if (!option) throw new Error('피드백 항목을 찾을 수 없습니다.')

    const votes = getFeedbackVotes(getViewerKey())
    const hadVote = votes.get(key)?.has(vote) ?? false

    if (hadVote) {
      if (vote === 'like') option.likeCount -= 1
      else option.dislikeCount -= 1
      votes.get(key)?.delete(vote)
    } else {
      if (vote === 'like') option.likeCount += 1
      else option.dislikeCount += 1
      if (!votes.has(key)) votes.set(key, new Set())
      votes.get(key)?.add(vote)
    }

    return clone(applyViewerVotes(room, getViewerKey()))
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const isLoggedIn = Boolean(sessionData.session?.user.id)
  const voterKey = await getCurrentVoterKey()
  const value = vote === 'like' ? 1 : -1

  const { data: existing, error: existingError } = await withGuestHeader(
    supabase.from('lecture_feedback_votes').select('value').eq('lecture_id', courseId).eq('feedback_type', key).eq('voter_key', voterKey).eq('value', value),
    isLoggedIn,
  ).maybeSingle()
  if (existingError) throw existingError

  if (existing) {
    const { error } = await withGuestHeader(
      supabase.from('lecture_feedback_votes').delete().eq('lecture_id', courseId).eq('feedback_type', key).eq('voter_key', voterKey).eq('value', value),
      isLoggedIn,
    )
    if (error) throw error
  } else {
    const { error } = await withGuestHeader(
      supabase.from('lecture_feedback_votes').insert({ lecture_id: courseId, feedback_type: key, voter_key: voterKey, value }),
      isLoggedIn,
    )
    if (error) throw error
  }

  const meta = await getCourseRoomFromDb(courseId)
  const feedbackOptions = await getFeedbackOptionsFromDb(courseId)
  const questions = await getQuestionsFromDb(courseId)
  return { ...meta, feedbackOptions, questions }
}

/** 강의자가 실시간 피드백 항목을 확인/반영 처리하여 해당 항목의 집계를 초기화합니다(RLS: lecture_feedback_votes_lecturer_reset). */
export async function resetFeedbackOption(courseId: string, key: FeedbackKey): Promise<CourseRoom> {
  if (!isPrivilegedEditor()) throw new Error('강의자만 피드백을 초기화할 수 있습니다.')

  const room = mockCourseRooms[courseId]
  if (room) {
    await delay(150)
    const option = room.feedbackOptions.find((item) => item.key === key)
    if (!option) throw new Error('피드백 항목을 찾을 수 없습니다.')
    option.likeCount = 0
    option.dislikeCount = 0
    for (const votes of feedbackVotesByUser.values()) votes.delete(key)
    return clone(applyViewerVotes(room, getViewerKey()))
  }

  const { data: deleted, error } = await supabase
    .from('lecture_feedback_votes')
    .delete()
    .eq('lecture_id', courseId)
    .eq('feedback_type', key)
    .select('lecture_id')
  if (error) throw error
  if (!deleted || deleted.length === 0) throw new Error('피드백 초기화에 실패했습니다. 잠시 후 다시 시도해주세요.')

  const meta = await getCourseRoomFromDb(courseId)
  const feedbackOptions = await getFeedbackOptionsFromDb(courseId)
  const questions = await getQuestionsFromDb(courseId)
  return { ...meta, feedbackOptions, questions }
}
