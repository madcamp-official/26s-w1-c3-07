import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../utils/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dashed'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: ButtonVariant
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-violet-600 text-white shadow-sm hover:bg-violet-700',
  secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-violet-200 hover:text-violet-700',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
  dashed: 'border border-dashed border-violet-400 bg-white text-violet-600 hover:bg-violet-50',
}

export default function Button({ children, className, variant = 'primary', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
