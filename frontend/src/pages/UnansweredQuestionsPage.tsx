import { ChevronDown, ChevronRight, Folder, MessageCircleQuestion, RotateCcw, ThumbsUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import { getUnansweredQuestions } from '../services/api'
import type { UnansweredFolderNode, UnansweredQuestion } from '../types/room'

interface UnansweredData {
  folders: UnansweredFolderNode[]
  standaloneCourses: Array<{ id: string; title: string; questions: UnansweredQuestion[] }>
  totalCount: number
}

function QuestionRow({ question, onOpen }: { question: UnansweredQuestion; onOpen: (courseId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(question.courseId)}
      className="flex w-full items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-white px-5 py-4 text-left transition hover:border-violet-200 hover:shadow-sm"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-slate-800">{question.content}</span>
        <span className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
          <ThumbsUp className="size-3.5" />{question.likeCount}
          <span>{question.authorName}</span>
          <span>·</span>
          <span>{question.createdAt}</span>
        </span>
      </span>
    </button>
  )
}

function CourseGroup({ course, onOpen }: { course: { id: string; title: string; questions: UnansweredQuestion[] }; onOpen: (courseId: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const Chevron = isExpanded ? ChevronDown : ChevronRight

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl py-2 pr-3 hover:bg-white">
        <button type="button" onClick={() => setIsExpanded((current) => !current)} className="flex flex-1 items-center gap-2 text-left font-bold text-slate-700">
          <Chevron className="size-4 text-slate-300" />
          <MessageCircleQuestion className="size-4 text-violet-500" />
          <span>{course.title}</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{course.questions.length}개</span>
        </button>
        <button type="button" onClick={() => onOpen(course.id)} className="text-xs font-bold text-violet-500 hover:text-violet-700">강의실 바로가기</button>
      </div>
      {isExpanded && (
        <div className="ml-6 mt-1 space-y-2 border-l border-slate-100 pl-4">
          {course.questions.map((question) => <QuestionRow key={question.id} question={question} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  )
}

function FolderGroup({ folder, depth, onOpen }: { folder: UnansweredFolderNode; depth: number; onOpen: (courseId: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const Chevron = isExpanded ? ChevronDown : ChevronRight

  return (
    <div className={depth > 0 ? 'ml-6' : ''}>
      <button type="button" onClick={() => setIsExpanded((current) => !current)} className="flex items-center gap-2 rounded-xl py-2 pr-3 text-left font-bold text-slate-900 hover:bg-white">
        <Chevron className="size-4 text-slate-300" />
        <Folder className="size-5 text-violet-500" />
        <span>{folder.name}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{folder.count}개</span>
      </button>
      {isExpanded && (
        <div className="ml-6 mt-1 space-y-3">
          {folder.courses.map((course) => <CourseGroup key={course.id} course={course} onOpen={onOpen} />)}
          {folder.children.map((child) => <FolderGroup key={child.id} folder={child} depth={depth + 1} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  )
}

export default function UnansweredQuestionsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<UnansweredData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setIsLoading(true)
    setError(null)
    getUnansweredQuestions()
      .then(setData)
      .catch(() => setError('미답변 질문을 불러오지 못했습니다.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(load, [])

  const openCourse = (courseId: string) => navigate(`/room/${courseId}`)

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center"><div className="size-10 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" aria-label="미답변 질문 불러오는 중" /></div>
  }

  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div><p className="font-bold text-slate-700">{error}</p><Button onClick={load} className="mt-4"><RotateCcw className="size-4" />다시 시도</Button></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white px-4 py-5 sm:px-6 xl:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400">모든 강의 · 미답변</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">미답변 질문</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700">
              <MessageCircleQuestion className="size-4" />{data.totalCount}개 미답변
            </span>
            <Button variant="secondary" onClick={() => navigate('/courses')}>내 강의</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6 xl:px-10">
        {data.totalCount === 0 ? (
          <p className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm font-medium text-slate-400">모든 질문에 답변했습니다.</p>
        ) : (
          <div className="space-y-4">
            {data.folders.map((folder) => <FolderGroup key={folder.id} folder={folder} depth={0} onOpen={openCourse} />)}
            {data.standaloneCourses.map((course) => <CourseGroup key={course.id} course={course} onOpen={openCourse} />)}
          </div>
        )}
      </div>
    </div>
  )
}
