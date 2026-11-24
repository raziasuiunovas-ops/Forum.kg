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
import type { EventView } from '@/components/landing/EventsCalendar'

/** Forums formatted (dates, prices, labels) for the client-side EventsCalendar. */
export async function buildEventViews(locale: AppLocale): Promise<EventView[]> {
  const t = await getT(locale, 'events')
  const forums = await getUpcomingForums(locale)
  return forums.map((f) => ({
    id: f.id,
    href: `/${locale}/forums/${f.slug}`,
    bannerUrl: f.bannerUrl,
    bannerPosition: f.bannerPosition,
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
}

export async function getEventsLabels(locale: AppLocale) {
  const t = await getT(locale, 'events')
  return {
    all: t('all'),
    search: t('search'),
    featured: t('featured'),
    ticketsFrom: t('ticketsFrom'),
    soldOut: t('soldOut'),
    empty: t('empty'),
  }
}
