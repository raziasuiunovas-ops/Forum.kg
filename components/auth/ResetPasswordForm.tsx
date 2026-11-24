'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, Lock, ShieldAlert } from 'lucide-react'
import { api, type ApiResult } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'
import { isStrongPassword } from './EmailAuthForm'

type Step = 'validating' | 'form' | 'success' | 'invalid'

export function ResetPasswordForm({ locale, messages }: { locale: string; messages: Messages }) {
  const t = makeT(messages)
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [step, setStep] = useState<Step>('validating')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setStep('invalid')
      return
    }

    async function validateToken() {
      const res = await api('/api/v1/auth/password/validate-token', {
        method: 'POST',
        csrf: false,
        body: { token },
      })

      if (res.ok) {
        setStep('form')
      } else {
        setStep('invalid')
      }
    }

    validateToken()
  }, [token])

  function fail(res: ApiResult) {
    if (res.network) return t('errors.network')
    if (res.status === 429) return t('errors.tooMany')
    if (res.code === 'INVALID_TOKEN') return t('invalidResetLinkText')
    if (res.code === 'VALIDATION_ERROR') return t('emailErrors.weakPassword')
    if (res.code === 'ACCOUNT_SUSPENDED') return t('emailErrors.suspended')
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
      csrf: false,
      body: { token: token!, password },
    })
    setBusy(false)

    if (!res.ok) return setError(fail(res))

    setStep('success')
  }

  const input =
    'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/30'

  // Validating token
  if (step === 'validating') {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-sm text-slate-500">{t('checkingSession')}</p>
      </div>
    )
  }

  // Invalid or expired token
  if (step === 'invalid') {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <ShieldAlert className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-ink">{t('invalidResetLink')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{t('invalidResetLinkText')}</p>

        <Link
          href={`/${locale}/forgot-password`}
          className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-white shadow-[0_14px_32px_-10px_hsl(var(--primary))] transition hover:-translate-y-0.5 hover:brightness-110"
        >
          {t('requestNewLink')}
        </Link>

        <div className="mt-4 text-center">
          <Link href={`/${locale}/login`} className="text-xs font-bold text-slate-500 hover:text-ink">
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    )
  }

  // Success
  if (step === 'success') {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-ink">{t('passwordChanged')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">{t('passwordChangedText')}</p>

        <button
          onClick={() => router.push(`/${locale}/login`)}
          className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-white shadow-[0_14px_32px_-10px_hsl(var(--primary))] transition hover:-translate-y-0.5 hover:brightness-110"
        >
          {t('signIn')}
        </button>
      </div>
    )
  }

  // Password reset form
  return (
    <form onSubmit={submit} noValidate>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Lock className="h-7 w-7 text-primary" />
      </div>

      <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{t('resetPasswordTitle')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('resetPasswordSubtitle')}</p>

      <label htmlFor="new-password" className="mt-6 block text-xs font-bold text-ink">
        {t('newPassword')}
      </label>
      <div className="relative mt-2">
        <input
          id="new-password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${input} pr-12`}
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? t('hidePassword') : t('showPassword')}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:text-ink"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">{t('passwordHint')}</p>

      {/* Password strength indicator */}
      {password && (
        <div className="mt-3">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((level) => {
              const strength = isStrongPassword(password) ? (password.length >= 12 ? 4 : 3) : password.length >= 6 ? 2 : 1
              return (
                <div
                  key={level}
                  className={`h-1 flex-1 rounded-full transition ${
                    level <= strength
                      ? strength === 4
                        ? 'bg-green-500'
                        : strength === 3
                          ? 'bg-primary'
                          : strength === 2
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      : 'bg-slate-200'
                  }`}
                />
              )
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {isStrongPassword(password)
              ? password.length >= 12
                ? '✓ Надёжный пароль'
                : '✓ Хороший пароль'
              : '⚠ Слабый пароль'}
          </p>
        </div>
      )}

      <label htmlFor="confirm-password" className="mt-4 block text-xs font-bold text-ink">
        {t('confirmNewPassword')}
      </label>
      <input
        id="confirm-password"
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={`${input} mt-2`}
        disabled={busy}
      />

      {error && (
        <div className="mt-4 flex gap-3 rounded-xl bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-xs font-semibold text-red-600">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !password || !confirm}
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

      <div className="mt-6 text-center">
        <Link href={`/${locale}/login`} className="text-xs font-bold text-slate-500 hover:text-ink">
          {t('backToLogin')}
        </Link>
      </div>
    </form>
  )
}
