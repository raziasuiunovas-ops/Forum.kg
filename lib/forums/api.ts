/**
 * Reads forums from the backend (GET /api/v1/forums, /api/v1/forums/{slug}) and maps them
 * to the shapes the pages use. Returns null when the API is unreachable.
 */
import type { AppLocale } from '@/i18n/routing'
import type { ForumCardData, ForumDetailData } from './types'

function baseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return `http://localhost:${process.env.PORT ?? 3000}`
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      next: { revalidate: 60, tags: ['forums'] },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

interface ApiCategory {
  id: string
  code: string
  priceMinor: number
  capacity: number | null
  name: string
  availableTickets?: number
}
interface ApiForum {
  id: string
  slug: string
  bannerUrl: string | null
  venueName: string | null
  venueAddress: string | null
  timeZone: string
  startsAt: string
  availableTickets: number
  maxTicketsPerAccount: number
  title: string
  shortDescription: string | null
  description: string | null
  categories: ApiCategory[]
}

/** Guards against unexpected API payloads so a bad response can never crash a page. */
function isForum(f: unknown): f is ApiForum {
  const x = f as Partial<ApiForum> | null
  return !!x && typeof x.id === 'string' && typeof x.slug === 'string' && typeof x.startsAt === 'string' && Array.isArray(x.categories)
}

const FALLBACK_BANNER = '/images/forum-tech.webp'

function toCard(f: ApiForum): ForumCardData {
  const prices = f.categories.map((c) => c.priceMinor)
  return {
    id: f.id,
    isDemo: false,
    slug: f.slug,
    bannerUrl: f.bannerUrl || FALLBACK_BANNER,
    bannerPosition: '50% 40%',
    startsAt: f.startsAt,
    timeZone: f.timeZone,
    venueName: f.venueName || '—',
    tag: '',
    tagColor: 'blue',
    title: f.title,
    shortDescription: f.shortDescription || '',
    availableTickets: f.availableTickets,
    soldOut: f.availableTickets <= 0,
    minPriceMinor: prices.length ? Math.min(...prices) : 0,
    categories: f.categories.map((c) => ({ code: c.code, name: c.name })),
  }
}

const API_LOCALE: Record<AppLocale, string> = { ru: 'RU', ky: 'KY', en: 'EN' }

export async function fetchForumCards(locale: AppLocale): Promise<ForumCardData[] | null> {
  const data = await get<{ forums: ApiForum[] }>(`/api/v1/forums?locale=${API_LOCALE[locale]}&limit=50`)
  if (!data || !Array.isArray(data.forums)) return null
  return data.forums.filter(isForum).map(toCard)
}

export async function fetchForumDetail(locale: AppLocale, slug: string): Promise<ForumDetailData | null> {
  const f = await get<ApiForum>(`/api/v1/forums/${encodeURIComponent(slug)}?locale=${API_LOCALE[locale]}`)
  if (!isForum(f)) return null
  return {
    ...toCard(f),
    description: f.description || f.shortDescription || '',
    venueAddress: f.venueAddress || '',
    maxTicketsPerAccount: f.maxTicketsPerAccount,
    categoriesFull: f.categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      priceMinor: c.priceMinor,
      available: c.availableTickets ?? f.availableTickets,
    })),
  }
}
