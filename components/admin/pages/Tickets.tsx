'use client'

import { useState } from 'react'
import { actions, useAdminState } from '@/lib/admin/store'
import { dateTime } from '@/lib/admin/format'
import type { AdminTicket } from '@/lib/admin/types'
import { useAdminUser } from '../AdminShell'
import { Badge, Card, DataTable, DemoBanner, Field, Modal, PageHeader, btn, field } from '../ui'
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
            <div className="flex flex-wrap gap-2">
              <select aria-label="Форум" value={forum} onChange={(e) => setForum(e.target.value)} className={`${field} w-56`}>
                <option value="all">Все форумы</option>
                {s.forums.map((f) => <option key={f.id} value={f.id}>{f.title.ru}</option>)}
              </select>
              <select aria-label="Статус" value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} w-48`}>
                <option value="all">Все статусы</option>
                {Object.entries(TICKET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
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
          <Field label="Причина (обязательно)"><textarea className={`${field} h-24 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btn.soft} onClick={() => setTarget(null)}>Отмена</button>
            <button className={btn.primary} disabled={!reason.trim()} onClick={() => { actions.setTicketStatus(target.id, 'CANCELLED', reason.trim(), actor); setTarget(null) }}>Аннулировать</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
