import { Headphones, Mail, MapPin, Phone } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import type { SiteSettingsView } from '@/lib/site/settings'
import { SocialIcons } from './SocialIcons'

export async function Contacts({ locale, settings }: { locale: AppLocale; settings: SiteSettingsView }) {
  const t = await getT(locale, 'contacts')
  const cards = [
    { Icon: Mail, label: t('email'), value: settings.contactEmail, href: `mailto:${settings.contactEmail}` },
    { Icon: Phone, label: t('phone'), value: settings.contactPhone, href: `tel:${settings.contactPhone.replace(/\s/g, '')}` },
    { Icon: MapPin, label: t('address'), value: t('addressValue'), href: undefined },
  ]

  return (
    <section id="contacts" className="container px-4 py-14 sm:px-8">
      <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('title')}</h2>
      <p className="mt-2 max-w-xl text-sm text-slate-600">{t('subtitle')}</p>

      <div className="mt-8 grid gap-4 lg:grid-cols-[repeat(3,1fr)_auto]">
        {cards.map(({ Icon, label, value, href }) => {
          const body = (
            <>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-xs font-bold text-slate-900">{label}</span>
                <span className="block text-sm font-semibold text-primary">{value}</span>
              </span>
            </>
          )
          return href ? (
            <a key={label} href={href} className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm hover:shadow-md">
              {body}
            </a>
          ) : (
            <div key={label} className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
              {body}
            </div>
          )
        })}
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-bold text-slate-900">{t('social')}</p>
          <SocialIcons links={settings.socialLinks} variant="contacts" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-primary/5 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-primary">
          <Headphones className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-slate-900">{t('supportTitle')}</p>
          <p className="text-xs text-slate-600">{t('supportText')}</p>
        </div>
      </div>
    </section>
  )
}
