'use client'

import { useState } from 'react'
import { api } from '@/lib/client/api'
import { dateTime } from '@/lib/admin/format'
import { Badge, Card, DemoBanner, PageHeader, btn } from '../ui'

type State = 'NOT_CONFIGURED' | 'HEALTHY' | 'DEGRADED' | 'ERROR'
interface Row { id: string; name: string; state: State; error?: string; fix: string; checkedAt?: string }

const STATE: Record<State, { label: string; tone: 'slate' | 'green' | 'amber' | 'red' }> = {
  NOT_CONFIGURED: { label: 'Не настроено', tone: 'slate' },
  HEALTHY: { label: 'Работает', tone: 'green' },
  DEGRADED: { label: 'Деградация', tone: 'amber' },
  ERROR: { label: 'Ошибка', tone: 'red' },
}

const INITIAL: Row[] = [
  { id: 'api', name: 'API и база данных', state: 'NOT_CONFIGURED', fix: 'Нажмите «Проверить»: будет вызван /api/v1/health.' },
  { id: 'google', name: 'Вход через Google', state: 'NOT_CONFIGURED', error: 'Сервер отвечает 501 NOT_IMPLEMENTED', fix: 'Создайте OAuth Client ID в Google Cloud Console и добавьте GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Redirect URI: https://<домен>/api/v1/auth/google/callback.' },
  { id: 'sms', name: 'SMS-провайдер (коды входа)', state: 'NOT_CONFIGURED', fix: 'Провайдер ещё не выбран (проверьте покрытие номеров Кыргызстана, цену и SLA).' },
  { id: 'finik', name: 'Платежи Finik', state: 'NOT_CONFIGURED', fix: 'Задайте FINIK_ENV, FINIK_API_KEY, FINIK_ACCOUNT_ID, FINIK_PRIVATE_KEY, публичный ключ Finik, FINIK_REDIRECT_URL и FINIK_WEBHOOK_URL.' },
  { id: 'telegram', name: 'Telegram-бот', state: 'NOT_CONFIGURED', fix: 'Укажите TELEGRAM_BOT_TOKEN и настройте webhook на /api/v1/telegram/webhook. Бот также отправляет коды входа администраторов.' },
  { id: 'push', name: 'Web Push', state: 'NOT_CONFIGURED', fix: 'Сгенерируйте VAPID-ключи и добавьте их в переменные окружения.' },
  { id: 'ai', name: 'ИИ-интеграция', state: 'NOT_CONFIGURED', fix: 'Остаётся «Не настроено», пока не утверждены назначение и реализация (ТЗ, п. 8.6).' },
]

/** Spec 8.6: real state, last check, error and a human-readable fix. Secrets are never shown. */
export function Integrations() {
  const [rows, setRows] = useState<Row[]>(INITIAL)
  const [busy, setBusy] = useState(false)

  async function checkApi() {
    setBusy(true)
    const res = await api('/api/v1/health')
    setBusy(false)
    const at = new Date().toISOString()
    setRows((r) => r.map((x) => x.id !== 'api' ? x : res.ok ? { ...x, state: 'HEALTHY', error: undefined, fix: 'Всё в порядке.', checkedAt: at } : { ...x, state: 'ERROR', error: res.network ? 'Нет связи с сервером' : `HTTP ${res.status}`, fix: 'Проверьте DATABASE_URL, миграции и журналы на хостинге.', checkedAt: at }))
  }

  return (
    <div>
      <PageHeader title="Интеграции и состояние" text="Реальное состояние сервисов, время последней проверки, ошибка и что сделать. Ключи и секреты здесь никогда не показываются." />
      <DemoBanner note="Реально проверяется только API и база. Остальные интеграции показывают «Не настроено», пока у сервера нет проверки их конфигурации (/api/v1/integrations/health описан в OpenAPI)." />
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-extrabold text-ink">{r.name}</h2>
              <Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge>
            </div>
            {r.error && <p className="mt-2 text-xs font-semibold text-red-600">{r.error}</p>}
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{r.fix}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">{r.checkedAt ? `Проверено: ${dateTime(r.checkedAt, true)}` : 'Не проверялось'}</span>
              {r.id === 'api' && <button className={btn.soft} onClick={checkApi} disabled={busy}>{busy ? 'Проверяем...' : 'Проверить'}</button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
