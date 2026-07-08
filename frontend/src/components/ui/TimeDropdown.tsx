import { useEffect, useRef, useState } from 'react'
import { cn } from '../../utils/cn'

interface TimeDropdownProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour)
const MINUTE_OPTIONS = [0, 15, 30, 45]

type Field = 'hour' | 'minute'

export default function TimeDropdown({ value, onChange, className }: TimeDropdownProps) {
  const [hourStr, minuteStr] = value ? value.split(':') : ['', '']
  const [hourInput, setHourInput] = useState(hourStr)
  const [minuteInput, setMinuteInput] = useState(minuteStr)
  const [openField, setOpenField] = useState<Field | null>(null)
  const [focusedField, setFocusedField] = useState<Field | null>(null)
  const hourRef = useRef<HTMLDivElement>(null)
  const minuteRef = useRef<HTMLDivElement>(null)

  // 외부에서 value가 바뀔 때만(폼 프리필 등) 로컬 입력값을 동기화. 사용자가 그 칸을
  // 편집 중(focus)이면 덮어쓰지 않음 - 안 그러면 타이핑할 때마다 값이 되돌려져서
  // 키보드 입력이 제대로 반영되지 않음(예전 분 입력 버그의 원인).
  useEffect(() => {
    if (focusedField !== 'hour') setHourInput(hourStr)
  }, [hourStr, focusedField])
  useEffect(() => {
    if (focusedField !== 'minute') setMinuteInput(minuteStr)
  }, [minuteStr, focusedField])

  useEffect(() => {
    if (!openField) return
    const handleClickOutside = (event: MouseEvent) => {
      const inHour = hourRef.current?.contains(event.target as Node)
      const inMinute = minuteRef.current?.contains(event.target as Node)
      if (!inHour && !inMinute) setOpenField(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openField])

  const commit = (hh: string, mm: string) => onChange(`${hh || '00'}:${mm || '00'}`)

  const handleHourChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setHourInput(digits)
    if (digits !== '' && Number(digits) <= 23) commit(pad(Number(digits)), minuteStr)
  }
  const handleMinuteChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setMinuteInput(digits)
    if (digits !== '' && Number(digits) <= 59) commit(hourStr, pad(Number(digits)))
  }

  const blurHour = () => {
    setFocusedField(null)
    setOpenField(null)
    if (hourInput === '') {
      setHourInput(hourStr)
      return
    }
    const clamped = Math.min(23, Math.max(0, Number(hourInput)))
    setHourInput(pad(clamped))
    commit(pad(clamped), minuteStr)
  }
  const blurMinute = () => {
    setFocusedField(null)
    setOpenField(null)
    if (minuteInput === '') {
      setMinuteInput(minuteStr)
      return
    }
    const clamped = Math.min(59, Math.max(0, Number(minuteInput)))
    setMinuteInput(pad(clamped))
    commit(hourStr, pad(clamped))
  }

  const selectHour = (hour: number) => {
    setHourInput(pad(hour))
    commit(pad(hour), minuteStr)
    setOpenField(null)
  }
  const selectMinute = (minute: number) => {
    setMinuteInput(pad(minute))
    commit(hourStr, pad(minute))
    setOpenField(null)
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div ref={hourRef} className="relative">
        <input
          value={hourInput}
          onFocus={() => { setFocusedField('hour'); setOpenField('hour') }}
          onChange={(event) => handleHourChange(event.target.value)}
          onBlur={blurHour}
          inputMode="numeric"
          placeholder="--"
          aria-label="시"
          className="w-8 rounded-lg bg-transparent px-1 py-0.5 text-center outline-none placeholder:text-slate-300"
        />
        {openField === 'hour' && (
          <div className="absolute left-0 top-full z-20 mt-2 max-h-56 w-16 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
            {HOUR_OPTIONS.map((hour) => (
              <button
                key={hour}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectHour(hour)}
                className={cn(
                  'block w-full rounded-xl px-2 py-1 text-center text-sm font-medium transition',
                  pad(hour) === hourStr ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-violet-50',
                )}
              >
                {pad(hour)}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="font-bold text-slate-400">:</span>
      <div ref={minuteRef} className="relative">
        <input
          value={minuteInput}
          onFocus={() => { setFocusedField('minute'); setOpenField('minute') }}
          onChange={(event) => handleMinuteChange(event.target.value)}
          onBlur={blurMinute}
          inputMode="numeric"
          placeholder="--"
          aria-label="분"
          className="w-8 rounded-lg bg-transparent px-1 py-0.5 text-center outline-none placeholder:text-slate-300"
        />
        {openField === 'minute' && (
          <div className="absolute left-0 top-full z-20 mt-2 w-16 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
            {MINUTE_OPTIONS.map((minute) => (
              <button
                key={minute}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMinute(minute)}
                className={cn(
                  'block w-full rounded-xl px-2 py-1 text-center text-sm font-medium transition',
                  pad(minute) === minuteStr ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-violet-50',
                )}
              >
                {pad(minute)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
