'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import { api } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'

type View = 'loading' | 'waiting' | 'paid' | 'failed' | 'expired' | 'unknown' | 'noorder'

const POLL_MS = 3000
const MAX_POLLS = 100 // ~5 minutes

/** Shows the result of a Finik payment by polling the backend (never trusts the browser redirect alone). */
export function PaymentResult({
  locale,
  messages,
  orderId: orderIdProp,
}: {
  locale: string
  messages: Messages
  orderId?: string
}) {
  const t = makeT(messages)
  const search = useSearchParams()
  const [view, setView] = useState<View>('loading')
  const [orderId, setOrderId] = useState<string | null>(null)

  useEffect(() => {
    let id = orderIdProp ?? search.get('orderId')
    if (!id) {
      try {
        id = sessionStorage.getItem('lastOrderId')
      } catch {
        /* ignore */
      }
    }
    if (!id) {
      setView('noorder')
      return
    }
    setOrderId(id)

    let alive = true
    let polls = 0
    let timer: ReturnType<typeof setTimeout>

    async function tick() {
      const res = await api<{ orderStatus: string; paymentStatus: string | null }>(`/api/v1/orders/${id}/payment-status`)
      if (!alive) return
      if (res.ok && res.data) {
        const s = res.data.orderStatus
        if (s === 'PAID') return setView('paid')
        if (s === 'EXPIRED') return setView('expired')
        if (s === 'PAYMENT_FAILED' || s === 'CANCELLED') return setView('failed')
        setView('waiting')
      } else if (res.status === 401 || res.status === 403 || res.status === 404) {
        return setView('unknown')
      } else {
        setView('waiting')
      }
      if (++polls < MAX_POLLS) timer = setTimeout(tick, POLL_MS)
      else setView('unknown')
    }
    void tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [orderIdProp, search])

  const box = 'mx-auto max-w-md rounded-[2rem] bg-white p-10 text-center shadow-xl ring-1 ring-slate-200/70'
  const btn = 'mt-7 inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-sm font-bold text-white transition hover:brightness-110'

  if (view === 'loading')
    return (
      <div className={box} role="status">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-slate-500">{t('checking')}</p>
      </div>
    )

  const cfg = {
    waiting: { Icon: Clock, color: 'text-amber-500', title: t('waitTitle'), text: t('waitText'), spin: true },
    paid: { Icon: CheckCircle2, color: 'text-emerald-500', title: t('paidTitle'), text: t('paidText'), spin: false },
    failed: { Icon: XCircle, color: 'text-red-500', title: t('failedTitle'), text: t('failedText'), spin: false },
    expired: { Icon: XCircle, color: 'text-red-500', title: t('expiredTitle'), text: t('expiredText'), spin: false },
    unknown: { Icon: XCircle, color: 'text-slate-400', title: t('unknown'), text: '', spin: false },
    noorder: { Icon: XCircle, color: 'text-slate-400', title: t('noOrder'), text: '', spin: false },
  }[view]

  return (
    <div className={box} role="status" aria-live="polite">
      <cfg.Icon className={`mx-auto h-14 w-14 ${cfg.color}`} />
      <h1 className="mt-5 text-2xl font-black tracking-tight text-ink">{cfg.title}</h1>
      {cfg.text && <p className="mt-3 text-sm leading-relaxed text-slate-500">{cfg.text}</p>}
      {cfg.spin && <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-slate-400" />}
      {orderId && <p className="mt-4 text-[11px] text-slate-400">{t('order')}: {orderId.slice(0, 8)}</p>}
      {(view === 'paid' || view === 'unknown' || view === 'noorder') && (
        <Link href={`/${locale}/account`} className={btn}>
          {t('tickets')}
        </Link>
      )}
      {(view === 'failed' || view === 'expired') && (
        <Link href={`/${locale}/forums`} className={btn}>
          {t('again')}
        </Link>
      )}
    </div>
  )
}
