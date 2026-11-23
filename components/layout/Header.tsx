import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import type { SiteSettingsView } from '@/lib/site/settings'
import { Logo } from './Logo'
import { LanguageSwitcher } from './LanguageSwitcher'
import { MobileNav } from './MobileNav'

export async function Header({ locale, settings }: { locale: AppLocale; settings: SiteSettingsView }) {
  const t = await getT(locale, 'nav')

  const items = [
    { href: '#events', label: t('events') },
    { href: '#how', label: t('how') },
    { href: '#organizers', label: t('organizers') },
    { href: '#contacts', label: t('contacts') },
  ]
  // TODO(auth): show the account link only for signed-in users, "login" otherwise.
  const cabinetHref = `/${locale}/login`

  const cta = (
    <Link
      href={cabinetHref}
      className="group inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[#7c5cff] px-5 text-xs font-bold text-white shadow-[0_8px_24px_-8px_hsl(var(--primary))] transition hover:brightness-110"
    >
      {t('cabinet')}
      <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  )

  return (
    <header className="fixed inset-x-0 top-3 z-50 px-3 sm:px-6">
      <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 rounded-full border border-white/10 bg-[#0b1030]/70 px-4 shadow-[0_10px_40px_-12px_rgba(0,0,0,.6)] backdrop-blur-xl sm:px-6">
        <Logo locale={locale} name={settings.displayName} logoUrl={settings.logoUrl} />

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {items.map((i) => (
            <a key={i.href} href={i.href} className="text-xs font-semibold text-white/70 transition hover:text-white">
              {i.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <LanguageSwitcher current={locale} label={t('language')} />
          </div>
          <div className="hidden lg:block">{cta}</div>
          <MobileNav items={items} menuLabel={t('menu')}>
            <LanguageSwitcher current={locale} label={t('language')} />
            {cta}
          </MobileNav>
        </div>
      </div>
    </header>
  )
}
