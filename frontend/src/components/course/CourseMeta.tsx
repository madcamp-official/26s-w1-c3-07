import { MessageCircle } from 'lucide-react'

interface CourseMetaProps {
  questionCount: number
  updatedAt?: string
}

export default function CourseMeta({ questionCount, updatedAt }: CourseMetaProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
      <span className="inline-flex items-center gap-1.5"><MessageCircle className="size-4" />게시글 {questionCount}개</span>
      {updatedAt && <span>{updatedAt}</span>}
    </div>
  )
}
