import type { AppLocale } from '@/i18n/routing'

type Localized<T> = Partial<Record<AppLocale, T>> & { ru: T }

/**
 * Shape of a forum as the landing page needs it.
 * Mirrors GET /api/v1/forums (docs/openapi.yaml -> Forum) after translations
 * were resolved for the current locale. `tag` is NOT in the API contract yet.
 */
export interface MockForum {
  id: string
  slug: string
  bannerUrl: string
  startsAt: string // ISO 8601
  timeZone: string
  venueName: string
  tag: Localized<string>
  tagColor: 'blue' | 'green' | 'purple'
  title: Localized<string>
  shortDescription: Localized<string>
  availableTickets: number
  categories: { code: string; priceMinor: number; name: Localized<string> }[]
}

export interface ForumCardData {
  id: string
  slug: string
  bannerUrl: string
  startsAt: string
  timeZone: string
  venueName: string
  tag: string
  tagColor: 'blue' | 'green' | 'purple'
  title: string
  shortDescription: string
  availableTickets: number
  soldOut: boolean
  minPriceMinor: number
  categories: { code: string; name: string }[]
}
