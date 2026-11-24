'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { listUsers, setUserStatus, type AdminUserRow } from '@/lib/admin/api'
import { dateTime } from '@/lib/admin/format'
import { Badge, Card, DataTable, Modal, PageHeader, btn } from '../ui'

const ROLE: Record<string, string> = { USER: 'Пользователь', SUPER_ADMIN: 'Суперадмин', MANAGER: 'Менеджер', SCANNER: 'Сканер' }

export function Users() {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sel, setSel] = useState<AdminUserRow | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const r = await listUsers()
    if (r.ok) { setUsers(r.data!); setError('') } else setError(r.error!)
    setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])

  async function changeStatus(u: AdminUserRow, status: 'ACTIVE' | 'SUSPENDED') {
    const r = await setUserStatus(u.id, status)
    if (!r.ok) return alert(r.error)
    setSel(null)
    void reload()
  }

  return (
    <div>
      <PageHeader title="Пользователи" text="Зарегистрированные пользователи: имя, телефон, email, дата регистрации, статус и покупки." />
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
      <div className="mb-3"><button type="button" className={btn.soft} onClick={() => void reload()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Обновить</button></div>
      <Card>
        <DataTable
          rows={users}
          searchText={(u) => `${u.name} ${u.phone} ${u.email ?? ''}`}
          columns={[
            { key: 'n', header: 'Имя', sortValue: (u) => u.name, cell: (u) => <b>{u.name}</b> },
            { key: 'e', header: 'Email', cell: (u) => u.email ?? <span className="text-slate-300">—</span> },
            { key: 'p', header: 'Телефон', cell: (u) => u.phone },
            { key: 'ro', header: 'Роль', cell: (u) => ROLE[u.role] ?? u.role },
            { key: 'r', header: 'Регистрация', sortValue: (u) => u.registeredAt, cell: (u) => dateTime(u.registeredAt) },
            { key: 's', header: 'Статус', cell: (u) => <Badge tone={u.status === 'ACTIVE' ? 'green' : 'red'}>{u.status === 'ACTIVE' ? 'Активен' : 'Заблокирован'}</Badge> },
            { key: 'b', header: 'Покупки', cell: (u) => `${u.orders} зак. · ${u.tickets} бил.` },
            { key: 'a', header: '', cell: (u) => <button type="button" className={btn.soft} onClick={() => setSel(u)}>Подробнее</button> },
          ]}
        />
      </Card>
      {sel && (
        <Modal title={sel.name} onClose={() => setSel(null)}>
          <dl className="space-y-3 text-sm">
            {([['Email', sel.email ?? '—'], ['Телефон', sel.phone === '—' ? '—' : `${sel.phone}${sel.phoneVerified ? ' (подтверждён)' : ''}`], ['Роль', ROLE[sel.role] ?? sel.role], ['Зарегистрирован', dateTime(sel.registeredAt)], ['Заказов', sel.orders], ['Билетов', sel.tickets]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-ink">{v}</dd></div>
            ))}
          </dl>
          {sel.role === 'USER' && (
            <div className="mt-5 flex justify-end">
              {sel.status === 'ACTIVE'
                ? <button type="button" className={btn.danger} onClick={() => confirm('Заблокировать аккаунт?') && void changeStatus(sel, 'SUSPENDED')}>Заблокировать</button>
                : <button type="button" className={btn.ok} onClick={() => void changeStatus(sel, 'ACTIVE')}>Разблокировать</button>}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
