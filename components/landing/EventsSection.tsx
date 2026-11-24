import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import { buildEventViews, getEventsLabels } from '@/lib/forums/views'
import type { AppLocale } from '@/i18n/routing'
import { Reveal } from '@/components/motion/Reveal'
import { Eyebrow } from './Eyebrow'
import { EventsCalendar } from './EventsCalendar'

export async function EventsSection({ locale }: { locale: AppLocale }) {
  const t = await getT(locale, 'events')
  const [events, labels] = await Promise.all([buildEventViews(locale), getEventsLabels(locale)])

  return (
    <section id="events" className="bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <Eyebrow>{t('eyebrow')}</Eyebrow>
              <h2 className="mt-5 max-w-md text-5xl font-black leading-[0.95] tracking-tighter text-ink sm:text-6xl">
                {t('title')}
                <span className="text-primary">.</span>
              </h2>
            </div>
            <p className="max-w-[16rem] text-xs leading-relaxed text-slate-500">{t('subtitle')}</p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <EventsCalendar events={events} labels={labels} />
        </Reveal>

        <div className="mt-10 flex justify-center">
          <Link
            href={`/${locale}/forums`}
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-sm font-bold text-ink shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            {t('viewAll')}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  )
}
