import { ArrowUpRight } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import type { SiteSettingsView } from '@/lib/site/settings'
import { Logo } from './Logo'
import { SocialIcons } from '@/components/landing/SocialIcons'

export async function Footer({ locale, settings }: { locale: AppLocale; settings: SiteSettingsView }) {
  const t = await getT(locale, 'footer')

  const columns = [
    {
      title: t('platform.title'),
      links: [
        { label: t('platform.all'), href: `/${locale}/forums` },
        { label: t('platform.how'), href: `/${locale}#how` },
        { label: t('platform.buy'), href: `/${locale}/forums` },
      ],
    },
    {
      title: t('organizers.title'),
      links: [
        { label: t('organizers.create'), href: `/${locale}#organizers` },
        { label: t('organizers.features'), href: `/${locale}#organizers` },
        { label: t('organizers.contacts'), href: `/${locale}#contacts` },
      ],
    },
  ]

  return (
    <footer id="contacts" className="relative overflow-hidden bg-footer text-white">
      <div className="mx-auto max-w-6xl px-5 pb-6 pt-10 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo locale={locale} name={settings.displayName} logoUrl={settings.logoUrl} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">{t('tagline')}</p>
            <SocialIcons links={settings.socialLinks} />
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-bold">{col.title}</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-white/60">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="transition hover:text-white">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="text-sm font-bold">{t('contacts.title')}</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-white/60">
              <li>
                <a href={`mailto:${settings.contactEmail}`} className="transition hover:text-white">
                  {settings.contactEmail}
                </a>
              </li>
              <li>
                <a href={`tel:${settings.contactPhone.replace(/\s/g, '')}`} className="transition hover:text-white">
                  {settings.contactPhone}
                </a>
              </li>
              <li>{t('contacts.address')}</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-white/10 pt-5 text-xs text-white/50 sm:flex-row sm:items-center">
          <p>{t('rights')}</p>
          <p className="inline-flex items-center gap-1">
            {t('madeFor')} <ArrowUpRight className="h-3 w-3" />
          </p>
        </div>
      </div>
    </footer>
  )
}
