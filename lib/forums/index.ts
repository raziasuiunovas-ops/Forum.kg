/**
 * Data access for public forums.
 * TODO(api): replace MOCK_FORUMS with GET /api/v1/forums?locale=RU (docs/openapi.yaml).
 * Missing translations fall back to Russian (spec section 17).
 */
import type { AppLocale } from '@/i18n/routing'
import { MOCK_FORUMS } from './mock-data'
import type { ForumCardData } from './types'

export async function getUpcomingForums(locale: AppLocale): Promise<ForumCardData[]> {
  return MOCK_FORUMS.map((f) => ({
    id: f.id,
    slug: f.slug,
    bannerUrl: f.bannerUrl,
    startsAt: f.startsAt,
    timeZone: f.timeZone,
    venueName: f.venueName,
    tag: f.tag[locale] ?? f.tag.ru,
    tagColor: f.tagColor,
    title: f.title[locale] ?? f.title.ru,
    shortDescription: f.shortDescription[locale] ?? f.shortDescription.ru,
    availableTickets: f.availableTickets,
    soldOut: f.availableTickets <= 0,
    minPriceMinor: Math.min(...f.categories.map((c) => c.priceMinor)),
    categories: f.categories.map((c) => ({ code: c.code, name: c.name[locale] ?? c.name.ru })),
  }))
}
