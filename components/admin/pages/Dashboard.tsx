'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAdminState } from '@/lib/admin/store'
import { SALES_SERIES } from '@/lib/admin/mock'
import { dateTime, money } from '@/lib/admin/format'
import { AreaChart, Badge, Card, DataTable, DemoBanner, PageHeader, Stat, field } from '../ui'
import { ORDER_TONE, ORDER_LABEL } from './labels'

export function Dashboard({ locale }: { locale: string }) {
  const s = useAdminState()
  const [forumId, setForumId] = useState('all')

  const forums = forumId === 'all' ? s.forums : s.forums.filter((f) => f.id === forumId)
  const ids = new Set(forums.map((f) => f.id))
  const paid = s.payments.filter((p) => p.status === 'PAID' && ids.has(p.forumId))
  const sold = forums.reduce((a, f) => a + f.sold, 0)
  const capacity = forums.reduce((a, f) => a + f.capacity, 0)
  const checkIns = s.tickets.filter((t) => t.status === 'USED' && ids.has(t.forumId)).length + forums.reduce((a, f) => a + f.checkedIn, 0)
  const pending = s.cancellations.filter((c) => c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW').length

  return (
    <div>
      <PageHeader title="Дашборд" text="Ключевые показатели по всем форумам или по одному.">
        <select aria-label="Форум" value={forumId} onChange={(e) => setForumId(e.target.value)} className={`${field} w-64`}>
          <option value="all">Все форумы</option>
          {s.forums.map((f) => <option key={f.id} value={f.id}>{f.title.ru}</option>)}
        </select>
      </PageHeader>
      <DemoBanner />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Зарегистрировано пользователей" value={s.users.length} />
        <Stat label="Опубликовано форумов" value={s.forums.filter((f) => f.status === 'PUBLISHED').length} />
        <Stat label="Продано билетов" value={sold} hint={`из ${capacity} мест`} />
        <Stat label="Подтверждённые платежи" value={money(paid.reduce((a, p) => a + p.amountMinor, 0))} />
        <Stat label="Входов отмечено" value={checkIns} />
        <Stat label="Осталось мест" value={Math.max(0, capacity - sold)} />
        <Stat label="Заявки на отмену" value={pending} hint="ожидают решения" tone={pending ? 'warn' : 'default'} />
        <Stat label="Форумов всего" value={s.forums.length} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Продажи билетов по дням (демо)">
          <AreaChart data={SALES_SERIES} />
        </Card>
        <Card title="Заполняемость">
          <ul className="space-y-4">
            {forums.map((f) => {
              const pct = Math.min(100, Math.round((f.sold / f.capacity) * 100))
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

      <Card title="Последние заказы" className="mt-6" action={<Link href={`/${locale}/admin/orders`} className="text-xs font-bold text-primary">Все заказы</Link>}>
        <DataTable
          rows={s.orders.filter((o) => ids.has(o.forumId)).slice(0, 5)}
          pageSize={5}
          columns={[
            { key: 'n', header: 'Номер', cell: (o) => <b>{o.number}</b> },
            { key: 'u', header: 'Покупатель', cell: (o) => o.userName },
            { key: 't', header: 'Сумма', cell: (o) => money(o.totalMinor) },
            { key: 's', header: 'Статус', cell: (o) => <Badge tone={ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Badge> },
            { key: 'd', header: 'Создан', cell: (o) => dateTime(o.createdAt) },
          ]}
        />
      </Card>
    </div>
  )
}
