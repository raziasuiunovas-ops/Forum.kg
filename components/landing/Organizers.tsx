import { ArrowUpRight, Check } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import { Reveal } from '@/components/motion/Reveal'
import { DashboardMock } from './DashboardMock'

export async function Organizers({ locale, email }: { locale: AppLocale; email: string }) {
  const t = await getT(locale, 'organizers')

  return (
    <section id="organizers" className="bg-white px-3 pb-6 sm:px-6">
      <Reveal>
        <div className="relative mx-auto max-w-[78rem] overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#3550ff] via-[#3d5bff] to-[#6574ff] p-8 text-white sm:p-12 lg:p-16">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-violet-400/30 blur-3xl" aria-hidden />

          <div className="relative grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">{t('eyebrow')}</p>
              <h2 className="mt-5 text-5xl font-black leading-[0.95] tracking-tighter sm:text-6xl">
                {t('title1')}
                <span className="block text-[#a5f0ff]">{t('title2')}</span>
              </h2>
              <p className="mt-6 max-w-md text-sm leading-relaxed text-white/75">{t('text')}</p>

              <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                {['1', '2', '3', '4'].map((n) => (
                  <li key={n} className="flex items-center gap-2.5 text-xs font-semibold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {t(`points.${n}`)}
                  </li>
                ))}
              </ul>

              <a
                href={`mailto:${email}`}
                className="group mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-sm font-bold text-ink shadow-xl transition hover:-translate-y-0.5"
              >
                {t('cta')}
                <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            </div>

            <DashboardMock
              labels={{
                forum: t('mock.forum'),
                active: t('mock.active'),
                sold: t('mock.sold'),
                registered: t('mock.registered'),
                revenue: t('mock.revenue'),
                dynamics: t('mock.dynamics'),
              }}
            />
          </div>
        </div>
      </Reveal>
    </section>
  )
}
