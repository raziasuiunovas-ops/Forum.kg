'use client'

import { useState } from 'react'
import { Loader2, Mail, CheckCircle } from 'lucide-react'
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
    if (res.code === 'EMAIL_SEND_FAILED') return 'Не удалось отправить письмо. Попробуйте позже.'
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
      body: { email: mail },
    })
    setBusy(false)
    
    if (!res.ok) return setError(fail(res))
    setSuccess(true)
  }

  const input =
    'mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/30'

  if (success) {
    return (
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-ink">{t('resetLinkSent')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">{t('resetLinkSentText')}</p>
        <div className="mt-6 rounded-xl bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
            <div className="text-left">
              <p className="text-xs font-bold text-blue-900">Проверьте папку "Спам"</p>
              <p className="mt-1 text-xs text-blue-700">Если письмо не пришло, проверьте папку "Спам" или "Промоакции".</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="text-3xl font-black tracking-tight text-ink">{t('forgotPasswordTitle')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{t('forgotPasswordSubtitle')}</p>

      <label htmlFor="email" className="mt-6 block text-xs font-bold text-ink">
        {t('emailLabel')}
      </label>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
        placeholder={t('emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={input}
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
    </form>
  )
}
