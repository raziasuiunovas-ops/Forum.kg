'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { api, resetCsrf, type ApiResult } from '@/lib/client/api'

/** Admin sign-in: login + password, then a one-time code that is sent to Telegram (backend: /admin/login, /admin/verify-2fa). */
export function AdminLogin({ locale }: { locale: string }) {
  const router = useRouter()
  const [step, setStep] = useState<'credentials' | 'code'>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [pending, setPending] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fail = (res: ApiResult, fallback: string) => {
    if (res.network) return 'Нет связи с сервером.'
    if (res.status === 429) return 'Слишком много попыток. Подождите и повторите.'
    return res.message || fallback
  }

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) return setError('Введите логин и пароль.')
    setBusy(true)
    const res = await api<{ data: { pendingToken: string } }>('/api/v1/admin/login', {
      method: 'POST', csrf: true, body: { username: username.trim(), password },
    })
    setBusy(false)
    if (!res.ok || !res.data?.data?.pendingToken) return setError(fail(res, 'Неверный логин или пароль.'))
    setPending(res.data.data.pendingToken)
    setStep('code')
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^\d{4,8}$/.test(code.trim())) return setError('Введите код из Telegram.')
    setBusy(true)
    const res = await api('/api/v1/admin/verify-2fa', { method: 'POST', csrf: true, body: { pendingToken: pending, code: code.trim() } })
    setBusy(false)
    if (!res.ok) return setError(fail(res, 'Неверный или просроченный код.'))
    resetCsrf()
    router.replace(`/${locale}/admin`)
  }

  const input = 'mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30'
  const submit = 'mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60'

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-footer px-5 py-10">
      <div className="bg-grid absolute inset-0 -z-10" aria-hidden />
      <div className="absolute left-1/2 top-1/4 -z-10 h-96 w-96 -translate-x-1/2 animate-glow rounded-full bg-primary/30 blur-[120px]" aria-hidden />
      <div className="w-full max-w-md">
        <Link href={`/${locale}`} className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-white/70 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> На сайт
        </Link>
        <div className="rounded-[2rem] bg-white p-8 shadow-[0_40px_90px_-30px_rgba(0,0,0,.8)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></span>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-ink">Вход в админ-панель</h1>

          {step === 'credentials' ? (
            <form onSubmit={submitCredentials} noValidate>
              <p className="mt-2 text-sm text-slate-500">Только для сотрудников. После пароля потребуется код из Telegram.</p>
              <label htmlFor="adm-user" className="mt-6 block text-xs font-bold text-ink">Логин</label>
              <input id="adm-user" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={input} />
              <label htmlFor="adm-pass" className="mt-4 block text-xs font-bold text-ink">Пароль</label>
              <div className="relative">
                <input id="adm-pass" type={showPass ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} pr-12`} />
                <button type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Скрыть пароль' : 'Показать пароль'} className="absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:text-ink">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 40 && <p className="mt-2 text-[11px] font-semibold text-amber-600">Пароль очень длинный. Не вставили ли вы хеш (строку, начинающуюся с $2a$) вместо пароля?</p>}
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">{error}</p>}
              <button type="submit" disabled={busy} className={submit}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Проверяем...</> : 'Продолжить'}</button>
            </form>
          ) : (
            <form onSubmit={submitCode} noValidate>
              <p className="mt-2 text-sm text-slate-500">Мы отправили код подтверждения в Telegram. Введите его ниже.</p>
              <label htmlFor="adm-code" className="mt-6 block text-xs font-bold text-ink">Код подтверждения</label>
              <input id="adm-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${input} text-center text-2xl tracking-[0.4em]`} />
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">{error}</p>}
              <button type="submit" disabled={busy} className={submit}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Проверяем...</> : 'Войти'}</button>
              <button type="button" onClick={() => { setStep('credentials'); setCode(''); setError(null) }} className="mt-3 w-full text-center text-xs font-bold text-primary">Назад</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
