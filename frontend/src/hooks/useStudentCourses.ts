import { useCallback, useEffect, useState } from 'react'
import {
  createCourse,
  createRootFolder,
  deleteCourseItem,
  getCourseFolders,
  getCurrentUser,
  getStandaloneCourses,
  moveCourseItem,
  registerCourseByCode,
  renameCourseItem,
  updateCourse,
} from '../services/api'
import type { Course, CourseFolder, CreateCourseInput, DeleteItemInput, MoveItemInput, RenameItemInput, SortOrder, UpdateCourseInput } from '../types/course'
import type { User } from '../types/user'

interface StudentCoursesState {
  user: User | null
  folders: CourseFolder[]
  courses: Course[]
  isLoading: boolean
  error: string | null
}

export function useStudentCourses() {
  const [state, setState] = useState<StudentCoursesState>({
    user: null,
    folders: [],
    courses: [],
    isLoading: true,
    error: null,
  })
  const [sortOrder, setSortOrder] = useState<SortOrder>('created')

  const load = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }))

    try {
      const [user, folders, courses] = await Promise.all([
        getCurrentUser(),
        getCourseFolders(),
        getStandaloneCourses(),
      ])
      setState({ user, folders, courses, isLoading: false, error: null })
    } catch {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: '강의 목록을 불러오지 못했습니다.',
      }))
    }
  }, [])

  const refresh = useCallback(async () => {
    const [folders, courses] = await Promise.all([getCourseFolders(), getStandaloneCourses()])
    setState((current) => ({ ...current, folders, courses }))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const addFolder = async (name: string, parentId?: string | null): Promise<CourseFolder> => {
    const folder = await createRootFolder({ name, parentId })
    await refresh()
    return folder
  }

  const addCourse = async (input: CreateCourseInput): Promise<Course> => {
    const course = await createCourse(input)
    await refresh()
    return course
  }

  const editCourse = async (input: UpdateCourseInput): Promise<Course> => {
    const course = await updateCourse(input)
    await refresh()
    return course
  }

  const registerCourse = async (code: string): Promise<void> => {
    await registerCourseByCode(code)
    await refresh()
  }

  const moveItem = async (input: MoveItemInput): Promise<void> => {
    await moveCourseItem(input)
    await refresh()
  }

  const renameItem = async (input: RenameItemInput): Promise<void> => {
    await renameCourseItem(input)
    await refresh()
  }

  const deleteItem = async (input: DeleteItemInput): Promise<void> => {
    await deleteCourseItem(input)
    await refresh()
  }

  const sortCourses = (courses: Course[]): Course[] =>
    sortOrder === 'alphabetical' ? [...courses].sort((a, b) => a.title.localeCompare(b.title, 'ko')) : courses

  const sortFolders = (folders: CourseFolder[]): CourseFolder[] => {
    const ordered = sortOrder === 'alphabetical' ? [...folders].sort((a, b) => a.name.localeCompare(b.name, 'ko')) : folders
    return ordered.map((folder) => ({
      ...folder,
      children: sortFolders(folder.children),
      courses: sortCourses(folder.courses),
    }))
  }

  return {
    ...state,
    folders: sortFolders(state.folders),
    courses: sortCourses(state.courses),
    sortOrder,
    setSortOrder,
    addFolder,
    addCourse,
    editCourse,
    registerCourse,
    moveItem,
    renameItem,
    deleteItem,
    reload: load,
  }
}
