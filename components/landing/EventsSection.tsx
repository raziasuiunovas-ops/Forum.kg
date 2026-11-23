import { getT } from '@/lib/i18n/server'
import { getUpcomingForums } from '@/lib/forums'
import {
  formatDay,
  formatDayMonth,
  formatEventTime,
  formatMonthShort,
  formatMoneyMinor,
  formatYear,
} from '@/lib/format'
import type { AppLocale } from '@/i18n/routing'
import { Reveal } from '@/components/motion/Reveal'
import { Eyebrow } from './Eyebrow'
import { EventsCalendar, type EventView } from './EventsCalendar'

export async function EventsSection({ locale }: { locale: AppLocale }) {
  const t = await getT(locale, 'events')
  const forums = await getUpcomingForums(locale)

  // Everything is formatted on the server; the client component only filters/searches.
  const events: EventView[] = forums.map((f) => ({
    id: f.id,
    href: `/${locale}/forums/${f.slug}`,
    bannerUrl: f.bannerUrl,
    tag: f.tag,
    title: f.title,
    description: f.shortDescription,
    city: f.venueName.split(',')[0].trim(),
    venue: f.venueName,
    day: formatDay(f.startsAt, locale, f.timeZone),
    monthShort: formatMonthShort(f.startsAt, locale, f.timeZone),
    year: formatYear(f.startsAt, f.timeZone),
    dayMonth: formatDayMonth(f.startsAt, locale, f.timeZone).toUpperCase(),
    time: formatEventTime(f.startsAt, locale, f.timeZone),
    priceLabel: t('from', { price: formatMoneyMinor(f.minPriceMinor, locale) }),
    leftLabel: t('left', { count: f.availableTickets }),
    soldOut: f.soldOut,
    categories: f.categories.map((c) => c.name),
  }))

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
          <EventsCalendar
            events={events}
            labels={{
              all: t('all'),
              search: t('search'),
              featured: t('featured'),
              ticketsFrom: t('ticketsFrom'),
              soldOut: t('soldOut'),
              empty: t('empty'),
            }}
          />
        </Reveal>
      </div>
    </section>
  )
}
