'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { actions, useAdminState } from '@/lib/admin/store'
import { dateTime } from '@/lib/admin/format'
import { useAdminUser } from '../AdminShell'
import { Card, DataTable, DemoBanner, Field, PageHeader, btn, field } from '../ui'

const TYPES: Record<string, string> = { FORUM_PUBLISHED: 'Новый форум', FORUM_UPDATED: 'Изменение форума', FORUM_CANCELLED: 'Отмена форума', EVENT_REMINDER: 'Напоминание о событии' }

export function Notifications() {
  const s = useAdminState()
  const { actor } = useAdminUser()
  const [type, setType] = useState('FORUM_PUBLISHED')
  const [audience, setAudience] = useState('Все пользователи')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [done, setDone] = useState(false)

  return (
    <div>
      <PageHeader title="Уведомления" text="Рассылки ставятся в очередь и уходят в приложение, Telegram и Web Push. Ошибка доставки не отменяет билеты и оплаты." />
      <DemoBanner note="Очередь рассылок (BullMQ) и каналы доставки ещё не подключены, поэтому отправка только записывается в журнал." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card title="Новая рассылка">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; actions.addNotification({ title: title.trim(), audience, type }, actor); setTitle(''); setBody(''); setDone(true); setTimeout(() => setDone(false), 2500) }}>
            <Field label="Тип"><select className={field} value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Аудитория"><select className={field} value={audience} onChange={(e) => setAudience(e.target.value)}><option>Все пользователи</option><option>Владельцы билетов выбранного форума</option><option>Пользователи с Telegram</option></select></Field>
            <Field label="Заголовок"><input className={field} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Текст" hint="Для каждого пользователя берётся его язык; при отсутствии перевода — русский."><textarea className={`${field} h-24 py-2`} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            <button className={btn.primary} type="submit" disabled={!title.trim()}><Send className="h-4 w-4" /> Поставить в очередь</button>
            {done && <p role="status" className="text-xs font-bold text-emerald-600">Рассылка поставлена в очередь</p>}
          </form>
        </Card>
        <Card title="История рассылок">
          <DataTable
            rows={s.notifications}
            pageSize={6}
            columns={[
              { key: 't', header: 'Рассылка', cell: (n) => (<div><b>{n.title}</b><p className="text-xs text-slate-400">{TYPES[n.type] ?? n.type} · {n.audience}</p></div>) },
              { key: 'd', header: 'Когда', cell: (n) => dateTime(n.at) },
              { key: 's', header: 'Доставлено', cell: (n) => <span className="font-bold text-emerald-600">{n.sent}</span> },
              { key: 'f', header: 'Ошибки', cell: (n) => <span className={n.failed ? 'font-bold text-red-600' : 'text-slate-400'}>{n.failed}</span> },
            ]}
          />
        </Card>
      </div>
    </div>
  )
}
