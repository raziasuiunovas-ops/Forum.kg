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
      {/* Фоновый текст FORUM.KG */}
      <p
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[19vw] font-black leading-[0.8] tracking-tighter text-white/[0.04] md:text-[15rem]"
      >
        FORUM.KG
      </p>

      <div className="relative mx-auto max-w-7xl px-5 pb-6 pt-16 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.2fr_1.3fr]">
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

          <div>
            <h3 className="text-sm font-bold">{t('aruna.title')}</h3>
            <p className="mt-4 text-sm text-white/60">{t('aruna.tagline')}</p>
            <a 
              href="https://wa.me/996507343454"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#20BA5A] active:scale-95"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              WhatsApp
            </a>
            <p className="mt-3 text-xs text-white/50">{t('aruna.made')}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-white/10 pt-5 text-xs text-white/50 sm:flex-row sm:items-center">
          <p>{t('rights')}</p>
          <div className="flex items-center gap-4">
            <a 
              href={`/${locale}/admin/login`} 
              className="opacity-30 transition hover:opacity-100 hover:text-white"
              title="Админ-панель"
            >
              Admin
            </a>
            <p className="inline-flex items-center gap-1">
              {t('madeFor')} <ArrowUpRight className="h-3 w-3" />
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
