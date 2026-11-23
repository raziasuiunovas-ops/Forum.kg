'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { api, resetCsrf, type ApiResult } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Same policy as the backend: 8-72 chars, at least one letter and one digit. */
export function isStrongPassword(p: string) {
  return p.length >= 8 && p.length <= 72 && /[A-Za-zЀ-ӿ]/.test(p) && /\d/.test(p)
}

export function EmailAuthForm({
  locale,
  messages,
  onSuccess,
}: {
  locale: string
  messages: Messages
  onSuccess: (user: { firstName?: string | null; lastName?: string | null }) => void
}) {
  const t = makeT(messages)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function fail(res: ApiResult) {
    if (res.network) return t('errors.network')
    if (res.status === 429) return t('errors.tooMany')
    if (res.code === 'INVALID_CREDENTIALS') return t('emailErrors.invalidCredentials')
    if (res.code === 'EMAIL_TAKEN') return t('emailErrors.emailTaken')
    if (res.code === 'ACCOUNT_SUSPENDED') return t('emailErrors.suspended')
    if (res.code === 'VALIDATION_ERROR') return t('emailErrors.weakPassword')
    if (res.status >= 500) return t('errors.server')
    return t('errors.generic')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const mail = email.trim()
    if (!EMAIL_RE.test(mail)) return setError(t('emailErrors.invalidEmail'))

    if (mode === 'register') {
      if (!first.trim() || !last.trim()) return setError(t('errors.name'))
      if (!isStrongPassword(password)) return setError(t('emailErrors.weakPassword'))
      if (password !== confirm) return setError(t('emailErrors.mismatch'))
    } else if (!password) {
      return setError(t('emailErrors.invalidCredentials'))
    }

    setBusy(true)
    const res = await api<{ user: { firstName?: string | null; lastName?: string | null } }>(
      mode === 'register' ? '/api/v1/auth/email/register' : '/api/v1/auth/email/login',
      {
        method: 'POST',
        csrf: true,
        body:
          mode === 'register'
            ? { firstName: first.trim(), lastName: last.trim(), email: mail, password, preferredLocale: locale.toUpperCase() }
            : { email: mail, password },
      },
    )
    setBusy(false)
    if (!res.ok) return setError(fail(res))
    resetCsrf()
    onSuccess(res.data?.user ?? {})
  }

  const input =
    'mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/30'
  const isReg = mode === 'register'

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="text-3xl font-black tracking-tight text-ink">
        {isReg ? t('emailTitleRegister') : t('emailTitleLogin')}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        {isReg ? t('emailSubtitleRegister') : t('emailSubtitleLogin')}
      </p>

      {isReg && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="e-first" className="block text-xs font-bold text-ink">
              {t('firstName')}
            </label>
            <input id="e-first" value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" className={input} />
          </div>
          <div>
            <label htmlFor="e-last" className="block text-xs font-bold text-ink">
              {t('lastName')}
            </label>
            <input id="e-last" value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" className={input} />
          </div>
        </div>
      )}

      <label htmlFor="e-email" className={`block text-xs font-bold text-ink ${isReg ? 'mt-4' : 'mt-6'}`}>
        {t('emailLabel')}
      </label>
      <input
        id="e-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder={t('emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={input}
      />

      <label htmlFor="e-pass" className="mt-4 block text-xs font-bold text-ink">
        {t('passwordLabel')}
      </label>
      <div className="relative">
        <input
          id="e-pass"
          type={show ? 'text' : 'password'}
          autoComplete={isReg ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${input} pr-12`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t('hidePassword') : t('showPassword')}
          className="absolute right-3 top-1/2 mt-1 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:text-ink"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {isReg && <p className="mt-1.5 text-[11px] text-slate-400">{t('passwordHint')}</p>}

      {isReg && (
        <>
          <label htmlFor="e-confirm" className="mt-4 block text-xs font-bold text-ink">
            {t('confirmLabel')}
          </label>
          <input
            id="e-confirm"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={input}
          />
        </>
      )}

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
            <Loader2 className="h-4 w-4 animate-spin" /> {isReg ? t('signingUp') : t('signingIn')}
          </>
        ) : isReg ? (
          t('signUp')
        ) : (
          t('signIn')
        )}
      </button>

      <p className="mt-5 text-center text-xs text-slate-500">
        {isReg ? t('haveAccount') : t('noAccount')}{' '}
        <button
          type="button"
          onClick={() => {
            setMode(isReg ? 'login' : 'register')
            setError(null)
          }}
          className="font-bold text-primary"
        >
          {isReg ? t('goLogin') : t('goRegister')}
        </button>
      </p>
    </form>
  )
}
