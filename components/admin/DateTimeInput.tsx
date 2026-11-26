'use client'

import { Calendar, Clock } from 'lucide-react'
import { forwardRef } from 'react'

interface DateTimeInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  'aria-label'?: string
}

/**
 * Кастомный DateTimeInput компонент с красивыми стилями
 * - Округлые углы (rounded-xl)
 * - Синяя обводка при фокусе
 * - Плавные переходы
 * - Иконки календаря и часов
 * - Цвета проекта (primary)
 */
export const DateTimeInput = forwardRef<HTMLInputElement, DateTimeInputProps>(
  ({ value, onChange, className = '', 'aria-label': ariaLabel, ...props }, ref) => {
    return (
      <div className={`relative ${className}`}>
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
          <Calendar className="h-4 w-4 text-slate-400" />
          <Clock className="h-3.5 w-3.5 text-slate-400" />
        </div>
        <input
          ref={ref}
          type="datetime-local"
          value={value}
          onChange={onChange}
          aria-label={ariaLabel}
          className={`
            h-10 w-full rounded-xl border-2 bg-white pl-12 pr-3 text-sm font-semibold text-ink shadow-sm outline-none transition-all duration-200 ease-out
            border-slate-200 bg-gradient-to-r from-white to-slate-50/30
            hover:border-primary/60 hover:shadow-md hover:from-primary/5 hover:to-primary/10
            focus:border-primary focus:bg-white focus:shadow-lg focus:ring-4 focus:ring-primary/20
            disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60
            [&::-webkit-calendar-picker-indicator]:cursor-pointer 
            [&::-webkit-calendar-picker-indicator]:rounded-lg 
            [&::-webkit-calendar-picker-indicator]:p-1.5 
            [&::-webkit-calendar-picker-indicator]:opacity-0
            [&::-webkit-calendar-picker-indicator]:transition 
            [&::-webkit-calendar-picker-indicator]:hover:opacity-100 
            [&::-webkit-calendar-picker-indicator]:hover:bg-primary/10
          `}
          {...props}
        />
      </div>
    )
  }
)

DateTimeInput.displayName = 'DateTimeInput'
