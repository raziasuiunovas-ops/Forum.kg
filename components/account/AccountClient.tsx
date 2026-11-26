'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, CreditCard, Loader2, LogOut, Receipt, Ticket, User, LayoutDashboard, ArrowUpRight } from 'lucide-react'
import { api, resetCsrf } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'
import { NotificationsTab } from './NotificationsTab'

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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

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

  function confirmLogout() {
    setShowLogoutConfirm(false)
    logout()
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
          onClick={() => setShowLogoutConfirm(true)}
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

        <section className="min-h-[22rem] rounded-[1.75rem] bg-white p-6 shadow-sm ring-1 ring-slate-200/70 sm:p-8 overflow-x-hidden max-w-full">
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
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{me.phone ? t('profile.phone') : 'Email'}</p>
                <p className="mt-3 break-all text-lg font-black text-ink">{me.phone ?? me.email}</p>
                {me.phoneVerifiedAt && (
                  <p className="mt-1 text-xs font-semibold text-emerald-600">✓ {t('profile.verified')}</p>
                )}
              </div>
            </div>
          )}

          {(tab === 'orders' || tab === 'payments') && (
            <OrdersTab tab={tab} locale={locale} t={t} />
          )}

          {tab === 'notifications' && (
            <NotificationsTab locale={locale} userId={me.id} />
          )}

          {tab === 'tickets' && <TicketsTab locale={locale} t={t} />}

          {tab === 'profile' && <ProfileForm me={me} onSaved={setMe} t={t} locale={locale} />}
        </section>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black tracking-tight text-ink">{t('logoutTitle') || 'Подтвердите действие'}</h2>
            <p className="mt-3 text-sm text-slate-600">{t('logoutConfirm')}</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
              >
                {t('cancel') || 'Отмена'}
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-700"
              >
                {t('logout')}
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [showLangDropdown, setShowLangDropdown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const languages = [
    { value: 'RU' as const, label: 'Русский' },
    { value: 'KY' as const, label: 'Кыргызча' },
    { value: 'EN' as const, label: 'English' },
  ]

  const selectedLang = languages.find(l => l.value === lang)

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
    'mt-2 h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-sm font-semibold text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/20'

  return (
    <form onSubmit={save} noValidate>
      <h2 className="text-2xl font-black tracking-tight text-ink">{t('profile.title')}</h2>

      <p className="mt-6 text-xs font-bold text-ink">{me.phone ? t('profile.phone') : 'Email'}</p>
      <p className="mt-2 flex h-12 items-center justify-between rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-600">
        {me.phone ?? me.email}
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

      <label className="mt-4 block text-xs font-bold text-ink">
        {t('profile.language')}
      </label>
      <div className="relative mt-2">
        <button
          type="button"
          onClick={() => setShowLangDropdown(!showLangDropdown)}
          className="flex h-12 w-full items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-4 text-sm font-semibold text-ink outline-none transition hover:border-primary/50 focus:border-primary focus:ring-4 focus:ring-primary/20"
        >
          <span>{selectedLang?.label}</span>
          <svg 
            className={`h-5 w-5 text-primary transition-transform ${showLangDropdown ? 'rotate-180' : ''}`} 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        
        {showLangDropdown && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowLangDropdown(false)}
            />
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border-2 border-slate-200 bg-white shadow-xl">
              {languages.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setLang(item.value)
                    setShowLangDropdown(false)
                  }}
                  className={`flex w-full items-center px-4 py-3 text-sm font-semibold transition ${
                    lang === item.value
                      ? 'bg-primary text-white'
                      : 'text-ink hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {msg && (
        <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-xs font-semibold ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {msg.text}
        </p>
      )}

      <button type="submit" disabled={busy} className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60">
        {busy ? t('profile.saving') : t('profile.save')}
      </button>
    </form>
  )
}

interface TicketDto {
  id: string
  ticketNumber: string
  status: 'ACTIVE' | 'USED' | 'CANCELLED'
  isExpired: boolean
  isCheckedIn: boolean
  forum: { slug: string; title: string; startsAt: string; venueName: string | null }
  category: { code: string; name: string }
  participant: { firstName: string; lastName: string }
}

function TicketsTab({ locale, t }: { locale: string; t: ReturnType<typeof makeT> }) {
  const [tickets, setTickets] = useState<TicketDto[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    api<{ tickets: TicketDto[] }>('/api/v1/profile/tickets?limit=50').then((res) => {
      if (!alive) return
      if (res.ok && res.data) setTickets(res.data.tickets)
      else setFailed(true)
    })
    return () => {
      alive = false
    }
  }, [])

  if (failed) return <p className="text-sm text-slate-500">{t('tickets.loadError')}</p>
  if (!tickets)
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-slate-500" role="status">
        <Loader2 className="h-5 w-5 animate-spin" /> {t('loading')}
      </div>
    )
  if (tickets.length === 0)
    return (
      <EmptyState
        Icon={Ticket}
        title={t('empty.tickets')}
        text={t('empty.ticketsText')}
        cta={t('empty.browse')}
        href={`/${locale}/forums`}
      />
    )

  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale === 'ky' ? 'ky-KG' : 'ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bishkek',
  })

  return (
    <div>
      <h2 className="text-2xl font-black tracking-tight text-ink">{t('tickets.title')}</h2>
      <ul className="mt-6 grid gap-6 md:grid-cols-2">
        {tickets.map((tk) => {
          const state = tk.status === 'CANCELLED' ? 'cancelled' : tk.status === 'USED' || tk.isCheckedIn ? 'used' : tk.isExpired ? 'expired' : 'active'
          const isActive = state === 'active'
          const isCancelled = state === 'cancelled'

          return (
            <li key={tk.id} className="relative">
              {/* Ticket body */}
              <div className={`overflow-hidden rounded-3xl shadow-lg transition-all ${isCancelled ? 'opacity-60' : ''}`}>

                {/* TOP PART — main info */}
                <div className={`relative px-5 pt-5 pb-4 ${isActive ? 'bg-primary' : 'bg-slate-700'}`}>
                  {/* Decorative circles for perforation — left */}
                  <div className="absolute -left-3 bottom-0 h-6 w-6 translate-y-1/2 rounded-full bg-surface" />
                  {/* right */}
                  <div className="absolute -right-3 bottom-0 h-6 w-6 translate-y-1/2 rounded-full bg-surface" />

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'
                      }`}>
                        {t(`tickets.${state}`)}
                      </span>
                      <h3 className="mt-2 text-lg font-black leading-tight text-white">{tk.forum.title}</h3>
                      <p className="mt-0.5 text-xs text-white/70">{dateFmt.format(new Date(tk.forum.startsAt))}</p>
                    </div>
                    {/* QR — only for active */}
                    {isActive && (
                      <a href={`/${locale}/tickets/${tk.id}/qr`} className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/v1/tickets/${tk.id}/qr?size=200`}
                          alt={`QR ${tk.ticketNumber}`}
                          className="h-20 w-20 rounded-xl bg-white p-1 shadow-md transition hover:scale-105"
                        />
                      </a>
                    )}
                  </div>
                </div>

                {/* PERFORATION LINE */}
                <div className={`relative flex items-center ${isActive ? 'bg-primary' : 'bg-slate-700'}`}>
                  {/* dashed line */}
                  <div className="mx-6 flex-1 border-t-2 border-dashed border-white/30" />
                </div>

                {/* BOTTOM PART — details + stub */}
                <div className={`relative px-5 pt-4 pb-5 ${isActive ? 'bg-primary' : 'bg-slate-700'}`}>
                  {/* Decorative circles — top (mirror of bottom of top part) */}
                  <div className="absolute -left-3 top-0 h-6 w-6 -translate-y-1/2 rounded-full bg-surface" />
                  <div className="absolute -right-3 top-0 h-6 w-6 -translate-y-1/2 rounded-full bg-surface" />

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-white/50">{t('tickets.participant')}</dt>
                      <dd className="font-bold text-white">{tk.participant.firstName} {tk.participant.lastName}</dd>
                    </div>
                    <div>
                      <dt className="text-white/50">{t('tickets.category')}</dt>
                      <dd className="font-bold text-white">{tk.category.name}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-white/50">{t('tickets.number')}</dt>
                      <dd className="font-mono text-[10px] text-white/80 break-all">{tk.ticketNumber}</dd>
                    </div>
                  </dl>

                  {/* Torn effect for cancelled */}
                  {isCancelled && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-b-3xl bg-black/40">
                      <span className="rotate-[-15deg] rounded border-4 border-red-500 px-4 py-1 text-xl font-black uppercase text-red-500">
                        Аннулирован
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Torn paper effect for cancelled — SVG tear */}
              {isCancelled && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                  <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                    <line x1="0" y1="50%" x2="100%" y2="50%" stroke="white" strokeWidth="3" strokeDasharray="4 4" opacity="0.3" />
                  </svg>
                </div>
              )}
            </li>

          )
        })}
      </ul>
    </div>
  )
}

interface UserOrder {
  id: string
  orderNumber: string
  status: string
  totalMinor: number
  currency: string
  createdAt: string
  forum: { title: string; startsAt: string }
  items: { participant: string; category: string; priceMinor: number }[]
  payment: { status: string; amountMinor: number; paidAt: string | null } | null
}

function OrdersTab({ tab, locale, t }: { tab: 'orders' | 'payments'; locale: string; t: ReturnType<typeof makeT> }) {
  const [orders, setOrders] = useState<UserOrder[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    api<{ orders: UserOrder[] }>('/api/v1/orders').then((res) => {
      if (!alive) return
      if (res.ok && res.data) setOrders(res.data.orders)
      else setFailed(true)
    })
    return () => { alive = false }
  }, [])

  if (failed) return <p className="text-sm text-slate-500">{t('tickets.loadError')}</p>
  if (!orders) return (
    <div className="flex items-center gap-3 py-10 text-sm text-slate-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin" /> {t('loading')}
    </div>
  )
  if (orders.length === 0) return (
    <EmptyState
      Icon={tab === 'orders' ? Receipt : CreditCard}
      title={tab === 'orders' ? t('orders.emptyTitle') : t('payments.emptyTitle')}
      text={tab === 'orders' ? t('orders.emptyText') : t('payments.emptyText')}
      cta={t('empty.browse')}
      href={`/${locale}/forums`}
    />
  )

  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale === 'ky' ? 'ky-KG' : 'ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Bishkek',
  })

  const statusLabel: Record<string, string> = {
    PENDING_PAYMENT: 'Ожидает оплаты',
    PAID: 'Оплачен',
    CANCELLED: 'Отменён',
    EXPIRED: 'Истёк',
    PAYMENT_FAILED: 'Ошибка оплаты',
  }
  const statusColor: Record<string, string> = {
    PENDING_PAYMENT: 'text-amber-600 bg-amber-50',
    PAID: 'text-emerald-700 bg-emerald-50',
    CANCELLED: 'text-red-600 bg-red-50',
    EXPIRED: 'text-slate-500 bg-slate-100',
    PAYMENT_FAILED: 'text-red-600 bg-red-50',
  }
  const payStatusLabel: Record<string, string> = {
    SUCCEEDED: 'Оплачен',
    PENDING: 'В обработке',
    FAILED: 'Ошибка',
    REFUND_PENDING: 'Возврат',
    REFUNDED: 'Возвращён',
  }

  return (
    <div>
      <h2 className="text-2xl font-black tracking-tight text-ink">
        {tab === 'orders' ? t('orders.title') : t('payments.title')}
      </h2>
      <ul className="mt-6 space-y-4">
        {orders.map((order) => {
          if (tab === 'payments' && !order.payment) return null
          return (
            <li key={order.id} className="rounded-2xl bg-surface p-5 ring-1 ring-slate-200/70">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-slate-400">{order.orderNumber}</span>
                    {tab === 'orders' && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusColor[order.status] ?? 'text-slate-500 bg-slate-100'}`}>
                        {statusLabel[order.status] ?? order.status}
                      </span>
                    )}
                    {tab === 'payments' && order.payment && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${order.payment.status === 'SUCCEEDED' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
                        {payStatusLabel[order.payment.status] ?? order.payment.status}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 text-base font-bold text-ink leading-snug">{order.forum.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{dateFmt.format(new Date(order.createdAt))}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {order.items.map((i) => `${i.participant} (${i.category})`).join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-black text-ink">
                    {tab === 'payments' && order.payment
                      ? `${(order.payment.amountMinor / 100).toLocaleString('ru-RU')} сом`
                      : `${(order.totalMinor / 100).toLocaleString('ru-RU')} сом`
                    }
                  </p>
                  {tab === 'payments' && order.payment?.paidAt && (
                    <p className="text-[10px] text-slate-400">{dateFmt.format(new Date(order.payment.paidAt))}</p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
