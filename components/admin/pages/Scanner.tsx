'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Check } from 'lucide-react'
import { api } from '@/lib/client/api'
import { actions, useAdminState } from '@/lib/admin/store'
import { dateTime } from '@/lib/admin/format'
import { useAdminUser } from '../AdminShell'
import { Card, DataTable, Field, PageHeader, btn, field, select } from '../ui'

interface RealForum { id: string; title: string }
interface Result {
  kind: 'ok' | 'fail' | 'expired'
  title: string
  detail?: string
  participant?: string
  category?: string
  forum?: string
  ticket?: string
  at: string
}

// Failure codes of POST /api/v1/check-in/validate -> messages required by the spec (12.3).
const FAIL: Record<string, string> = {
  TICKET_ALREADY_USED: 'TICKET ALREADY USED',
  ALREADY_CHECKED_IN: 'TICKET ALREADY USED',
  TICKET_CANCELLED: 'TICKET CANCELLED',
  TICKET_NOT_FOUND: 'INVALID TICKET',
  INVALID_QR_FORMAT: 'INVALID TICKET',
  VALIDATION_ERROR: 'INVALID TICKET',
  WRONG_FORUM: 'WRONG FORUM',
  TICKET_EXPIRED: 'QR CODE EXPIRED',
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function Scanner() {
  const { actor } = useAdminUser()
  const s = useAdminState()
  const [forums, setForums] = useState<RealForum[] | null>(null)
  const [forumId, setForumId] = useState('')
  const [manual, setManual] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [cam, setCam] = useState(false)
  const [camError, setCamError] = useState('')
  const [stats, setStats] = useState<{ total: number; checkedIn: number } | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const last = useRef({ v: '', t: 0 })
  const busyRef = useRef(false)

  useEffect(() => {
    api<{ forums: { id: string; title: string }[] }>('/api/v1/forums?limit=100').then((res) => {
      const list = res.data?.forums ?? []
      setForums(list)
      if (list[0]) setForumId(list[0].id)
    })
  }, [])

  const loadStats = useCallback(async (id: string) => {
    if (!id) return setStats(null)
    const res = await api<any>(`/api/v1/check-in/forums/${id}/stats`)
    const st = res.data?.stats
    setStats(res.ok && st ? { total: st.totalTickets, checkedIn: st.checkedIn } : null)
  }, [])
  useEffect(() => { void loadStats(forumId) }, [forumId, loadStats])

  const validate = useCallback(async (qrData: string) => {
    if (!forumId || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const res = await api<any>('/api/v1/check-in/validate', { method: 'POST', csrf: true, body: { qrData: qrData.trim(), forumId } })
    busyRef.current = false
    setBusy(false)
    const at = new Date().toISOString()
    if (res.ok && res.data?.ticket) {
      const t = res.data.ticket
      setResult({ kind: 'ok', title: 'PAID', participant: `${t.participant?.firstName ?? ''} ${t.participant?.lastName ?? ''}`.trim(), category: t.category?.name ?? t.category?.code, forum: t.forum?.title, ticket: t.ticketNumber, at: res.data.checkIn?.checkedInAt ?? at })
      void loadStats(forumId)
    } else if (res.network) {
      setResult({ kind: 'fail', title: 'NO CONNECTION', detail: 'Нет интернета. Используйте процедуру временного допуска по чеку (внизу страницы).', at })
    } else if (res.status === 401 || res.status === 403) {
      setResult({ kind: 'fail', title: 'ACCESS DENIED', detail: 'Нет прав на проверку билетов.', at })
    } else {
      const title = FAIL[res.code ?? ''] ?? 'INVALID TICKET'
      setResult({ kind: title === 'QR CODE EXPIRED' ? 'expired' : 'fail', title, detail: res.message, at })
    }
  }, [forumId, loadStats])

  // Camera scanning through the browser's BarcodeDetector (Chrome/Android/Edge). Manual input works everywhere.
  useEffect(() => {
    if (!cam) return
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let stopped = false
    ;(async () => {
      const BD = (window as any).BarcodeDetector
      if (!BD) { setCamError('Этот браузер не умеет читать QR с камеры. Введите код вручную или откройте страницу в Chrome.'); setCam(false); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
        const detector = new BD({ formats: ['qr_code'] })
        timer = setInterval(async () => {
          if (!videoRef.current || busyRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const v = codes[0]?.rawValue as string | undefined
            if (v && (v !== last.current.v || Date.now() - last.current.t > 4000)) {
              last.current = { v, t: Date.now() }
              void validate(v)
            }
          } catch { /* frame not ready */ }
        }, 300)
      } catch {
        setCamError('Нет доступа к камере. Разрешите камеру в настройках браузера.')
        setCam(false)
      }
    })()
    return () => { stopped = true; if (timer) clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [cam, validate])

  const forumName = (id: string) => s.forums.find((f) => f.id === id)?.title.ru ?? '—'
  const [off, setOff] = useState({ participant: '', receipt: '', app: 'MBank', note: '' })

  return (
    <div>
      <PageHeader title="Вход / QR-сканер" text="Проверка билетов на входе. Билет действует один раз; повторное сканирование и просроченный QR отклоняются." />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Сканирование">
          <Field label="Форум">
            {forums && forums.length > 0 ? (
              <select className={select} value={forumId} onChange={(e) => setForumId(e.target.value)}>{forums.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select>
            ) : (
              <input className={field} value={forumId} onChange={(e) => setForumId(e.target.value.trim())} placeholder="UUID форума (в базе нет опубликованных форумов)" />
            )}
          </Field>

          <div className="mt-4 overflow-hidden rounded-xl bg-ink">
            {cam ? <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center text-sm text-white/50">Камера выключена</div>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={btn.primary} onClick={() => { setCamError(''); setCam((v) => !v) }} disabled={!forumId}>{cam ? <><CameraOff className="h-4 w-4" /> Выключить камеру</> : <><Camera className="h-4 w-4" /> Включить камеру</>}</button>
            {camError && <p role="alert" className="text-xs font-semibold text-red-600">{camError}</p>}
          </div>

          <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { void validate(manual); setManual('') } }}>
            <input className={field} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Код вручную: FORUM.KG|TIX-...|..." aria-label="QR-код вручную" />
            <button type="submit" className={btn.primary} disabled={busy || !forumId}>Проверить</button>
          </form>
        </Card>

        <Card title="Статистика входа">
          {stats ? (
            <div>
              <p className="text-4xl font-black tracking-tight text-ink">{stats.checkedIn} <span className="text-lg font-bold text-slate-400">/ {stats.total}</span></p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.total ? Math.round((stats.checkedIn / stats.total) * 100) : 0}%` }} /></div>
              <p className="mt-2 text-xs text-slate-500">Прошло / выдано билетов</p>
            </div>
          ) : <p className="text-sm text-slate-400">Выберите форум, чтобы увидеть статистику.</p>}
        </Card>
      </div>

      <Card title="Временный допуск по чеку (если нет интернета)" className="mt-6">
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">Исключительная процедура. Чек не доказывает владение билетом и уникальность, поэтому допуск помечается как <b>непроверенный</b>, а не как успешная проверка QR. После восстановления связи записи сверяются с заказами; дубли и несовпадения отмечаются.</p>
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_9rem_auto]" onSubmit={(e) => { e.preventDefault(); if (!off.participant.trim() || !off.receipt.trim()) return; actions.addOffline({ forumId: forumId || 'unknown', participant: off.participant.trim(), receipt: off.receipt.trim(), app: off.app, operator: actor, observedAt: new Date().toISOString(), note: off.note }, actor); setOff({ participant: '', receipt: '', app: off.app, note: '' }) }}>
          <input className={field} placeholder="Имя участника" aria-label="Имя участника" value={off.participant} onChange={(e) => setOff({ ...off, participant: e.target.value })} />
          <input className={field} placeholder="Номер транзакции с чека" aria-label="Номер транзакции" value={off.receipt} onChange={(e) => setOff({ ...off, receipt: e.target.value })} />
          <select className={field} aria-label="Приложение" value={off.app} onChange={(e) => setOff({ ...off, app: e.target.value })}><option>MBank</option><option>O!Dengi</option><option>Другое</option></select>
          <button className={btn.primary} type="submit">Записать</button>
        </form>
        <div className="mt-5">
          <DataTable
            rows={s.offline}
            pageSize={5}
            empty="Записей нет"
            columns={[
              { key: 'p', header: 'Участник', cell: (o) => <b>{o.participant}</b> },
              { key: 'r', header: 'Чек', cell: (o) => `${o.app} · ${o.receipt}` },
              { key: 'f', header: 'Форум', cell: (o) => forumName(o.forumId) },
              { key: 't', header: 'Время', cell: (o) => dateTime(o.observedAt) },
              { key: 'o', header: 'Оператор', cell: (o) => o.operator },
              { key: 's', header: 'Статус', cell: (o) => (
                <select className={`${field} !h-9 w-44 text-xs`} aria-label="Статус сверки" value={o.status} onChange={(e) => actions.setOfflineStatus(o.id, e.target.value as typeof o.status, actor)}>
                  <option value="PROVISIONAL">Непроверен</option><option value="VERIFIED">Подтверждён</option><option value="REJECTED">Отклонён</option><option value="DUPLICATE">Дубль</option>
                </select>) },
            ]}
          />
        </div>
      </Card>

      {result && (
        <div role="alertdialog" aria-modal="true" aria-label={result.title} onClick={() => setResult(null)}
          className={`fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center p-6 text-center ${result.kind === 'ok' ? 'bg-emerald-500 text-white' : result.kind === 'expired' ? 'bg-black text-white' : 'bg-red-600 text-white'}`}>
          {result.kind === 'ok' && <span className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/20"><Check className="h-12 w-12" /></span>}
          <p className="text-5xl font-black tracking-tight sm:text-7xl">{result.title}</p>
          {result.kind === 'ok' ? (
            <div className="mt-6 space-y-1 text-lg font-semibold">
              <p className="text-3xl font-black">{result.participant}</p>
              <p>{result.category} · {result.ticket}</p>
              <p className="text-white/80">{result.forum}</p>
            </div>
          ) : result.kind === 'expired' ? (
            <p className="mt-4 max-w-md text-base text-white/70">Срок действия QR-кода истёк. Вход по этому билету невозможен.</p>
          ) : (
            result.detail && <p className="mt-4 max-w-md text-base text-white/85">{result.detail}</p>
          )}
          <p className="mt-6 text-sm text-white/70">{dateTime(result.at, true)}</p>
          <p className="mt-8 text-xs uppercase tracking-widest text-white/60">Нажмите, чтобы продолжить</p>
        </div>
      )}
    </div>
  )
}
