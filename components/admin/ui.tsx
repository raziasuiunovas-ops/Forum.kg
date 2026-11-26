'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { Select as CustomSelect } from './Select'
import { DateInput as CustomDateInput } from './DateInput'
import { DateTimeInput as CustomDateTimeInput } from './DateTimeInput'

export { CustomSelect as Select }
export { CustomDateInput as DateInput }
export { CustomDateTimeInput as DateTimeInput }

export const field =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:bg-slate-50'

export const dateField =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink outline-none transition hover:border-primary/50 hover:bg-slate-50/50 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:rounded-lg [&::-webkit-calendar-picker-indicator]:p-1 [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:transition [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:hover:bg-slate-100'

export const select =
  'h-10 w-full cursor-pointer appearance-none rounded-xl border-2 border-slate-200 bg-white px-4 pr-10 text-sm font-semibold text-ink shadow-sm outline-none transition-all duration-200 ease-out hover:border-primary/60 hover:shadow-md focus:border-primary focus:bg-white focus:shadow-lg focus:ring-4 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 [&>option]:bg-white [&>option]:text-ink [&>option]:font-normal'

export const btn = {
  primary: 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50',
  soft: 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-bold text-ink transition hover:bg-slate-200 disabled:opacity-50',
  danger: 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50',
  ok: 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50',
}

export function PageHeader({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{title}</h1>
        {text && <p className="mt-1 max-w-2xl text-sm text-slate-500">{text}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Card({ title, children, className = '', action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-extrabold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: string | number; hint?: string; tone?: 'default' | 'warn' }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black tracking-tight ${tone === 'warn' ? 'text-amber-600' : 'text-ink'}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
  purple: 'bg-violet-50 text-violet-700',
}
export function Badge({ tone = 'slate', children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${TONES[tone]}`}>{children}</span>
}

export function DemoBanner({ note, forceShow = false }: { note?: string; forceShow?: boolean }) {
  // Don't show if explicitly not forced (will be controlled by parent)
  if (!forceShow) return null
  
  return (
    <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
      <b>Демо-режим.</b> {note ?? 'Данные хранятся в вашем браузере: серверные эндпоинты /api/v1/admin/* ещё не реализованы. После подключения интерфейс заработает с реальной базой без изменений.'}
    </p>
  )
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-2xl bg-white p-6 shadow-2xl`}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-black tracking-tight text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  )
}

/** Format current date as YYYY-MM-DD for date input */
export function getTodayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  sortValue?: (row: T) => string | number
  className?: string
}

/** Searchable, sortable, paginated table. `searchText` builds the string the search box matches against. */
export function DataTable<T extends { id: string }>({
  rows, columns, searchText, pageSize = 10, empty = 'Ничего не найдено', toolbar,
}: {
  rows: T[]
  columns: Column<T>[]
  searchText?: (row: T) => string
  pageSize?: number
  empty?: string
  toolbar?: React.ReactNode
}) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = needle && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(needle)) : rows
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const x = col.sortValue!(a), y = col.sortValue!(b)
          return (x > y ? 1 : x < y ? -1 : 0) * sort.dir
        })
      }
    }
    return out
  }, [rows, q, sort, columns, searchText])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const cur = Math.min(page, pages - 1)
  const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {searchText && (
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Поиск..." aria-label="Поиск" className={`${field} w-full pl-9`} />
          </div>
        )}
        {toolbar}
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200/70">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 ${c.className ?? ''}`}>
                  {c.sortValue ? (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>
                      {c.header}
                      {sort?.key === c.key && <span aria-hidden>{sort.dir === 1 ? '↑' : '↓'}</span>}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-400">{empty}</td>
              </tr>
            ) : (
              slice.map((r) => (
                <tr key={r.id} className="transition hover:bg-slate-50/70">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>{c.cell(r)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{filtered.length} записей</span>
          <div className="flex items-center gap-2">
            <button type="button" className={btn.soft} disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Назад"><ChevronLeft className="h-4 w-4" /></button>
            <span>{cur + 1} / {pages}</span>
            <button type="button" className={btn.soft} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Вперёд"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Tiny SVG area chart (no chart library needed). */
export function AreaChart({ data, height = 140 }: { data: number[]; height?: number }) {
  const max = Math.max(...data, 1)
  const w = 400
  const pts = data.map((v, i) => [(i / Math.max(data.length - 1, 1)) * w, height - 8 - (v / max) * (height - 24)])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label="График продаж">
      <defs>
        <linearGradient id="adm-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity=".28" />
          <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${height} L0,${height}Z`} fill="url(#adm-area)" />
      <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
