import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import type { SiteSettingsView } from '@/lib/site/settings'
import { Logo } from './Logo'
import { LanguageSwitcher } from './LanguageSwitcher'
import { SocialIcons } from '@/components/landing/SocialIcons'

export async function Footer({ locale, settings }: { locale: AppLocale; settings: SiteSettingsView }) {
  const t = await getT(locale, 'footer')
  const nav = await getT(locale, 'nav')

  // TODO: point these to real pages when they exist (forums list, legal pages, FAQ...).
  const columns = [
    {
      title: t('forums.title'),
      links: [
        { label: t('forums.all'), href: '#forums' },
        { label: t('forums.upcoming'), href: '#forums' },
        { label: t('forums.archive'), href: '#' },
      ],
    },
    {
      title: t('organizers.title'),
      links: [
        { label: t('organizers.publish'), href: '#contacts' },
        { label: t('organizers.pricing'), href: '#contacts' },
        { label: t('organizers.features'), href: '#about' },
      ],
    },
    {
      title: t('users.title'),
      links: [
        { label: t('users.howToBuy'), href: '#how' },
        { label: t('users.account'), href: `/${locale}/account` },
        { label: t('users.faq'), href: '#' },
      ],
    },
    {
      title: t('legal.title'),
      links: [
        { label: t('legal.privacy'), href: '#' },
        { label: t('legal.terms'), href: '#' },
        { label: t('legal.offer'), href: '#' },
        { label: t('legal.contacts'), href: '#contacts' },
      ],
    },
  ]

  return (
    <footer className="bg-footer text-white">
      <div className="container px-4 py-12 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div>
            <Logo locale={locale} name={settings.displayName} logoUrl={settings.logoUrl} light />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">{t('tagline')}</p>
            <SocialIcons links={settings.socialLinks} variant="footer" />
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-bold">{col.title}</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-white/70">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="hover:text-white">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-white/15 pt-6 text-sm text-white/60 sm:flex-row sm:items-center">
          <p>{t('rights')}</p>
          <LanguageSwitcher current={locale} label={nav('language')} tone="dark" />
        </div>
      </div>
    </footer>
  )
}

