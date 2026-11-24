'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { useAdminState } from '@/lib/admin/store'
import { bishkekDay, dateTime, downloadCsv } from '@/lib/admin/format'
import { Badge, Card, DataTable, DemoBanner, PageHeader, btn, field, select, DateInput, getTodayDate } from '../ui'

export function Audit() {
  const { audit } = useAdminState()
  const [day, setDay] = useState(getTodayDate())
  const [actor, setActor] = useState('all')
  const actors = Array.from(new Set(audit.map((a) => a.actor)))
  const rows = audit.filter((a) => (!day || bishkekDay(a.at) === day) && (actor === 'all' || a.actor === actor))

  return (
    <div>
      <PageHeader title="Журнал аудита" text="Чувствительные действия: публикация, цены и даты, отмены, роли, ручное аннулирование билетов, настройки сайта.">
        <button className={btn.soft} onClick={() => downloadCsv('audit.csv', [['Время', 'Кто', 'Действие', 'Объект', 'Цель'], ...rows.map((a) => [dateTime(a.at, true), a.actor, a.action, a.targetType, a.target])])}><Download className="h-4 w-4" /> CSV</button>
      </PageHeader>
      <DemoBanner note="Записи создаются действиями в этой панели и хранятся в браузере. На сервере журнал ведётся таблицей AuditLog." />
      <Card>
        <DataTable
          rows={rows}
          pageSize={12}
          searchText={(a) => `${a.action} ${a.target} ${a.actor}`}
          toolbar={
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <DateInput aria-label="Дата" className="w-full sm:w-44" value={day} onChange={(e) => setDay(e.target.value)} />
              <select aria-label="Сотрудник" className={`${field} w-full sm:w-52`} value={actor} onChange={(e) => setActor(e.target.value)}>
                <option value="all">Все сотрудники</option>
                {actors.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
          }
          columns={[
            { key: 't', header: 'Время', sortValue: (a) => a.at, cell: (a) => dateTime(a.at, true) },
            { key: 'a', header: 'Кто', cell: (a) => a.actor },
            { key: 'x', header: 'Действие', cell: (a) => <Badge tone="blue">{a.action}</Badge> },
            { key: 'o', header: 'Объект', cell: (a) => a.targetType },
            { key: 'g', header: 'Цель', cell: (a) => a.target },
          ]}
        />
      </Card>
    </div>
  )
}
