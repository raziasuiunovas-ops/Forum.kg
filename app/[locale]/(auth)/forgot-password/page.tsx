import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { isAppLocale } from '@/i18n/routing'
import { getT, loadMessages } from '@/lib/i18n/server'
import type { Messages } from '@/lib/i18n/client'
import { getSiteSettings } from '@/lib/site/settings'
import { Logo } from '@/components/layout/Logo'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { pageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return {}
  return pageMetadata(locale, 'forgotPassword', '/forgot-password')
}

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const [t, all, settings] = await Promise.all([getT(locale, 'auth'), loadMessages(locale), getSiteSettings(locale)])

  return (
    <div className="relative isolate grid min-h-screen overflow-hidden bg-footer text-white">
      <div className="bg-grid absolute inset-0 -z-10" aria-hidden />
      <div className="absolute -left-40 top-0 -z-10 h-[30rem] w-[30rem] animate-glow rounded-full bg-primary/30 blur-[120px]" aria-hidden />

      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href={`/${locale}/login`} className="inline-flex items-center gap-2 text-xs font-bold text-white/70 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {t('backToLogin')}
          </Link>
          <LanguageSwitcher current={locale} label={t('language')} />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-lg animate-fade-up rounded-[2rem] bg-white p-8 text-ink shadow-[0_40px_90px_-30px_rgba(0,0,0,.8)] sm:p-11">
            <div className="mb-6 flex justify-center">
              <Logo locale={locale} name={settings.displayName} logoUrl={settings.logoUrl} />
            </div>
            <ForgotPasswordForm locale={locale} messages={all.auth as Messages} />
          </div>
        </div>
      </section>
    </div>
  )
}
