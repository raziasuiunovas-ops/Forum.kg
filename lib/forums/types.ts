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
  /** CSS object-position, to keep the important part of the photo visible when cropped */
  bannerPosition: string
  startsAt: string // ISO 8601
  timeZone: string
  venueName: string
  tag: Localized<string>
  tagColor: 'blue' | 'green' | 'purple'
  title: Localized<string>
  shortDescription: Localized<string>
  description: Localized<string>
  venueAddress: Localized<string>
  maxTicketsPerAccount: number
  availableTickets: number
  categories: { code: string; priceMinor: number; available: number; name: Localized<string> }[]
}

export interface ForumCardData {
  id: string
  slug: string
  bannerUrl: string
  bannerPosition: string
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

export interface ForumDetailData extends ForumCardData {
  description: string
  venueAddress: string
  maxTicketsPerAccount: number
  categoriesFull: { code: string; name: string; priceMinor: number; available: number }[]
}
