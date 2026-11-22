import Link from 'next/link'
import { User } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import type { SiteSettingsView } from '@/lib/site/settings'
import { buttonVariants, cn } from '@/components/ui/button'
import { Logo } from './Logo'
import { LanguageSwitcher } from './LanguageSwitcher'
import { MobileNav } from './MobileNav'

export async function Header({ locale, settings }: { locale: AppLocale; settings: SiteSettingsView }) {
  const t = await getT(locale, 'nav')

  const items = [
    { href: '#forums', label: t('forums') },
    { href: '#how', label: t('how') },
    { href: '#organizers', label: t('organizers') },
    { href: '#about', label: t('about') },
    { href: '#contacts', label: t('contacts') },
  ]
  // TODO(auth): /login and /account pages are not built yet.
  const loginHref = `/${locale}/login`
  const accountHref = `/${locale}/account`

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-white/90 backdrop-blur">
      <div className="container relative flex h-16 items-center justify-between gap-4 px-4 sm:px-8">
        <Logo locale={locale} name={settings.displayName} logoUrl={settings.logoUrl} />

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {items.map((i) => (
            <a key={i.href} href={i.href} className="text-sm font-medium text-slate-700 hover:text-primary">
              {i.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <LanguageSwitcher current={locale} label={t('language')} />
          </div>
          <Link href={loginHref} className={cn(buttonVariants({ variant: 'outline' }), 'hidden lg:inline-flex')}>
            <User className="h-4 w-4" />
            {t('login')}
          </Link>
          <Link href={accountHref} className={cn(buttonVariants(), 'hidden lg:inline-flex')}>
            {t('account')}
          </Link>
          <MobileNav
            items={items}
            loginHref={loginHref}
            accountHref={accountHref}
            loginLabel={t('login')}
            accountLabel={t('account')}
            menuLabel={t('menu')}
          />
        </div>
      </div>
      <div className="flex justify-end border-t border-border/60 px-4 py-1.5 sm:hidden">
        <LanguageSwitcher current={locale} label={t('language')} />
      </div>
    </header>
  )
}
