/**
 * Data access for public forums.
 * TODO(api): replace MOCK_FORUMS with GET /api/v1/forums?locale=RU and
 * GET /api/v1/forums/{slug} (docs/openapi.yaml). Missing translations fall back to Russian.
 */
import type { AppLocale } from '@/i18n/routing'
import { MOCK_FORUMS } from './mock-data'
import type { ForumCardData, ForumDetailData, MockForum } from './types'

function toCard(f: MockForum, locale: AppLocale): ForumCardData {
  return {
    id: f.id,
    slug: f.slug,
    bannerUrl: f.bannerUrl,
    bannerPosition: f.bannerPosition,
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
  }
}

export async function getUpcomingForums(locale: AppLocale): Promise<ForumCardData[]> {
  return MOCK_FORUMS.map((f) => toCard(f, locale))
}

export async function getForumBySlug(locale: AppLocale, slug: string): Promise<ForumDetailData | null> {
  const f = MOCK_FORUMS.find((x) => x.slug === slug)
  if (!f) return null
  return {
    ...toCard(f, locale),
    description: f.description[locale] ?? f.description.ru,
    venueAddress: f.venueAddress[locale] ?? f.venueAddress.ru,
    maxTicketsPerAccount: f.maxTicketsPerAccount,
    categoriesFull: f.categories.map((c) => ({
      code: c.code,
      name: c.name[locale] ?? c.name.ru,
      priceMinor: c.priceMinor,
      available: c.available,
    })),
  }
}

export function getForumSlugs(): string[] {
  return MOCK_FORUMS.map((f) => f.slug)
}
