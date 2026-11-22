import { BarChart3, Send, ShieldCheck, User } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import type { SiteSettingsView } from '@/lib/site/settings'
import { LaptopMockup } from './LaptopMockup'

export async function About({ locale, settings }: { locale: AppLocale; settings: SiteSettingsView }) {
  const t = await getT(locale, 'about')
  const items = [
    { Icon: Send, key: 'telegram' },
    { Icon: User, key: 'account' },
    { Icon: BarChart3, key: 'analytics' },
    { Icon: ShieldCheck, key: 'access' },
  ] as const

  return (
    <section id="about" className="relative overflow-hidden py-14">
      <span id="organizers" className="absolute -top-20" aria-hidden />
      <div className="container grid items-center gap-10 px-4 sm:px-8 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-primary">{t('eyebrow')}</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">{t('title')}</h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">{settings.aboutText ?? t('text')}</p>

          <ul className="mt-6 grid gap-5 sm:grid-cols-2">
            {items.map(({ Icon, key }) => (
              <li key={key} className="flex gap-3">
                <Icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <span>
                  <span className="block text-sm font-bold text-slate-900">{t(`${key}.title`)}</span>
                  <span className="block text-xs leading-relaxed text-slate-600">{t(`${key}.text`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-full bg-primary/10 blur-3xl" aria-hidden />
          {settings.aboutImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.aboutImageUrl} alt="" className="mx-auto w-full max-w-[520px] rounded-2xl" />
          ) : (
            <LaptopMockup
              labels={{
                forum: t('mock.forum'),
                active: t('mock.active'),
                sold: t('mock.sold'),
                registered: t('mock.registered'),
                revenue: t('mock.revenue'),
                dynamics: t('mock.dynamics'),
                menu: [
                  t('mock.menuEvents'),
                  t('mock.menuSales'),
                  t('mock.menuParticipants'),
                  t('mock.menuCheckin'),
                  t('mock.menuAnalytics'),
                  t('mock.menuSettings'),
                ],
              }}
            />
          )}
        </div>
      </div>
    </section>
  )
}
