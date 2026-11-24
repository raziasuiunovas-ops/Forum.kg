'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  'aria-label'?: string
}

/**
 * Кастомный Select компонент с красивыми стилями выпадающего меню
 * - Округлые углы
 * - Плавные анимации
 * - Hover эффекты на опциях
 * - Цвета проекта (primary)
 */
export function Select({ value, onChange, options, placeholder = 'Выберите...', className = '', 'aria-label': ariaLabel }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedOption = options.find(opt => opt.value === value)

  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex(prev => (prev < options.length - 1 ? prev + 1 : prev))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev))
      } else if (e.key === 'Enter' && highlightedIndex >= 0) {
        e.preventDefault()
        onChange(options[highlightedIndex].value)
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, highlightedIndex, options, onChange])

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  function handleSelect(optionValue: string) {
    onChange(optionValue)
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Кнопка выбора */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`
          flex h-10 w-full items-center justify-between gap-2 rounded-xl border-2 bg-white px-4 text-left text-sm font-semibold text-ink shadow-sm outline-none transition-all duration-200 ease-out
          ${isOpen 
            ? 'border-primary bg-gradient-to-r from-primary/5 to-primary/10 shadow-lg ring-4 ring-primary/20' 
            : 'border-slate-200 bg-gradient-to-r from-white to-slate-50/30 hover:border-primary/60 hover:shadow-md hover:from-primary/5 hover:to-primary/10'
          }
        `}
      >
        <span className={selectedOption ? 'text-ink' : 'text-slate-400'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown 
          className={`h-5 w-5 transition-all duration-300 ${isOpen ? 'rotate-180 text-primary' : 'text-slate-400'}`} 
        />
      </button>

      {/* Выпадающий список */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-64 overflow-auto rounded-xl border-2 border-primary/20 bg-white p-2 shadow-2xl ring-1 ring-black/5"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value
              const isHighlighted = index === highlightedIndex

              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`
                    group flex cursor-pointer items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150
                    ${isSelected 
                      ? 'bg-primary text-white shadow-sm' 
                      : isHighlighted
                        ? 'bg-primary/10 text-primary'
                        : 'text-slate-700 hover:bg-slate-50'
                    }
                  `}
                >
                  <span className="flex-1">{option.label}</span>
                  {isSelected && (
                    <Check className="h-4 w-4 animate-in zoom-in-50 duration-200" />
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
