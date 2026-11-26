'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { actions, useAdminState } from '@/lib/admin/store'
import { dateTime } from '@/lib/admin/format'
import { useAdminUser } from '../AdminShell'
import { Card, DataTable, DemoBanner, Field, PageHeader, Select, btn, field } from '../ui'

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
      <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-[1fr_1.4fr]">
        <Card title="Новая рассылка">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; actions.addNotification({ title: title.trim(), audience, type }, actor); setTitle(''); setBody(''); setDone(true); setTimeout(() => setDone(false), 2500) }}>
            <Field label="Тип"><Select value={type} onChange={setType} options={Object.entries(TYPES).map(([k, v]) => ({ value: k, label: v }))} /></Field>
            <Field label="Аудитория"><Select value={audience} onChange={setAudience} options={[
              { value: 'Все пользователи', label: 'Все пользователи' },
              { value: 'Владельцы билетов выбранного форума', label: 'Владельцы билетов выбранного форума' },
              { value: 'Пользователи с Telegram', label: 'Пользователи с Telegram' },
            ]} /></Field>
            <Field label="Заголовок"><input className={field} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Текст" hint="Для каждого пользователя берётся его язык; при отсутствии перевода — русский."><textarea className={`${field} h-24 py-2`} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            <button className={btn.primary} type="submit" disabled={!title.trim()}><Send className="h-4 w-4" /> Поставить в очередь</button>
            {done && <p role="status" className="text-xs font-bold text-emerald-600">Рассылка поставлена в очередь</p>}
          </form>
        </Card>
        <Card title="История рассылок">
          <div className="overflow-x-auto -mx-6 px-6">
            <DataTable
              rows={s.notifications}
              pageSize={6}
              columns={[
                { key: 't', header: 'Рассылка', cell: (n) => (<div className="min-w-[200px]"><b className="block text-sm">{n.title}</b><p className="text-xs text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px]">{TYPES[n.type] ?? n.type} · {n.audience}</p></div>) },
                { key: 'd', header: 'Когда', cell: (n) => <span className="whitespace-nowrap text-sm">{dateTime(n.at)}</span> },
                { key: 's', header: 'Доставлено', cell: (n) => <span className="font-bold text-emerald-600">{n.sent}</span> },
                { key: 'f', header: 'Ошибки', cell: (n) => <span className={n.failed ? 'font-bold text-red-600' : 'text-slate-400'}>{n.failed}</span> },
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
