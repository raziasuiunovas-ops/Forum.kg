const TZ = 'Asia/Bishkek'

export const money = (minor: number) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(minor / 100)} сом`

export const dateTime = (iso: string, seconds = false) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}), timeZone: TZ,
  }).format(new Date(iso))

export const dateOnly = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }).format(new Date(iso))

/** Calendar day (YYYY-MM-DD) of an instant in Asia/Bishkek - used by the payments date filter. */
export const bishkekDay = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ }).format(new Date(iso))

/** ISO instant -> value for <input type="datetime-local"> in Asia/Bishkek. */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ,
  }).format(new Date(iso))
  return parts.replace(' ', 'T')
}

/** <input type="datetime-local"> value (Asia/Bishkek, UTC+6, no DST) -> ISO instant. */
export const fromLocalInput = (v: string) => (v ? new Date(`${v}:00+06:00`).toISOString() : '')

export function toCsv(rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')
}

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
