'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { actions, useAdminState } from '@/lib/admin/store'
import type { StaffRole } from '@/lib/admin/types'
import { useAdminUser } from '../AdminShell'
import { Badge, Card, DataTable, DemoBanner, Field, Modal, PageHeader, btn, field } from '../ui'
import { Select } from '../Select'
import { ROLE_LABEL } from './labels'

export function Staff() {
  const s = useAdminState()
  const { actor } = useAdminUser()
  const [adding, setAdding] = useState(false)
  const [m, setM] = useState<{ name: string; contact: string; role: StaffRole; forumIds: string[] }>({ name: '', contact: '', role: 'SCANNER', forumIds: [] })

  return (
    <div>
      <PageHeader title="Сотрудники и роли" text="Главный администратор: всё. Менеджер: форумы, заказы, отмены, отчёты. Оператор входа: только сканирование на назначенном форуме.">
        <button className={btn.primary} onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Добавить сотрудника</button>
      </PageHeader>
      <DemoBanner note="Права проверяются и на сервере: интерфейс лишь скрывает недоступные разделы. Список сотрудников пока хранится в браузере." />
      <Card>
        <DataTable
          rows={s.staff}
          columns={[
            { key: 'n', header: 'Сотрудник', cell: (x) => (<div><b>{x.name}</b><p className="text-xs text-slate-400">{x.contact}</p></div>) },
            { key: 'r', header: 'Роль', cell: (x) => (
              <Select aria-label="Роль" value={x.role} onChange={(v) => actions.setStaffRole(x.id, v as StaffRole, actor)} options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
            ) },
            { key: 'f', header: 'Форумы', cell: (x) => x.role === 'SCANNER' ? (x.forumIds.map((id) => s.forums.find((f) => f.id === id)?.title.ru).filter(Boolean).join(', ') || <span className="text-slate-300">не назначен</span>) : <span className="text-slate-300">все</span> },
            { key: 's', header: 'Статус', cell: (x) => <Badge tone={x.active ? 'green' : 'slate'}>{x.active ? 'Активен' : 'Отключён'}</Badge> },
            { key: 'a', header: '', cell: (x) => <button className={x.active ? btn.danger : btn.ok} onClick={() => actions.toggleStaff(x.id, actor)}>{x.active ? 'Отключить' : 'Включить'}</button> },
          ]}
        />
      </Card>
      {adding && (
        <Modal title="Новый сотрудник" onClose={() => setAdding(false)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!m.name.trim() || !m.contact.trim()) return; actions.addStaff({ ...m, name: m.name.trim(), contact: m.contact.trim(), active: true }, actor); setAdding(false); setM({ name: '', contact: '', role: 'SCANNER', forumIds: [] }) }}>
            <Field label="Имя"><input className={field} value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></Field>
            <Field label="Телефон или email"><input className={field} value={m.contact} onChange={(e) => setM({ ...m, contact: e.target.value })} /></Field>
            <Field label="Роль"><Select value={m.role} onChange={(v) => setM({ ...m, role: v as StaffRole })} options={Object.entries(ROLE_LABEL).map(([k, v]) => ({ value: k, label: v }))} /></Field>
            {m.role === 'SCANNER' && (
              <fieldset><legend className="mb-1.5 text-xs font-bold text-ink">Назначенные форумы</legend>
                {s.forums.map((f) => (<label key={f.id} className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={m.forumIds.includes(f.id)} onChange={(e) => setM({ ...m, forumIds: e.target.checked ? [...m.forumIds, f.id] : m.forumIds.filter((x) => x !== f.id) })} />{f.title.ru}</label>))}
              </fieldset>
            )}
            <div className="flex justify-end gap-2"><button type="button" className={btn.soft} onClick={() => setAdding(false)}>Отмена</button><button type="submit" className={btn.primary}>Добавить</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}
