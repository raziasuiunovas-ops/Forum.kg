/**
 * Data access for public forums.
 * TODO(api): replace MOCK_FORUMS with GET /api/v1/forums?locale=RU and
 * GET /api/v1/forums/{slug} (docs/openapi.yaml). Missing translations fall back to Russian.
 */
import type { AppLocale } from '@/i18n/routing'
import { MOCK_FORUMS } from './mock-data'
import type { ForumCardData, ForumDetailData, MockForum } from './types'
import { fetchForumCards, fetchForumDetail } from './api'

/** Demo forums are shown while the database has no published forums (set FORUMS_DEMO_FALLBACK=false to disable). */
const DEMO_FALLBACK = process.env.FORUMS_DEMO_FALLBACK !== 'false'

function toCard(f: MockForum, locale: AppLocale): ForumCardData {
  return {
    id: f.id,
    isDemo: true,
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
  const real = await fetchForumCards(locale)
  if (real && (real.length > 0 || !DEMO_FALLBACK)) return real
  return DEMO_FALLBACK ? MOCK_FORUMS.map((f) => toCard(f, locale)) : []
}

export async function getForumBySlug(locale: AppLocale, slug: string): Promise<ForumDetailData | null> {
  const real = await fetchForumDetail(locale, slug)
  if (real) return real
  const f = DEMO_FALLBACK ? MOCK_FORUMS.find((x) => x.slug === slug) : undefined
  if (!f) return null
  return {
    ...toCard(f, locale),
    description: f.description[locale] ?? f.description.ru,
    venueAddress: f.venueAddress[locale] ?? f.venueAddress.ru,
    maxTicketsPerAccount: f.maxTicketsPerAccount,
    categoriesFull: f.categories.map((c) => ({
      id: `${f.id}-${c.code}`,
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
