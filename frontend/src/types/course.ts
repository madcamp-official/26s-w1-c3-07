export type ItemColor = 'purple' | 'blue'
export type FolderOwnership = 'owned' | 'registered'

export interface Course {
  id: string
  title: string
  participantCount: number
  questionCount: number
  updatedAt?: string
  color: ItemColor
  ownership: FolderOwnership
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
