'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { getDashboardStats, listForums, type DashboardStats } from '@/lib/admin/api'
import type { AdminForum } from '@/lib/admin/types'
import { money } from '@/lib/admin/format'
import { Card, PageHeader, Stat, Select, btn, field } from '../ui'

export function Dashboard({ locale }: { locale: string }) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [allForums, setAllForums] = useState<AdminForum[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [forumId, setForumId] = useState('all')

  const reload = useCallback(async () => {
    setLoading(true)
    const [s, f] = await Promise.all([getDashboardStats(), listForums()])
    if (s.ok) setStats(s.data!)
    if (f.ok) setAllForums(f.data!)
    setError([!s.ok && s.error, !f.ok && f.error].filter(Boolean).join(' · '))
    setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])

  const forums = forumId === 'all' ? allForums : allForums.filter((f) => f.id === forumId)
  const sold = forums.reduce((a, f) => a + f.sold, 0)
  const capacity = forums.reduce((a, f) => a + f.capacity, 0)
  const checkIns = forums.reduce((a, f) => a + f.checkedIn, 0)

  return (
    <div>
      <PageHeader title="Панель управления" text="Ключевые показатели по всем форумам или по одному." />
      
      <div className="mb-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          aria-label="Форум"
          value={forumId}
          onChange={(value) => setForumId(value)}
          options={[
            { value: 'all', label: 'Все форумы' },
            ...allForums.map((f) => ({ value: f.id, label: f.title.ru }))
          ]}
          className="w-full sm:flex-1 sm:max-w-md"
        />
        <button type="button" className={btn.soft} onClick={() => void reload()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Обновить</button>
      </div>
      
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Зарегистрировано пользователей" value={stats?.users.total ?? '—'} />
        <Stat label="Опубликовано форумов" value={forums.filter((f) => f.status === 'PUBLISHED').length} />
        <Stat label="Продано билетов" value={sold} hint={`из ${capacity} мест`} />
        <Stat label="Выручка (оплаченные заказы)" value={stats ? money(stats.orders.revenueMinor) : '—'} />
        <Stat label="Входов отмечено" value={checkIns} />
        <Stat label="Осталось мест" value={Math.max(0, capacity - sold)} />
        <Stat label="Заказы ждут оплаты" value={stats?.orders.pending ?? '—'} tone={stats?.orders.pending ? 'warn' : 'default'} />
        <Stat label="Неуспешные платежи" value={stats?.payments.failed ?? '—'} tone={stats?.payments.failed ? 'warn' : 'default'} />
      </div>

      <Card title="Заполняемость" className="mt-6" action={<Link href={`/${locale}/admin/forums`} className="text-xs font-bold text-primary">Все форумы</Link>}>
        {forums.length === 0 && !loading && <p className="text-sm text-slate-500">Форумов пока нет.</p>}
        <ul className="space-y-4">
          {forums.map((f) => {
            const pct = f.capacity ? Math.min(100, Math.round((f.sold / f.capacity) * 100)) : 0
            return (
              <li key={f.id}>
                <div className="flex justify-between text-xs"><span className="font-bold text-ink">{f.title.ru}</span><span className="text-slate-500">{f.sold} / {f.capacity}</span></div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
