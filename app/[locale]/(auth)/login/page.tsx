import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { isAppLocale } from '@/i18n/routing'
import { getT, loadMessages } from '@/lib/i18n/server'
import type { Messages } from '@/lib/i18n/client'
import { getSiteSettings } from '@/lib/site/settings'
import { Logo } from '@/components/layout/Logo'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { LoginForm } from '@/components/auth/LoginForm'
import { TicketCard } from '@/components/landing/TicketCard'
import { pageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return {}
  return pageMetadata(locale, 'login', '/login')
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const [t, all, settings] = await Promise.all([getT(locale, 'auth'), loadMessages(locale), getSiteSettings(locale)])

  return (
    <div className="relative isolate grid min-h-screen overflow-hidden bg-footer text-white lg:grid-cols-[1.05fr_1fr]">
      <div className="bg-grid absolute inset-0 -z-10" aria-hidden />
      <div className="absolute -left-40 top-0 -z-10 h-[30rem] w-[30rem] animate-glow rounded-full bg-primary/30 blur-[120px]" aria-hidden />

      {/* brand side */}
      <section className="relative hidden flex-col justify-between p-12 lg:flex">
        <Logo locale={locale} name={settings.displayName} logoUrl={settings.logoUrl} />
        <div>
          <h2 className="text-[clamp(3rem,6vw,5.5rem)] font-black uppercase leading-[0.9] tracking-tighter">
            <span className="block animate-fade-up">{t('heroLine1')}</span>
            <span className="text-outline block animate-fade-up !tracking-[-0.01em]" style={{ animationDelay: '120ms' }}>
              {t('heroLine2')}
            </span>
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/60 animate-fade-up" style={{ animationDelay: '220ms' }}>
            {t('heroText')}
          </p>
          <ul className="mt-6 space-y-3 text-sm font-semibold text-white/80">
            {['perk1', 'perk2', 'perk3'].map((k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/25 text-primary">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <div className="animate-float-rot self-start">
          <TicketCard label="YOUR ACCESS PASS" title="Bishkek Digital Forum 2026" />
        </div>
      </section>

      {/* form side */}
      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href={`/${locale}`} className="inline-flex items-center gap-2 text-xs font-bold text-white/70 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {t('back')}
          </Link>
          <LanguageSwitcher current={locale} label={t('language')} />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md animate-fade-up rounded-[2rem] bg-white p-7 text-ink shadow-[0_40px_90px_-30px_rgba(0,0,0,.8)] sm:p-9">
            <Suspense fallback={null}>
              <LoginForm locale={locale} messages={all.auth as Messages} />
            </Suspense>
          </div>
        </div>
      </section>
    </div>
  )
}
