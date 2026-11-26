'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { useAdminState, useIsServerDataLoaded } from '@/lib/admin/store'
import { SALES_SERIES } from '@/lib/admin/mock'
import { dateTime, downloadCsv, money } from '@/lib/admin/format'
import { AreaChart, Card, DemoBanner, PageHeader, Stat, btn, field, select } from '../ui'

export function Analytics() {
  const s = useAdminState()
  const isServerData = useIsServerDataLoaded()
  const [forumId, setForumId] = useState('all')
  const forums = forumId === 'all' ? s.forums : s.forums.filter((f) => f.id === forumId)
  const ids = new Set(forums.map((f) => f.id))
  const name = (id: string) => s.forums.find((f) => f.id === id)?.title.ru ?? ''
  const tickets = s.tickets.filter((t) => ids.has(t.forumId))
  const revenue = s.payments.filter((p) => p.status === 'PAID' && ids.has(p.forumId)).reduce((a, p) => a + p.amountMinor, 0)
  const byCat = ['STANDARD', 'VIP'].map((c) => ({ c, n: tickets.filter((t) => t.category.toUpperCase() === c).length }))
  const maxCat = Math.max(...byCat.map((x) => x.n), 1)

  const exports = [
    { label: 'Заказы', file: 'orders.csv', rows: () => [['Номер', 'Покупатель', 'Форум', 'Сумма, сом', 'Статус', 'Создан'], ...s.orders.filter((o) => ids.has(o.forumId)).map((o) => [o.number, o.userName, name(o.forumId), o.totalMinor / 100, o.status, dateTime(o.createdAt)])] },
    { label: 'Платежи', file: 'payments.csv', rows: () => [['Заказ', 'Плательщик', 'Форум', 'Сумма, сом', 'Статус', 'Дата и время', 'Транзакция'], ...s.payments.filter((p) => ids.has(p.forumId)).map((p) => [p.orderNumber, p.userName, name(p.forumId), p.amountMinor / 100, p.status, dateTime(p.paidAt, true), p.providerRef])] },
    { label: 'Билеты', file: 'tickets.csv', rows: () => [['Номер', 'Участник', 'Покупатель', 'Форум', 'Категория', 'Статус'], ...tickets.map((t) => [t.number, t.participant, t.buyerName, name(t.forumId), t.category, t.status])] },
    { label: 'Входы', file: 'check-ins.csv', rows: () => [['Номер', 'Участник', 'Форум', 'Время входа'], ...tickets.filter((t) => t.status === 'USED').map((t) => [t.number, t.participant, name(t.forumId), t.checkedInAt ? dateTime(t.checkedInAt, true) : ''])] },
  ]

  return (
    <div>
      <PageHeader title="Аналитика и экспорт" text="Продажи, категории билетов и выгрузка данных в CSV.">
        <select aria-label="Форум" className={select} value={forumId} onChange={(e) => setForumId(e.target.value)}><option value="all">Все форумы</option>{s.forums.map((f) => <option key={f.id} value={f.id}>{f.title.ru}</option>)}</select>
      </PageHeader>
      <DemoBanner forceShow={!isServerData} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Выручка (подтверждённая)" value={money(revenue)} />
        <Stat label="Выдано билетов" value={tickets.length} />
        <Stat label="Средний чек" value={tickets.length ? money(Math.round(revenue / tickets.length)) : '—'} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Динамика продаж (демо)"><AreaChart data={SALES_SERIES} height={160} /></Card>
        <Card title="Билеты по категориям">
          <ul className="space-y-4">{byCat.map(({ c, n }) => (<li key={c}><div className="flex justify-between text-xs"><span className="font-bold text-ink">{c}</span><span className="text-slate-500">{n}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${c === 'VIP' ? 'bg-amber-400' : 'bg-primary'}`} style={{ width: `${(n / maxCat) * 100}%` }} /></div></li>))}</ul>
        </Card>
      </div>
      <Card title="Экспорт в CSV" className="mt-6">
        <div className="flex flex-wrap gap-3">{exports.map((e) => <button key={e.file} type="button" className={btn.soft} onClick={() => downloadCsv(e.file, e.rows())}><Download className="h-4 w-4" /> {e.label}</button>)}</div>
        <p className="mt-3 text-[11px] text-slate-400">Файлы открываются в Excel (кодировка UTF-8).</p>
      </Card>
    </div>
  )
}
