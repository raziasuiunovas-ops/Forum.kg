'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Loader2, Pencil } from 'lucide-react'
import { api, resetCsrf, type ApiResult } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'

type Step = 'checking' | 'phone' | 'code' | 'profile'

interface UserDto {
  firstName?: string | null
  lastName?: string | null
}

/** "0700 123 456" / "+996700123456" / "700123456" -> "700123456" (9 digits) or null */
export function normalizeKgPhone(input: string): string | null {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('996') && d.length === 12) d = d.slice(3)
  else if (d.startsWith('0') && d.length === 10) d = d.slice(1)
  return d.length === 9 ? d : null
}

function formatLocal(d: string) {
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(' ')
}

export function LoginForm({ locale, messages }: { locale: string; messages: Messages }) {
  const t = makeT(messages)
  const router = useRouter()
  const search = useSearchParams()

  // Only allow redirects inside this locale (prevents open redirects).
  const rawNext = search.get('next')
  const next = rawNext && rawNext.startsWith(`/${locale}/`) && !rawNext.startsWith('//') ? rawNext : `/${locale}/account`

  const [step, setStep] = useState<Step>('checking')
  const [phone, setPhone] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [googleMsg, setGoogleMsg] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const boxes = useRef<(HTMLInputElement | null)[]>([])

  const errorText = useCallback(
    (res: ApiResult, fallbackKey = 'errors.generic') => {
      if (res.network) return t('errors.network')
      if (res.status === 429 || res.code === 'RATE_LIMIT_EXCEEDED' || res.code === 'TOO_MANY_ATTEMPTS') return t('errors.tooMany')
      if (res.code === 'INVALID_OTP') return t('errors.invalidCode')
      if (res.code === 'OTP_EXPIRED' || res.code === 'OTP_ALREADY_USED') return t('errors.expired')
      if (res.code === 'INVALID_PHONE') return t('errors.invalidPhone')
      if (res.status >= 500) return t('errors.server')
      return t(fallbackKey)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages],
  )

  // Already signed in? -> go straight on. Runs exactly once: a later re-run would skip the
  // "tell us your name" step for brand-new users right after they verified their code.
  const sessionChecked = useRef(false)
  useEffect(() => {
    if (sessionChecked.current) return
    sessionChecked.current = true
    api('/api/v1/auth/session').then((res) => {
      if (res.ok) router.replace(next)
      else setStep((s) => (s === 'checking' ? 'phone' : s))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault()
    const n = normalizeKgPhone(phone)
    if (!n) return setError(t('errors.invalidPhone'))
    setBusy(true)
    setError(null)
    const res = await api<{ challengeId: string }>('/api/v1/auth/phone/request-otp', {
      method: 'POST',
      body: { phone: `+996${n}`, purpose: 'LOGIN' },
    })
    setBusy(false)
    if (!res.ok || !res.data?.challengeId) return setError(errorText(res))
    setChallengeId(res.data.challengeId)
    setDigits(['', '', '', '', '', ''])
    setResendIn(60)
    setStep('code')
    setTimeout(() => boxes.current[0]?.focus(), 50)
  }

  async function verify(code: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await api<{ user: UserDto }>('/api/v1/auth/phone/verify-otp', {
      method: 'POST',
      body: { challengeId, code },
    })
    setBusy(false)
    if (!res.ok) {
      setDigits(['', '', '', '', '', ''])
      boxes.current[0]?.focus()
      return setError(errorText(res))
    }
    resetCsrf()
    const u = res.data?.user
    if (!u?.firstName || !u?.lastName) {
      setFirst(u?.firstName ?? '')
      setLast(u?.lastName ?? '')
      setStep('profile')
    } else {
      router.replace(next)
    }
  }

  function setDigit(i: number, value: string) {
    const v = value.replace(/\D/g, '')
    if (v.length > 1) {
      // paste / autofill of the full code
      const arr = v.slice(0, 6).split('')
      const filled = [...arr, ...Array(6 - arr.length).fill('')]
      setDigits(filled)
      boxes.current[Math.min(arr.length, 5)]?.focus()
      if (arr.length === 6) void verify(arr.join(''))
      return
    }
    const copy = [...digits]
    copy[i] = v
    setDigits(copy)
    if (v && i < 5) boxes.current[i + 1]?.focus()
    if (copy.every(Boolean)) void verify(copy.join(''))
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!first.trim() || !last.trim()) return setError(t('errors.name'))
    setBusy(true)
    setError(null)
    const res = await api('/api/v1/users/me', {
      method: 'PATCH',
      csrf: true,
      body: { firstName: first.trim(), lastName: last.trim(), preferredLocale: locale.toUpperCase() },
    })
    setBusy(false)
    if (!res.ok) return setError(errorText(res))
    router.replace(next)
  }

  async function google() {
    setGoogleMsg(null)
    setBusy(true)
    try {
      const res = await fetch('/api/v1/auth/google/login', { redirect: 'manual' })
      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
        window.location.href = '/api/v1/auth/google/login'
        return
      }
      setGoogleMsg(t('googleUnavailable'))
    } catch {
      setGoogleMsg(t('errors.network'))
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/30'
  const primaryBtn =
    'group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-white shadow-[0_14px_32px_-10px_hsl(var(--primary))] transition hover:-translate-y-0.5 hover:brightness-110 disabled:translate-y-0 disabled:opacity-60'

  if (step === 'checking') {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500" role="status">
        <Loader2 className="h-5 w-5 animate-spin" /> {t('checkingSession')}
      </div>
    )
  }

  return (
    <div>
      {step === 'phone' && (
        <form onSubmit={requestCode} noValidate>
          <h1 className="text-3xl font-black tracking-tight text-ink">{t('title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('subtitle')}</p>

          <label htmlFor="phone" className="mt-7 block text-xs font-bold text-ink">
            {t('phoneLabel')}
          </label>
          <div className="mt-2 flex gap-2">
            <span className="flex h-12 items-center rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-600">+996</span>
            <input
              id="phone"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={t('phonePlaceholder')}
              value={phone}
              onChange={(e) => setPhone(formatLocal(e.target.value.replace(/\D/g, '').replace(/^0/, '').slice(0, 9)))}
              className={inputCls}
              aria-invalid={!!error}
            />
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={`${primaryBtn} mt-5`}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t('sending')}
              </>
            ) : (
              <>
                {t('getCode')} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </>
            )}
          </button>

          <div className="my-6 flex items-center gap-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            {t('or')}
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={google}
            disabled={busy}
            className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border border-slate-200 bg-white text-sm font-bold text-ink transition hover:bg-slate-50 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8a6.1 6.1 0 1 1 0-12.2c1.9 0 3.2.8 3.9 1.5l2.7-2.6A9.8 9.8 0 0 0 12 2.2a9.8 9.8 0 1 0 0 19.6c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
            </svg>
            {t('google')}
          </button>
          {googleMsg && (
            <p role="status" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
              {googleMsg}
            </p>
          )}
          <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">{t('terms')}</p>
        </form>
      )}

      {step === 'code' && (
        <div>
          <h1 className="text-3xl font-black tracking-tight text-ink">{t('codeTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('codeSubtitle', { phone: `+996 ${phone}` })}</p>
          <button
            type="button"
            onClick={() => {
              setStep('phone')
              setError(null)
            }}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary"
          >
            <Pencil className="h-3 w-3" /> {t('changePhone')}
          </button>

          <p className="mt-7 text-xs font-bold text-ink" id="code-label">
            {t('codeLabel')}
          </p>
          <div className="mt-2 flex justify-between gap-2" role="group" aria-labelledby="code-label">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  boxes.current[i] = el
                }}
                value={d}
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={6}
                aria-label={`${i + 1}/6`}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !digits[i] && i > 0) boxes.current[i - 1]?.focus()
                }}
                className="h-14 w-full min-w-0 rounded-xl border border-slate-200 bg-white text-center text-xl font-black text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={busy || digits.some((d) => !d)}
            onClick={() => verify(digits.join(''))}
            className={`${primaryBtn} mt-5`}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t('verifying')}
              </>
            ) : (
              t('verify')
            )}
          </button>

          <button
            type="button"
            disabled={resendIn > 0 || busy}
            onClick={() => requestCode()}
            className="mt-4 w-full text-center text-xs font-bold text-primary disabled:text-slate-400"
          >
            {resendIn > 0 ? t('resendIn', { s: resendIn }) : t('resend')}
          </button>
        </div>
      )}

      {step === 'profile' && (
        <form onSubmit={saveProfile} noValidate>
          <h1 className="text-3xl font-black tracking-tight text-ink">{t('profileTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('profileSubtitle')}</p>

          <label htmlFor="first" className="mt-7 block text-xs font-bold text-ink">
            {t('firstName')}
          </label>
          <input id="first" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" className={`${inputCls} mt-2`} />

          <label htmlFor="last" className="mt-4 block text-xs font-bold text-ink">
            {t('lastName')}
          </label>
          <input id="last" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" className={`${inputCls} mt-2`} />

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={`${primaryBtn} mt-5`}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t('saving')}
              </>
            ) : (
              t('save')
            )}
          </button>
        </form>
      )}
    </div>
  )
}
