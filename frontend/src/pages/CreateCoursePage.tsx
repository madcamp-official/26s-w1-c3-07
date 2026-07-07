import { ArrowLeft, ArrowRight, Calendar, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { useStudentCourses } from '../hooks/useStudentCourses'
import type { Course, CourseFolder } from '../types/course'

function flattenFolders(folders: CourseFolder[], depth = 0): Array<{ folder: CourseFolder; depth: number }> {
  return folders.flatMap((folder) => [{ folder, depth }, ...flattenFolders(folder.children, depth + 1)])
}

function findCourseById(folders: CourseFolder[], rootCourses: Course[], id: string): Course | null {
  const fromRoot = rootCourses.find((course) => course.id === id)
  if (fromRoot) return fromRoot

  for (const folder of folders) {
    const fromFolder = folder.courses.find((course) => course.id === id)
    if (fromFolder) return fromFolder
    const fromChildren = findCourseById(folder.children, [], id)
    if (fromChildren) return fromChildren
  }
  return null
}

export default function CreateCoursePage() {
  const navigate = useNavigate()
  const { courseId } = useParams<{ courseId: string }>()
  const isEditMode = Boolean(courseId)
  const { folders, courses, isLoading, addCourse, editCourse } = useStudentCourses()
  const [title, setTitle] = useState('')
  const [folderId, setFolderId] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [capacity, setCapacity] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [isUpdated, setIsUpdated] = useState(false)

  useEffect(() => {
    if (!isEditMode || !courseId || isLoading) return
    const course = findCourseById(folders, courses, courseId)
    if (!course) return
    setTitle(course.title)
    setDate(course.date ?? '')
    setStartTime(course.startTime ?? '')
    setEndTime(course.endTime ?? '')
    setLocation(course.location ?? '')
    setCapacity(course.capacity ? String(course.capacity) : '')
  }, [isEditMode, courseId, isLoading, folders, courses])

  const flatFolders = flattenFolders(folders.filter((folder) => folder.ownership === 'owned'))
  const isValid = Boolean(title.trim() && date && startTime && endTime)

  const handleSubmit = async () => {
    if (!isValid) return
    setError('')
    setIsSubmitting(true)
    try {
      if (isEditMode && courseId) {
        await editCourse({
          id: courseId,
          title: title.trim(),
          date,
          startTime,
          endTime,
          location: location.trim() || undefined,
          capacity: capacity ? Number(capacity) : null,
        })
        setIsUpdated(true)
        window.setTimeout(() => navigate('/student/courses'), 1200)
      } else {
        const course = await addCourse({
          title: title.trim(),
          folderId: folderId || null,
          date,
          startTime,
          endTime,
          location: location.trim() || undefined,
          capacity: capacity ? Number(capacity) : null,
        })
        navigate('/student/courses', { state: { shareCourseId: course.id } })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEditMode ? '강의를 수정하지 못했습니다.' : '강의를 만들지 못했습니다.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/student/courses')} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="뒤로 가기">
            <ArrowLeft className="size-5" />
          </button>
          <span className="text-slate-200">|</span>
          <h1 className="text-xl font-extrabold text-slate-900">{isEditMode ? '강의 수정' : '강의 만들기'}</h1>
        </div>
        {isEditMode ? (
          <span className="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-amber-700">수정 중</span>
        ) : (
          <div className="flex items-center gap-3 text-sm font-bold">
            <span className="grid size-8 place-items-center rounded-full bg-violet-600 text-white">1</span>
            <span className="h-px w-10 bg-slate-200" />
            <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-slate-400">2</span>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <h2 className="text-2xl font-extrabold text-slate-900">기본 정보</h2>
        <p className="mt-1 text-slate-400">강의의 기본 정보를 입력해 주세요.</p>

        <div className="mt-8 divide-y divide-slate-100 rounded-3xl border border-slate-100 bg-white px-6 shadow-sm sm:px-8">
          <div className="py-6">
            <label className="mb-2 block font-bold text-slate-800">강의 제목 <span className="text-rose-500">*</span></label>
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 트리와 그래프 탐색 알고리즘"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </div>

          {!isEditMode && (
            <div className="py-6">
              <label className="mb-2 block font-bold text-slate-800">폴더 (선택)</label>
              <select
                value={folderId}
                onChange={(event) => setFolderId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              >
                <option value="">최상위 (폴더 없음)</option>
                {flatFolders.map(({ folder, depth }) => (
                  <option key={folder.id} value={folder.id}>{'　'.repeat(depth)}{folder.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="py-6">
            <label className="mb-2 block font-bold text-slate-800">강의 날짜 <span className="text-rose-500">*</span></label>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 focus-within:border-violet-500 focus-within:ring-4 focus-within:ring-violet-100">
              <Calendar className="size-5 shrink-0 text-violet-400" />
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full outline-none" />
            </div>
          </div>

          <div className="py-6">
            <label className="mb-2 block font-bold text-slate-800">강의 시간 <span className="text-rose-500">*</span></label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-400">시작</span>
                <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
              </div>
              <span className="mt-5 text-slate-300">→</span>
              <div className="flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-400">종료</span>
                <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100" />
              </div>
            </div>
          </div>

          <div className="py-6">
            <label className="mb-2 block font-bold text-slate-800">강의 장소</label>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="예: 공학관 301호, 온라인 (Zoom)"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </div>

          <div className="py-6">
            <label className="mb-2 block font-bold text-slate-800">최대 참여 인원</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                placeholder="제한 없음"
                className="w-full max-w-xs rounded-2xl border border-slate-200 px-4 py-3 outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              />
              <span className="font-bold text-slate-500">명</span>
            </div>
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-medium text-rose-500">{error}</p>}

        {isUpdated && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="size-5" />강의가 업데이트되었습니다!
          </p>
        )}

        <div className="mt-8 flex justify-between">
          {isEditMode ? (
            <Button variant="secondary" onClick={() => navigate('/student/courses')}><ArrowLeft className="size-4" />이전</Button>
          ) : <span />}
          <Button onClick={() => void handleSubmit()} disabled={!isValid || isSubmitting} className="px-8">
            {isSubmitting ? (isEditMode ? '수정하는 중' : '만드는 중') : (isEditMode ? '업데이트' : '다음')}
            {!isSubmitting && !isEditMode && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
