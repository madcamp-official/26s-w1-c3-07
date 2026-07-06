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
}

export interface CreateCourseInput {
  title: string
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
