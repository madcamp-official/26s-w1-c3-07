import { BookOpen, Calendar, MessageCircle, QrCode, UserRound, UsersRound } from 'lucide-react'

interface RoomHeaderProps {
  title: string
  date: string
  lecturerName: string
  participantCount: number
  questionCount: number
  onShare?: () => void
}

export default function RoomHeader({ title, date, lecturerName, participantCount, questionCount, onShare }: RoomHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-4 rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 sm:p-6">
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
        <BookOpen className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-extrabold text-slate-900 sm:text-2xl">{title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5"><Calendar className="size-4" />{date}</span>
          <span className="inline-flex items-center gap-1.5"><UserRound className="size-4" />{lecturerName} Lecturer</span>
          <span className="inline-flex items-center gap-1.5"><UsersRound className="size-4" />{participantCount}명 참여 중</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-violet-600 shadow-sm transition hover:bg-violet-50"
          >
            <QrCode className="size-4" />QR / 링크
          </button>
        )}
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-violet-600 shadow-sm sm:inline-flex">
          <MessageCircle className="size-4" />{questionCount}개
        </span>
      </div>
    </header>
  )
}
