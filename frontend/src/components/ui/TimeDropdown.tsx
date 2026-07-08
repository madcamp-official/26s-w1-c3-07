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

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const MINUTE_OPTIONS = [0, 15, 30, 45]

export default function TimeDropdown({ value, onChange, className }: TimeDropdownProps) {
  const [hourStr, minuteStr] = value ? value.split(':') : ['', '']
  const [isHourOpen, setIsHourOpen] = useState(false)
  const [isMinuteOpen, setIsMinuteOpen] = useState(false)
  const [minuteInput, setMinuteInput] = useState(minuteStr)
  const hourRef = useRef<HTMLDivElement>(null)
  const minuteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMinuteInput(minuteStr)
  }, [minuteStr])

  useEffect(() => {
    if (!isHourOpen && !isMinuteOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (hourRef.current && !hourRef.current.contains(event.target as Node)) setIsHourOpen(false)
      if (minuteRef.current && !minuteRef.current.contains(event.target as Node)) setIsMinuteOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isHourOpen, isMinuteOpen])

  const commitHour = (hour: number) => {
    onChange(`${pad(hour)}:${minuteStr || '00'}`)
    setIsHourOpen(false)
  }

  const commitMinute = (minute: number) => {
    onChange(`${hourStr || '00'}:${pad(minute)}`)
    setIsMinuteOpen(false)
  }

  const handleMinuteInputChange = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '').slice(0, 2)
    setMinuteInput(digitsOnly)
    const parsed = Number(digitsOnly)
    if (digitsOnly !== '' && parsed <= 59) onChange(`${hourStr || '00'}:${pad(parsed)}`)
  }

  const handleMinuteBlur = () => {
    setIsMinuteOpen(false)
    if (minuteInput === '') {
      setMinuteInput(minuteStr)
      return
    }
    const clamped = Math.min(59, Math.max(0, Number(minuteInput)))
    setMinuteInput(pad(clamped))
    onChange(`${hourStr || '00'}:${pad(clamped)}`)
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div ref={hourRef} className="relative">
        <button type="button" onClick={() => setIsHourOpen((prev) => !prev)} className="rounded-lg px-1.5 py-0.5 text-left outline-none hover:bg-violet-50">
          {hourStr || <span className="text-slate-300">--</span>}
        </button>
        {isHourOpen && (
          <div className="absolute left-0 top-full z-20 mt-2 max-h-56 w-16 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
            {HOURS.map((hour) => (
              <button
                key={hour}
                type="button"
                onClick={() => commitHour(hour)}
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
          onFocus={() => setIsMinuteOpen(true)}
          onChange={(event) => handleMinuteInputChange(event.target.value)}
          onBlur={handleMinuteBlur}
          inputMode="numeric"
          placeholder="--"
          className="w-8 rounded-lg bg-transparent px-1 py-0.5 text-center outline-none placeholder:text-slate-300"
        />
        {isMinuteOpen && (
          <div className="absolute left-0 top-full z-20 mt-2 w-16 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
            {MINUTE_OPTIONS.map((minute) => (
              <button
                key={minute}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitMinute(minute)}
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
