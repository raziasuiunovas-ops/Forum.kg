'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, Loader2, Mail } from 'lucide-react'
import { api, type ApiResult } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPasswordForm({ locale, messages }: { locale: string; messages: Messages }) {
  const t = makeT(messages)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function fail(res: ApiResult) {
    if (res.network) return t('errors.network')
    if (res.status === 429) return t('errors.tooMany')
    if (res.code === 'VALIDATION_ERROR') return t('emailErrors.invalidEmail')
    if (res.status >= 500) return res.code ? `${t('errors.server')} (${res.code})` : t('errors.server')
    return t('errors.generic')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    
    const mail = email.trim()
    if (!EMAIL_RE.test(mail)) return setError(t('emailErrors.invalidEmail'))

    setBusy(true)
    const res = await api('/api/v1/auth/password/request-reset', {
      method: 'POST',
      csrf: false,
      body: { email: mail },
    })
    setBusy(false)
    
    if (!res.ok) return setError(fail(res))
    
    setSuccess(true)
  }

  const input =
    'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/30'

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-ink">{t('resetLinkSent')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{t('resetLinkSentText')}</p>
        
        <Link
          href={`/${locale}/login`}
          className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-white shadow-[0_14px_32px_-10px_hsl(var(--primary))] transition hover:-translate-y-0.5 hover:brightness-110"
        >
          <ArrowLeft className="h-4 w-4" /> {t('backToLogin')}
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Mail className="h-7 w-7 text-primary" />
      </div>
      
      <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{t('forgotPasswordTitle')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('forgotPasswordSubtitle')}</p>

      <label htmlFor="reset-email" className="mt-6 block text-xs font-bold text-ink">
        {t('emailLabel')}
      </label>
      <input
        id="reset-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder={t('emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={`${input} mt-2`}
        disabled={busy}
      />

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
            <Loader2 className="h-4 w-4 animate-spin" /> {t('sendingLink')}
          </>
        ) : (
          t('sendResetLink')
        )}
      </button>

      <div className="mt-6 text-center">
        <Link href={`/${locale}/login`} className="text-xs font-bold text-primary hover:underline">
          {t('backToLogin')}
        </Link>
      </div>
    </form>
  )
}
