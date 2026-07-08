export type ItemColor = 'purple' | 'blue'
export type FolderOwnership = 'owned' | 'registered'

export interface Course {
  id: string
  title: string
  questionCount: number
  updatedAt?: string
  color: ItemColor
  ownership: FolderOwnership
  /** 등록(즐겨찾기)한 서브트리의 최상위(덩어리 루트)인지. 이 노드만 통째로 이동 가능하고, 서브트리 내부 노드는 개별 이동 불가. owned 항목엔 무의미. */
  isFavoriteRoot?: boolean
  date?: string
  startTime?: string
  endTime?: string
  location?: string
  capacity?: number | null
  joinCode?: string
}

export interface CourseFolder {
  id: string
  name: string
  ownership: FolderOwnership
  /** 등록(즐겨찾기)한 서브트리의 최상위(덩어리 루트)인지. 이 폴더만 통째로 이동 가능하고, 내부 하위 폴더는 개별 이동 불가. owned 항목엔 무의미. */
  isFavoriteRoot?: boolean
  expandedByDefault?: boolean
  children: CourseFolder[]
  courses: Course[]
}

export type SortOrder = 'created' | 'alphabetical'

export interface CreateFolderInput {
  name: string
  parentId?: string | null
}

export interface CreateCourseInput {
  title: string
  folderId?: string | null
  date: string
  startTime: string
  endTime: string
  location?: string
  capacity?: number | null
}

export interface UpdateCourseInput {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  location?: string
  capacity?: number | null
}

export type TreeItemType = 'folder' | 'course'

export interface MoveItemInput {
  itemId: string
  itemType: TreeItemType
  targetFolderId: string | null
}

export interface RenameItemInput {
  itemId: string
  itemType: TreeItemType
  name: string
}

export interface DeleteItemInput {
  itemId: string
  itemType: TreeItemType
}
