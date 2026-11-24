'use client'

import { useState } from 'react'
import { actions, useAdminState } from '@/lib/admin/store'
import { dateTime, money } from '@/lib/admin/format'
import type { CancellationRequest } from '@/lib/admin/types'
import { useAdminUser } from '../AdminShell'
import { Badge, Card, DataTable, DemoBanner, Field, Modal, PageHeader, Select, btn, field, select } from '../ui'
import { CANCEL_LABEL, CANCEL_TONE, ORDER_LABEL, ORDER_TONE, REFUND_LABEL } from './labels'

export function Orders() {
  const s = useAdminState()
  const { actor } = useAdminUser()
  const [tab, setTab] = useState<'orders' | 'cancellations'>('orders')
  const [status, setStatus] = useState('all')
  const [deciding, setDeciding] = useState<{ req: CancellationRequest; to: 'APPROVED' | 'REJECTED' } | null>(null)
  const [note, setNote] = useState('')
  const open = s.cancellations.filter((c) => c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW').length
  const forumName = (id: string) => s.forums.find((f) => f.id === id)?.title.ru ?? '—'

  return (
    <div>
      <PageHeader title="Заказы и отмены" text="Заказы пользователей и заявки на отмену. Одобрение отмены, аннулирование билетов и возврат денег — три отдельные операции." />
      <DemoBanner />
      <div role="tablist" className="mb-5 inline-flex rounded-lg bg-white p-1 text-sm font-bold shadow-sm ring-1 ring-slate-200/70">
        <button role="tab" aria-selected={tab === 'orders'} onClick={() => setTab('orders')} className={`rounded-md px-4 py-2 ${tab === 'orders' ? 'bg-ink text-white' : 'text-slate-500'}`}>Заказы</button>
        <button role="tab" aria-selected={tab === 'cancellations'} onClick={() => setTab('cancellations')} className={`rounded-md px-4 py-2 ${tab === 'cancellations' ? 'bg-ink text-white' : 'text-slate-500'}`}>
          Заявки на отмену {open > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">{open}</span>}
        </button>
      </div>

      {tab === 'orders' ? (
        <Card>
          <DataTable
            rows={s.orders.filter((o) => status === 'all' || o.status === status)}
            searchText={(o) => `${o.number} ${o.userName} ${forumName(o.forumId)}`}
            toolbar={
              <Select
                value={status}
                onChange={(value) => setStatus(value)}
                options={[
                  { value: 'all', label: 'Все статусы' },
                  ...Object.entries(ORDER_LABEL).map(([k, v]) => ({ value: k, label: v }))
                ]}
                aria-label="Статус"
              />
            }
            columns={[
              { key: 'n', header: 'Номер', sortValue: (o) => o.number, cell: (o) => <b>{o.number}</b> },
              { key: 'u', header: 'Покупатель', cell: (o) => o.userName },
              { key: 'f', header: 'Форум', cell: (o) => forumName(o.forumId) },
              { key: 'i', header: 'Билеты', cell: (o) => o.items.map((i) => `${i.participant} (${i.category})`).join(', ') },
              { key: 't', header: 'Сумма', sortValue: (o) => o.totalMinor, cell: (o) => money(o.totalMinor) },
              { key: 's', header: 'Статус', cell: (o) => <Badge tone={ORDER_TONE[o.status]}>{ORDER_LABEL[o.status]}</Badge> },
              { key: 'd', header: 'Создан', sortValue: (o) => o.createdAt, cell: (o) => dateTime(o.createdAt) },
            ]}
          />
        </Card>
      ) : (
        <Card>
          <DataTable
            rows={s.cancellations}
            searchText={(c) => `${c.orderNumber} ${c.userName}`}
            empty="Заявок на отмену нет"
            columns={[
              { key: 'n', header: 'Заказ', cell: (c) => (<div><b>{c.orderNumber}</b><p className="text-xs text-slate-400">{c.userName} · {forumName(c.forumId)}</p></div>) },
              { key: 'r', header: 'Причина', cell: (c) => <span className="line-clamp-2 max-w-xs text-xs text-slate-600">{c.reason}</span> },
              { key: 'a', header: 'Сумма', cell: (c) => `${money(c.amountMinor)} · ${c.ticketCount} шт.` },
              { key: 's', header: '1. Решение', cell: (c) => <Badge tone={CANCEL_TONE[c.status]}>{CANCEL_LABEL[c.status]}</Badge> },
              { key: 't', header: '2. Билеты', cell: (c) => <Badge tone={c.ticketsInvalidated ? 'red' : 'slate'}>{c.ticketsInvalidated ? 'Аннулированы' : 'Действуют'}</Badge> },
              { key: 'f', header: '3. Возврат', cell: (c) => <Badge tone={c.refund === 'SUCCEEDED' ? 'green' : c.refund === 'FAILED' ? 'red' : 'slate'}>{REFUND_LABEL[c.refund]}</Badge> },
              {
                key: 'x', header: '', cell: (c) => (
                  <div className="flex flex-wrap justify-end gap-2">
                    {c.status === 'SUBMITTED' && <button className={btn.soft} onClick={() => actions.decideCancellation(c.id, 'UNDER_REVIEW', c.adminNote ?? '', actor)}>Взять в работу</button>}
                    {(c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW') && (<>
                      <button className={btn.ok} onClick={() => { setDeciding({ req: c, to: 'APPROVED' }); setNote('') }}>Одобрить</button>
                      <button className={btn.danger} onClick={() => { setDeciding({ req: c, to: 'REJECTED' }); setNote('') }}>Отклонить</button>
                    </>)}
                    {c.status === 'APPROVED' && !c.ticketsInvalidated && <button className={btn.danger} onClick={() => confirm('Аннулировать билеты? Они больше не будут проходить на входе.') && actions.invalidateCancellationTickets(c.id, actor)}>Аннулировать билеты</button>}
                    {c.ticketsInvalidated && c.refund !== 'SUCCEEDED' && (
                      <select aria-label="Статус возврата" value={c.refund} onChange={(e) => actions.setRefund(c.id, e.target.value as CancellationRequest['refund'], actor)} className={`${select} !h-9 !text-xs`}>
                        {Object.entries(REFUND_LABEL).map(([k, v]) => <option key={k} value={k}>Возврат: {v}</option>)}
                      </select>
                    )}
                  </div>
                ),
              },
            ]}
          />
          <p className="mt-4 text-[11px] leading-relaxed text-slate-400">Подача заявки сама по себе билет не аннулирует. После аннулирования место снова учитывается как свободное в лимите аккаунта. Порядок возврата денег и условия ещё не утверждены (см. ТЗ, раздел 23), поэтому статус возврата ведётся вручную.</p>
        </Card>
      )}

      {deciding && (
        <Modal title={deciding.to === 'APPROVED' ? 'Одобрить отмену' : 'Отклонить заявку'} onClose={() => setDeciding(null)}>
          <p className="mb-4 text-sm text-slate-600">Заказ <b>{deciding.req.orderNumber}</b>, {deciding.req.userName}.</p>
          <Field label="Комментарий администратора" hint={deciding.to === 'APPROVED' ? 'Билеты будут аннулированы отдельным шагом.' : undefined}>
            <textarea className={`${field} h-24 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btn.soft} onClick={() => setDeciding(null)}>Отмена</button>
            <button className={btn.primary} onClick={() => { actions.decideCancellation(deciding.req.id, deciding.to, note, actor); setDeciding(null) }}>Подтвердить</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
