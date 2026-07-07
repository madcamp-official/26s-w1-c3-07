export type UserRole = 'student' | 'instructor'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatarText: string
}
