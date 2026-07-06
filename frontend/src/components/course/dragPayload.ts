import type { TreeItemType } from '../../types/course'

export interface DragPayload {
  itemId: string
  itemType: TreeItemType
}

export const DRAG_MIME = 'application/x-qroom-item'
