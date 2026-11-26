'use client'

import { useState } from 'react'
import { actions, useAdminState } from '@/lib/admin/store'
import { dateTime } from '@/lib/admin/format'
import type { AdminTicket } from '@/lib/admin/types'
import { useAdminUser } from '../AdminShell'
import { Badge, Card, DataTable, DemoBanner, Field, Modal, PageHeader, Select, btn, field, select } from '../ui'
import { TICKET_LABEL, TICKET_TONE } from './labels'

export function Tickets() {
  const s = useAdminState()
  const { actor } = useAdminUser()
  const [forum, setForum] = useState('all')
  const [status, setStatus] = useState('all')
  const [target, setTarget] = useState<AdminTicket | null>(null)
  const [reason, setReason] = useState('')
  const forumName = (id: string) => s.forums.find((f) => f.id === id)?.title.ru ?? '—'
  const rows = s.tickets.filter((t) => (forum === 'all' || t.forumId === forum) && (status === 'all' || t.status === status))

  return (
    <div>
      <PageHeader title="Билеты" text="Выданные билеты. Ручное аннулирование записывается в журнал аудита." />
      <DemoBanner />
      <Card>
        <DataTable
          rows={rows}
          searchText={(t) => `${t.number} ${t.participant} ${t.buyerName}`}
          toolbar={
            <>
              <Select
                value={forum}
                onChange={(value) => setForum(value)}
                options={[
                  { value: 'all', label: 'Все форумы' },
                  ...s.forums.map((f) => ({ value: f.id, label: f.title.ru }))
                ]}
                aria-label="Форум"
              />
              <Select
                value={status}
                onChange={(value) => setStatus(value)}
                options={[
                  { value: 'all', label: 'Все статусы' },
                  ...Object.entries(TICKET_LABEL).map(([k, v]) => ({ value: k, label: v }))
                ]}
                aria-label="Статус"
              />
            </>
          }
          columns={[
            { key: 'n', header: 'Номер', sortValue: (t) => t.number, cell: (t) => <code className="text-xs font-bold text-ink">{t.number}</code> },
            { key: 'p', header: 'Участник', cell: (t) => (<div><b>{t.participant}</b><p className="text-xs text-slate-400">покупатель: {t.buyerName}</p></div>) },
            { key: 'f', header: 'Форум', cell: (t) => forumName(t.forumId) },
            { key: 'c', header: 'Категория', cell: (t) => <Badge tone={t.category === 'VIP' ? 'amber' : 'blue'}>{t.category}</Badge> },
            { key: 's', header: 'Статус', cell: (t) => <Badge tone={TICKET_TONE[t.status]}>{TICKET_LABEL[t.status]}</Badge> },
            { key: 'd', header: 'Выдан', sortValue: (t) => t.issuedAt, cell: (t) => dateTime(t.issuedAt) },
            { key: 'a', header: '', cell: (t) => t.status === 'ACTIVE' && <button className={btn.danger} onClick={() => { setTarget(t); setReason('') }}>Аннулировать</button> },
          ]}
        />
      </Card>
      {target && (
        <Modal title="Аннулировать билет" onClose={() => setTarget(null)}>
          <p className="mb-4 text-sm text-slate-600">Билет <b>{target.number}</b> ({target.participant}) перестанет проходить на входе. Купленную категорию изменить нельзя.</p>
          <Field label="Причина (необязательно)"><textarea className={`${field} h-24 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Опишите причину аннулирования (можно пропустить)" /></Field>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btn.soft} onClick={() => setTarget(null)}>Отмена</button>
            <button className={btn.primary} onClick={() => { actions.setTicketStatus(target.id, 'CANCELLED', reason.trim() || 'Без указания причины', actor); setTarget(null) }}>Аннулировать</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
