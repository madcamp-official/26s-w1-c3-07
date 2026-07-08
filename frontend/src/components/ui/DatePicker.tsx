import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../utils/cn'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toValue(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export default function DatePicker({ value, onChange, className }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // 로컬 자정 기준으로 파싱해야 날짜가 하루 밀리는 걸 피할 수 있음(UTC 파싱 시 타임존에 따라 전날로 보일 수 있음).
  const selected = value ? new Date(`${value}T00:00:00`) : null
  const [viewYear, setViewYear] = useState(selected ? selected.getFullYear() : new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(selected ? selected.getMonth() : new Date().getMonth())

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const openPicker = () => {
    if (selected) {
      setViewYear(selected.getFullYear())
      setViewMonth(selected.getMonth())
    }
    setIsOpen(true)
  }

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((year) => year - 1)
      setViewMonth(11)
    } else setViewMonth((month) => month - 1)
  }

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((year) => year + 1)
      setViewMonth(0)
    } else setViewMonth((month) => month + 1)
  }

  const selectDay = (day: number) => {
    onChange(toValue(viewYear, viewMonth, day))
    setIsOpen(false)
  }

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: Array<number | null> = [...Array<null>(firstDayOfMonth).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const displayValue = selected ? `${selected.getFullYear()}년 ${pad(selected.getMonth() + 1)}월 ${pad(selected.getDate())}일` : ''

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button type="button" onClick={openPicker} className="w-full text-left outline-none">
        {displayValue || <span className="text-slate-300">날짜 선택</span>}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <button type="button" onClick={goToPrevMonth} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="이전 달">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-bold text-slate-800">{viewYear}년 {viewMonth + 1}월</span>
            <button type="button" onClick={goToNextMonth} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="다음 달">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-300">
            {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} />
              const isSelected = selected !== null && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full text-sm font-medium transition',
                    isSelected ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-violet-50',
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
