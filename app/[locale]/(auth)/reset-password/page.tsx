import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { isAppLocale } from '@/i18n/routing'
import { getT, loadMessages } from '@/lib/i18n/server'
import type { Messages } from '@/lib/i18n/client'
import { getSiteSettings } from '@/lib/site/settings'
import { Logo } from '@/components/layout/Logo'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return {}
  const t = await getT(locale, 'auth')
  return { title: `${t('resetPasswordTitle')} — FORUM.KG`, robots: { index: false } }
}

export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const [t, all, settings] = await Promise.all([getT(locale, 'auth'), loadMessages(locale), getSiteSettings(locale)])

  return (
    <div className="relative isolate grid min-h-screen overflow-hidden bg-footer text-white lg:grid-cols-[1.05fr_1fr]">
      <div className="bg-grid absolute inset-0 -z-10" aria-hidden />
      <div className="absolute -left-40 top-0 -z-10 h-[30rem] w-[30rem] animate-glow rounded-full bg-primary/30 blur-[120px]" aria-hidden />

      {/* brand side */}
      <section className="relative hidden flex-col p-12 lg:flex">
        <div className="absolute top-12 left-12">
          <Logo locale={locale} name={settings.displayName} logoUrl={settings.logoUrl} />
        </div>
        <div className="mt-32 max-w-md">
          <h2 className="text-[clamp(2.5rem,5vw,4.5rem)] font-black uppercase leading-[0.9] tracking-tighter">
            <span className="block animate-fade-up">{t('resetPasswordTitle')}</span>
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/60 animate-fade-up" style={{ animationDelay: '120ms' }}>
            {t('resetPasswordSubtitle')}
          </p>
        </div>
      </section>

      {/* form side */}
      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href={`/${locale}/login`} className="inline-flex items-center gap-2 text-xs font-bold text-white/70 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {t('backToLogin')}
          </Link>
          <LanguageSwitcher current={locale} label={t('language')} />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md animate-fade-up rounded-[2rem] bg-white p-7 text-ink shadow-[0_40px_90px_-30px_rgba(0,0,0,.8)] sm:p-9">
            <Suspense fallback={null}>
              <ResetPasswordForm locale={locale} messages={all.auth as Messages} />
            </Suspense>
          </div>
        </div>
      </section>
    </div>
  )
}
