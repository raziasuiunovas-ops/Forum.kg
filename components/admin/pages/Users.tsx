'use client'

import { useState } from 'react'
import { actions, useAdminState } from '@/lib/admin/store'
import { dateTime, money } from '@/lib/admin/format'
import type { AdminUser } from '@/lib/admin/types'
import { useAdminUser } from '../AdminShell'
import { Badge, Card, DataTable, DemoBanner, Modal, PageHeader, btn } from '../ui'

export function Users() {
  const s = useAdminState()
  const { actor } = useAdminUser()
  const [sel, setSel] = useState<AdminUser | null>(null)
  const current = sel ? s.users.find((u) => u.id === sel.id) ?? sel : null

  return (
    <div>
      <PageHeader title="Пользователи" text="Зарегистрированные пользователи: имя, подтверждённый телефон, email, дата регистрации, статус и покупки." />
      <DemoBanner />
      <Card>
        <DataTable
          rows={s.users}
          searchText={(u) => `${u.name} ${u.phone} ${u.email ?? ''}`}
          columns={[
            { key: 'n', header: 'Имя', sortValue: (u) => u.name, cell: (u) => <b>{u.name}</b> },
            { key: 'p', header: 'Телефон', cell: (u) => u.phone },
            { key: 'e', header: 'Email', cell: (u) => u.email ?? <span className="text-slate-300">—</span> },
            { key: 'r', header: 'Регистрация', sortValue: (u) => u.registeredAt, cell: (u) => dateTime(u.registeredAt) },
            { key: 's', header: 'Статус', cell: (u) => <Badge tone={u.status === 'ACTIVE' ? 'green' : 'red'}>{u.status === 'ACTIVE' ? 'Активен' : 'Заблокирован'}</Badge> },
            { key: 'b', header: 'Покупки', cell: (u) => `${u.tickets} бил. · ${money(u.spentMinor)}` },
            { key: 'a', header: '', cell: (u) => <button className={btn.soft} onClick={() => setSel(u)}>Подробнее</button> },
          ]}
        />
      </Card>
      {current && (
        <Modal title={current.name} onClose={() => setSel(null)}>
          <dl className="space-y-3 text-sm">
            {([['Телефон', `${current.phone} (подтверждён)`], ['Email', current.email ?? '—'], ['Зарегистрирован', dateTime(current.registeredAt)], ['Заказов', current.orders], ['Билетов', current.tickets], ['Потрачено', money(current.spentMinor)]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-ink">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-5 flex justify-end">
            {current.status === 'ACTIVE'
              ? <button className={btn.danger} onClick={() => confirm('Заблокировать аккаунт?') && actions.setUserStatus(current.id, 'SUSPENDED', actor)}>Заблокировать</button>
              : <button className={btn.ok} onClick={() => actions.setUserStatus(current.id, 'ACTIVE', actor)}>Разблокировать</button>}
          </div>
        </Modal>
      )}
    </div>
  )
}
