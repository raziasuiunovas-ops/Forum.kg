import Link from 'next/link'
import { ArrowRight, CreditCard, Globe, QrCode } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import type { SiteSettingsView } from '@/lib/site/settings'
import { buttonVariants, cn } from '@/components/ui/button'
import { PhoneMockup } from './PhoneMockup'

export async function Hero({ locale, settings }: { locale: AppLocale; settings: SiteSettingsView }) {
  const t = await getT(locale, 'hero')
  const f = await getT(locale, 'features')

  const features = [
    { Icon: QrCode, title: f('qr.title'), text: f('qr.text') },
    { Icon: CreditCard, title: f('payment.title'), text: f('payment.text') },
    { Icon: Globe, title: f('languages.title'), text: f('languages.text') },
  ]

  return (
    <section className="relative overflow-hidden bg-slate-50">
      {/* Hero photo: editable in the Admin Panel (SiteSettings.heroImageUrl) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={settings.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-right" />
      <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/10" />

      <div className="container relative grid items-center gap-10 px-4 pb-10 pt-12 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:pb-14 lg:pt-16">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-primary">{t('eyebrow')}</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
            {settings.heroTitle ??
              t.rich('title', { accent: (chunks) => <span className="text-primary">{chunks}</span> })}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-700">
            {settings.heroSubtitle ?? t('subtitle')}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#forums" className={cn(buttonVariants({ size: 'lg' }))}>
              {t('cta')} <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#organizers" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              {t('ctaSecondary')}
            </a>
          </div>
        </div>

        <div className="hidden justify-center lg:flex">
          <PhoneMockup
            forumName="Bishkek Digital Forum 2026"
            dateLine="24.01.2027 · 10:00"
            badge={t('phoneBadge')}
          />
        </div>
      </div>

      <div className="relative border-t border-white/60 bg-white/70 backdrop-blur">
        <ul className="container grid gap-6 px-4 py-6 sm:grid-cols-3 sm:px-8">
          {features.map(({ Icon, title, text }) => (
            <li key={title} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-900">{title}</span>
                <span className="block text-xs text-slate-600">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
