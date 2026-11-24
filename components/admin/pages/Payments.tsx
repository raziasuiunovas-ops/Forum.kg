'use client'

import { useState } from 'react'
import { useAdminState } from '@/lib/admin/store'
import { bishkekDay, dateTime, money } from '@/lib/admin/format'
import { Badge, Card, DataTable, DemoBanner, PageHeader, Stat, btn, DateInput, getTodayDate } from '../ui'
import { PAY_LABEL, PAY_TONE } from './labels'

/** Spec 8.4: who paid, for what, amount, status, EXACT date and time, reference. Filter by calendar date only. */
export function Payments() {
  const s = useAdminState()
  const [day, setDay] = useState(getTodayDate())
  const forumName = (id: string) => s.forums.find((f) => f.id === id)?.title.ru ?? '—'
  const rows = s.payments.filter((p) => !day || bishkekDay(p.paidAt) === day)
  const total = rows.filter((p) => p.status === 'PAID').reduce((a, p) => a + p.amountMinor, 0)

  return (
    <div>
      <PageHeader title="Платежи" text="Кто и за что заплатил, сумма, статус, точные дата и время, номер транзакции." />
      <DemoBanner />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Платежей в выборке" value={rows.length} />
        <Stat label="Подтверждено на сумму" value={money(total)} />
        <Stat label="Ожидают возврата" value={rows.filter((p) => p.status === 'REFUND_PENDING').length} />
      </div>
      <Card>
        <DataTable
          rows={rows}
          searchText={(p) => `${p.userName} ${p.orderNumber} ${p.providerRef} ${forumName(p.forumId)}`}
          toolbar={
            <DateInput value={day} onChange={(e) => setDay(e.target.value)} className="w-full sm:w-48" />
          }
          columns={[
            { key: 'u', header: 'Плательщик', sortValue: (p) => p.userName, cell: (p) => <b>{p.userName}</b> },
            { key: 'f', header: 'Форум / заказ', cell: (p) => (<div>{forumName(p.forumId)}<p className="text-xs text-slate-400">{p.orderNumber}</p></div>) },
            { key: 'a', header: 'Сумма', sortValue: (p) => p.amountMinor, cell: (p) => money(p.amountMinor) },
            { key: 's', header: 'Статус', cell: (p) => <Badge tone={PAY_TONE[p.status]}>{PAY_LABEL[p.status]}</Badge> },
            { key: 'd', header: 'Дата и время', sortValue: (p) => p.paidAt, cell: (p) => dateTime(p.paidAt, true) },
            { key: 'r', header: 'Транзакция', cell: (p) => <code className="text-xs text-slate-500">{p.providerRef}</code> },
          ]}
        />
      </Card>
    </div>
  )
}
