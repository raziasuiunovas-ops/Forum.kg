'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Minus, Plus, Ticket } from 'lucide-react'
import { isSignedIn } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'

export interface BuyCategory {
  id: string
  code: string
  name: string
  priceMinor: number
  priceLabel: string
  available: number
}

export function BuyPanel({
  locale,
  slug,
  isDemo,
  categories,
  maxPerAccount,
  messages,
}: {
  locale: string
  slug: string
  isDemo: boolean
  categories: BuyCategory[]
  maxPerAccount: number
  messages: Messages
}) {
  const t = makeT(messages)
  const router = useRouter()
  const firstFree = categories.find((c) => c.available > 0)
  const [code, setCode] = useState(firstFree?.code ?? categories[0]?.code)
  const [qty, setQty] = useState(1)
  const [state, setState] = useState<'idle' | 'checking' | 'demo'>('idle')

  const selected = categories.find((c) => c.code === code)
  const soldOutAll = !firstFree
  const max = Math.max(1, Math.min(maxPerAccount, selected?.available ?? 1))
  const total = (selected?.priceMinor ?? 0) * qty

  async function onBuy() {
    setState('checking')
    const signedIn = await isSignedIn()
    const checkout = `/${locale}/forums/${slug}/checkout?cat=${encodeURIComponent(code ?? '')}&qty=${qty}`
    if (!signedIn) {
      router.push(`/${locale}/login?next=${encodeURIComponent(checkout)}`)
    } else if (isDemo) {
      // Built-in demo events cannot be ordered (they are not in the database).
      setState('demo')
    } else {
      router.push(checkout)
    }
  }

  return (
    <div className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-slate-200/70" id="tickets">
      <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-ink">
        <Ticket className="h-5 w-5 text-primary" />
        {t('tickets')}
      </h2>

      {soldOutAll ? (
        <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-600">{t('soldOutNote')}</p>
      ) : (
        <>
          <ul className="mt-5 space-y-3" role="radiogroup" aria-label={t('category')}>
            {categories.map((c) => {
              const disabled = c.available <= 0
              const active = c.code === code
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    onClick={() => {
                      setCode(c.code)
                      setQty(1)
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 p-4 text-left transition ${
                      active ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'
                    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <span>
                      <span className="block text-sm font-extrabold text-ink">{c.name}</span>
                      <span className={`block text-[11px] font-semibold ${disabled ? 'text-red-500' : 'text-emerald-600'}`}>
                        {disabled ? t('soldOut') : t('left', { n: c.available })}
                      </span>
                    </span>
                    <span className="text-base font-black text-ink">{c.priceLabel}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="mt-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-ink">{t('quantity')}</p>
              <p className="text-[11px] text-slate-500">{t('limit', { n: maxPerAccount })}</p>
            </div>
            <div className="flex items-center gap-3 rounded-full bg-slate-100 p-1">
              <button
                type="button"
                aria-label="−"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-5 text-center text-sm font-black" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                aria-label="+"
                onClick={() => setQty((q) => Math.min(max, q + 1))}
                disabled={qty >= max}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-5">
            <span className="text-sm font-semibold text-slate-500">{t('total')}</span>
            {/* qty=1 uses the server-formatted price (no hydration mismatch between Node and browser ICU) */}
            <span className="text-2xl font-black text-ink" suppressHydrationWarning>
              {qty === 1
                ? selected?.priceLabel
                : `${new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale === 'ky' ? 'ky-KG' : 'ru-RU', {
                    maximumFractionDigits: 0,
                  }).format(total / 100)} ${t('kgs')}`}
            </span>
          </div>

          <button
            type="button"
            onClick={onBuy}
            disabled={state === 'checking'}
            className="group mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-white shadow-[0_14px_32px_-10px_hsl(var(--primary))] transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-60"
          >
            {state === 'checking' ? t('checking') : t('buy')}
            <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </button>

          {state === 'demo' && (
            <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-800" role="status">
              <p className="font-bold">{t('demoTitle')}</p>
              <p className="mt-1">{t('demoText')}</p>
            </div>
          )}
          <p className="mt-4 text-center text-[11px] text-slate-400">{t('perks')}</p>
        </>
      )}
    </div>
  )
}
