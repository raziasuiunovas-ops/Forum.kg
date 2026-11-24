'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, Lock, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'

export interface CheckoutCategory {
  id: string
  code: string
  name: string
  priceMinor: number
  priceLabel: string
  available: number
}

interface Row {
  categoryId: string
  first: string
  last: string
}

export function CheckoutClient({
  locale,
  slug,
  forumId,
  forumTitle,
  forumMeta,
  isDemo,
  categories,
  maxPerAccount,
  messages,
}: {
  locale: string
  slug: string
  forumId: string
  forumTitle: string
  forumMeta: string
  isDemo: boolean
  categories: CheckoutCategory[]
  maxPerAccount: number
  messages: Messages
}) {
  const t = makeT(messages)
  const router = useRouter()
  const search = useSearchParams()
  const selfUrl = `/${locale}/forums/${slug}/checkout?${search.toString()}`

  const free = categories.filter((c) => c.available > 0)
  const initialCat = categories.find((c) => c.code === search.get('cat') && c.available > 0) ?? free[0]
  const initialQty = Math.max(1, Math.min(maxPerAccount, Number(search.get('qty')) || 1))

  const [ready, setReady] = useState(false)
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: initialQty }, () => ({ categoryId: initialCat?.id ?? '', first: '', last: '' })),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idem = useRef<{ payload: string; key: string } | null>(null)

  // Must be signed in; prefill the first attendee with the account holder's name.
  useEffect(() => {
    let alive = true
    api<{ user: { firstName?: string | null; lastName?: string | null } }>('/api/v1/users/me').then((res) => {
      if (!alive) return
      if (!res.ok) {
        router.replace(`/${locale}/login?next=${encodeURIComponent(selfUrl)}`)
        return
      }
      const u = res.data?.user
      setRows((r) => r.map((row, i) => (i === 0 && !row.first && !row.last ? { ...row, first: u?.firstName ?? '', last: u?.lastName ?? '' } : row)))
      setReady(true)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const priceOf = (id: string) => categories.find((c) => c.id === id)?.priceMinor ?? 0
  const total = rows.reduce((sum, r) => sum + priceOf(r.categoryId), 0)
  const fmt = (minor: number) =>
    `${new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale === 'ky' ? 'ky-KG' : 'ru-RU', { maximumFractionDigits: 0 }).format(minor / 100)} ${locale === 'en' ? 'KGS' : 'сом'}`

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (rows.some((r) => !r.first.trim() || !r.last.trim() || !r.categoryId)) return setError(t('errors.names'))

    const items = rows.map((r) => ({
      ticketCategoryId: r.categoryId,
      participantFirstName: r.first.trim(),
      participantLastName: r.last.trim(),
    }))
    const payload = JSON.stringify({ forumId, items })
    // Same payload => same Idempotency-Key, so a double click or retry never creates two orders.
    if (!idem.current || idem.current.payload !== payload) {
      idem.current = { payload, key: crypto.randomUUID() }
    }

    setBusy(true)
    const res = await api<{ order: { id: string }; paymentUrl: string }>('/api/v1/orders', {
      method: 'POST',
      csrf: true,
      headers: { 'Idempotency-Key': idem.current.key },
      body: { forumId, items },
    })
    if (res.ok && res.data?.paymentUrl) {
      try {
        sessionStorage.setItem('lastOrderId', res.data.order.id)
      } catch {
        /* storage may be unavailable */
      }
      window.location.href = res.data.paymentUrl
      return
    }
    setBusy(false)
    if (res.network) return setError(t('errors.network'))
    if (res.status === 401) {
      return router.replace(`/${locale}/login?next=${encodeURIComponent(selfUrl)}`)
    }
    const known = res.code ? t(`errors.${res.code}`) : ''
    setError(known && known !== `errors.${res.code}` ? known : t('errors.generic'))
  }

  const input =
    'mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30'
  
  const selectInput =
    'mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23475569\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-12 cursor-pointer hover:border-primary/50'

  if (isDemo) {
    return (
      <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm text-slate-600">{t('demo')}</p>
        <Link href={`/${locale}/forums`} className="mt-5 inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-bold text-white">
          {t('back')}
        </Link>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-500" role="status">
        <Loader2 className="h-5 w-5 animate-spin" /> {t('loading')}
      </div>
    )
  }

  return (
    <form onSubmit={pay} noValidate className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <div>
        <Link href={`/${locale}/forums/${slug}`} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> {t('back')}
        </Link>
        <h1 className="mt-4 text-4xl font-black leading-tight tracking-tighter text-ink sm:text-5xl">{t('title')}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('subtitle')}</p>

        <ul className="mt-6 space-y-4">
          {rows.map((row, i) => (
            <li key={i} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-ink">{t('ticket', { n: i + 1 })}</p>
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))} className="inline-flex items-center gap-1 text-xs font-bold text-red-500">
                    <Trash2 className="h-3.5 w-3.5" /> {t('remove')}
                  </button>
                )}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`f${i}`} className="block text-xs font-bold text-ink">{t('firstName')}</label>
                  <input id={`f${i}`} value={row.first} onChange={(e) => update(i, { first: e.target.value })} className={input} />
                </div>
                <div>
                  <label htmlFor={`l${i}`} className="block text-xs font-bold text-ink">{t('lastName')}</label>
                  <input id={`l${i}`} value={row.last} onChange={(e) => update(i, { last: e.target.value })} className={input} />
                </div>
              </div>
              <label htmlFor={`c${i}`} className="mt-3 block text-xs font-bold text-ink">{t('category')}</label>
              <select id={`c${i}`} value={row.categoryId} onChange={(e) => update(i, { categoryId: e.target.value })} className={selectInput}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.available <= 0}>
                    {c.name} — {c.priceLabel} {c.available <= 0 ? `(${t('soldOut')})` : `(${t('left', { n: c.available })})`}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">{t('limit', { n: maxPerAccount })}</p>
          {rows.length < maxPerAccount && (
            <button
              type="button"
              onClick={() => setRows((r) => [...r, { categoryId: initialCat?.id ?? '', first: '', last: '' }])}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2 text-xs font-bold text-primary transition hover:bg-primary/15"
            >
              <Plus className="h-4 w-4" /> {t('addTicket')}
            </button>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-slate-200/70">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">{forumMeta}</p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-ink">{forumTitle}</h2>

          <ul className="mt-5 space-y-2 border-t border-slate-200 pt-5 text-sm">
            {rows.map((r, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-slate-500">
                  {t('ticket', { n: i + 1 })} · {categories.find((c) => c.id === r.categoryId)?.name}
                </span>
                <span className="font-bold text-ink">{fmt(priceOf(r.categoryId))}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-5">
            <span className="text-sm font-semibold text-slate-500">{t('total')}</span>
            <span className="text-2xl font-black text-ink">{fmt(total)}</span>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-white shadow-[0_14px_32px_-10px_hsl(var(--primary))] transition hover:-translate-y-0.5 hover:brightness-110 disabled:translate-y-0 disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t('paying')}
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" /> {t('pay')}
              </>
            )}
          </button>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-400">{t('secure')}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{t('hold')}</p>
        </div>
      </aside>
    </form>
  )
}
