'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'
import { api, type ApiResult } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'
import { isStrongPassword } from './EmailAuthForm'

export function ResetPasswordForm({ locale, messages }: { locale: string; messages: Messages }) {
  const t = makeT(messages)
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [invalidLink, setInvalidLink] = useState(false)

  useEffect(() => {
    if (!token) {
      setInvalidLink(true)
    }
  }, [token])

  function fail(res: ApiResult) {
    if (res.network) return t('errors.network')
    if (res.status === 429) return t('errors.tooMany')
    if (res.code === 'INVALID_TOKEN' || res.code === 'TOKEN_EXPIRED' || res.code === 'TOKEN_ALREADY_USED') {
      setInvalidLink(true)
      return t('invalidResetLink')
    }
    if (res.code === 'VALIDATION_ERROR') return t('emailErrors.weakPassword')
    if (res.status >= 500) return res.code ? `${t('errors.server')} (${res.code})` : t('errors.server')
    return t('errors.generic')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!isStrongPassword(password)) return setError(t('emailErrors.weakPassword'))
    if (password !== confirm) return setError(t('emailErrors.mismatch'))

    setBusy(true)
    const res = await api('/api/v1/auth/password/reset', {
      method: 'POST',
      body: { token, password },
    })
    setBusy(false)

    if (!res.ok) return setError(fail(res))
    setSuccess(true)
    
    // Redirect to login after 3 seconds
    setTimeout(() => {
      router.push(`/${locale}/login`)
    }, 3000)
  }

  const input =
    'mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/30'

  if (invalidLink) {
    return (
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-ink">{t('invalidResetLink')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{t('invalidResetLinkText')}</p>
        <Link
          href={`/${locale}/forgot-password`}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-white shadow-[0_14px_32px_-10px_hsl(var(--primary))] transition hover:-translate-y-0.5 hover:brightness-110"
        >
          {t('requestNewLink')}
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-ink">{t('passwordChanged')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{t('passwordChangedText')}</p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          Перенаправление на страницу входа...
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="text-3xl font-black tracking-tight text-ink">{t('resetPasswordTitle')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('resetPasswordSubtitle')}</p>

      <label htmlFor="password" className="mt-6 block text-xs font-bold text-ink">
        {t('newPassword')}
      </label>
      <div className="relative">
        <input
          id="password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          autoFocus
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
      <p className="mt-1.5 text-[11px] text-slate-400">{t('passwordHint')}</p>

      <label htmlFor="confirm" className="mt-4 block text-xs font-bold text-ink">
        {t('confirmNewPassword')}
      </label>
      <input
        id="confirm"
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
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
            <Loader2 className="h-4 w-4 animate-spin" /> {t('resettingPassword')}
          </>
        ) : (
          t('resetPassword')
        )}
      </button>
    </form>
  )
}
