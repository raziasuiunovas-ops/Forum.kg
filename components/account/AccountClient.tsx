'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, CreditCard, Loader2, LogOut, Receipt, Send, Ticket, User, LayoutDashboard, ArrowUpRight } from 'lucide-react'
import { api, resetCsrf } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'

interface Me {
  id: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  phoneVerifiedAt: string | null
  email: string | null
  preferredLocale: 'RU' | 'KY' | 'EN'
}

type Tab = 'overview' | 'tickets' | 'orders' | 'payments' | 'notifications' | 'profile'

const TABS: { id: Tab; Icon: typeof User }[] = [
  { id: 'overview', Icon: LayoutDashboard },
  { id: 'tickets', Icon: Ticket },
  { id: 'orders', Icon: Receipt },
  { id: 'payments', Icon: CreditCard },
  { id: 'notifications', Icon: Bell },
  { id: 'profile', Icon: User },
]

export function AccountClient({ locale, messages }: { locale: string; messages: Messages }) {
  const t = makeT(messages)
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    api<{ user: Me }>('/api/v1/users/me').then((res) => {
      if (!alive) return
      if (res.ok && res.data?.user) return setMe(res.data.user)
      if (res.status === 401 || res.status === 403) {
        router.replace(`/${locale}/login?next=${encodeURIComponent(`/${locale}/account`)}`)
      } else {
        setFailed(true)
      }
    })
    return () => {
      alive = false
    }
  }, [router, locale])

  async function logout() {
    await api('/api/v1/auth/logout', { method: 'POST', csrf: true })
    resetCsrf()
    router.push(`/${locale}`)
  }

  if (failed) {
    return (
      <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200/70">
        <p className="text-sm text-slate-600">{t('errors.generic')}</p>
        <Link href={`/${locale}/login`} className="mt-5 inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-bold text-white">
          {t('logout')}
        </Link>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-500" role="status">
        <Loader2 className="h-5 w-5 animate-spin" /> {t('loading')}
      </div>
    )
  }

  const name = [me.firstName, me.lastName].filter(Boolean).join(' ')

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black leading-tight tracking-tighter text-ink sm:text-5xl">
            {name ? t('hello', { name: me.firstName ?? name }) : t('helloNoName')}
          </h1>
          <p className="mt-2 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-xs font-bold text-ink shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" /> {t('logout')}
        </button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" aria-label="Account">
          {TABS.map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 text-sm font-bold transition lg:rounded-2xl ${
                tab === id ? 'bg-ink text-white shadow-lg' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(`tabs.${id}`)}
            </button>
          ))}
        </nav>

        <section className="min-h-[22rem] rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-8">
          {tab === 'overview' && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-2xl bg-gradient-to-br from-primary to-[#7c5cff] p-6 text-white">
                <p className="text-xs font-bold uppercase tracking-widest text-white/70">{t('overview.nextTitle')}</p>
                <p className="mt-3 text-sm leading-relaxed text-white/85">{t('overview.nextText')}</p>
                <Link
                  href={`/${locale}/forums`}
                  className="group mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-xs font-bold text-ink"
                >
                  {t('overview.cta')}
                  <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </div>
              <div className="rounded-2xl bg-surface p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{t('profile.phone')}</p>
                <p className="mt-3 text-lg font-black text-ink">{me.phone}</p>
                {me.phoneVerifiedAt && (
                  <p className="mt-1 text-xs font-semibold text-emerald-600">✓ {t('profile.verified')}</p>
                )}
              </div>
            </div>
          )}

          {(tab === 'tickets' || tab === 'orders' || tab === 'payments' || tab === 'notifications') && (
            <EmptyState
              Icon={TABS.find((x) => x.id === tab)!.Icon}
              title={t(`empty.${tab}`)}
              text={t(`empty.${tab}Text`)}
              cta={t('empty.browse')}
              href={`/${locale}/forums`}
            />
          )}

          {tab === 'profile' && <ProfileForm me={me} onSaved={setMe} t={t} locale={locale} />}
        </section>
      </div>
    </div>
  )
}

function EmptyState({
  Icon,
  title,
  text,
  cta,
  href,
}: {
  Icon: typeof User
  title: string
  text: string
  cta: string
  href: string
}) {
  return (
    <div className="flex h-full min-h-[18rem] flex-col items-center justify-center text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-7 w-7" />
      </span>
      <h2 className="mt-5 text-xl font-black tracking-tight text-ink">{title}</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">{text}</p>
      <Link href={href} className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-6 text-xs font-bold text-white transition hover:brightness-110">
        {cta}
      </Link>
    </div>
  )
}

function ProfileForm({
  me,
  onSaved,
  t,
  locale,
}: {
  me: Me
  onSaved: (m: Me) => void
  t: ReturnType<typeof makeT>
  locale: string
}) {
  const [first, setFirst] = useState(me.firstName ?? '')
  const [last, setLast] = useState(me.lastName ?? '')
  const [lang, setLang] = useState<Me['preferredLocale']>(me.preferredLocale)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!first.trim() || !last.trim()) return setMsg({ ok: false, text: t('errors.name') })
    setBusy(true)
    setMsg(null)
    const res = await api<{ user: Me }>('/api/v1/users/me', {
      method: 'PATCH',
      csrf: true,
      body: { firstName: first.trim(), lastName: last.trim(), preferredLocale: lang },
    })
    setBusy(false)
    if (res.ok && res.data?.user) {
      onSaved(res.data.user)
      setMsg({ ok: true, text: t('profile.saved') })
    } else {
      setMsg({ ok: false, text: t('errors.generic') })
    }
  }

  const field =
    'mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30'

  return (
    <form onSubmit={save} className="max-w-md" noValidate>
      <h2 className="text-2xl font-black tracking-tight text-ink">{t('profile.title')}</h2>

      <p className="mt-6 text-xs font-bold text-ink">{t('profile.phone')}</p>
      <p className="mt-2 flex h-12 items-center justify-between rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-600">
        {me.phone}
        {me.phoneVerifiedAt && <span className="text-xs text-emerald-600">✓ {t('profile.verified')}</span>}
      </p>

      <label htmlFor="pf" className="mt-4 block text-xs font-bold text-ink">
        {t('profile.firstName')}
      </label>
      <input id="pf" value={first} onChange={(e) => setFirst(e.target.value)} className={field} autoComplete="given-name" />

      <label htmlFor="pl" className="mt-4 block text-xs font-bold text-ink">
        {t('profile.lastName')}
      </label>
      <input id="pl" value={last} onChange={(e) => setLast(e.target.value)} className={field} autoComplete="family-name" />

      <label htmlFor="plang" className="mt-4 block text-xs font-bold text-ink">
        {t('profile.language')}
      </label>
      <select id="plang" value={lang} onChange={(e) => setLang(e.target.value as Me['preferredLocale'])} className={field}>
        <option value="RU">Русский</option>
        <option value="KY">Кыргызча</option>
        <option value="EN">English</option>
      </select>

      {msg && (
        <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-xs font-semibold ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {msg.text}
        </p>
      )}

      <button type="submit" disabled={busy} className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60">
        {busy ? t('profile.saving') : t('profile.save')}
      </button>

      <div className="mt-8 flex items-start gap-3 rounded-2xl bg-surface p-4">
        <Send className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-bold text-ink">{t('profile.telegram')}</p>
          <p className="text-xs leading-relaxed text-slate-500">{t('profile.telegramText')}</p>
        </div>
      </div>
    </form>
  )
}
