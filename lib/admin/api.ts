'use client'

/**
 * Real admin API (implemented by the backend): forums, users, dashboard.
 * Other admin sections still use the demo store in ./store.ts until their endpoints exist.
 */
import { api } from '@/lib/client/api'
import type { AdminForum, AdminUser, ForumStatus, L10n } from './types'

type ApiLocale = 'RU' | 'KY' | 'EN'
const LOCS: { api: ApiLocale; ui: keyof L10n }[] = [{ api: 'RU', ui: 'ru' }, { api: 'KY', ui: 'ky' }, { api: 'EN', ui: 'en' }]

interface ApiTranslation { locale: ApiLocale; title: string; shortDescription: string | null; description: string | null; program: string | null }
interface ApiCategory { code: string; priceMinor: number; capacity: number | null; translations?: { locale: ApiLocale; name: string }[] }
interface ApiForum {
  id: string; slug: string; status: ForumStatus; bannerUrl: string | null; venueName: string | null; venueAddress: string | null
  startsAt: string; endsAt: string | null; qrExpiresAt: string; capacity: number; maxTicketsPerAccount: number; publishAt: string | null
  translations: ApiTranslation[]; categories: ApiCategory[]
  stats?: { activeTickets: number; paidOrders: number; checkIns: number; availableCapacity: number }
}

export interface ApiOutcome<T> { ok: boolean; data?: T; error?: string }

/** Readable Russian text for an API error (+ the backend's own message / field list). */
function describe(res: { status: number; code?: string; message?: string; network?: boolean; data: unknown }): string {
  if (res.network) return 'Нет связи с сервером.'
  if (res.status === 401) return 'Сессия истекла. Войдите в админ-панель заново.'
  if (res.status === 403) return 'Недостаточно прав для этого действия.'
  if (res.status === 429) return 'Слишком много запросов. Подождите немного.'
  const details = (res.data as { error?: { details?: unknown } } | null)?.error?.details
  let extra = ''
  if (details && typeof details === 'object') {
    const fields = Object.entries(details as Record<string, { _errors?: string[] }>)
      .filter(([k, v]) => k !== '_errors' && v && Array.isArray(v._errors) && v._errors.length)
      .map(([k, v]) => `${k}: ${v._errors!.join(', ')}`)
    if (fields.length) extra = ` (${fields.join('; ')})`
    else if (Array.isArray(details)) extra = ` (${(details as { message?: string; path?: unknown[] }[]).map((d) => `${(d.path ?? []).join('.')}: ${d.message}`).join('; ')})`
  }
  return `${res.message || 'Ошибка сервера'}${res.code ? ` [${res.code}]` : ''}${extra}`
}

const emptyL10n = (): L10n => ({ ru: '', ky: '', en: '' })

function fromApi(f: ApiForum): AdminForum {
  const pick = (k: 'title' | 'shortDescription' | 'description' | 'program') => {
    const out = emptyL10n()
    for (const l of LOCS) out[l.ui] = f.translations.find((t) => t.locale === l.api)?.[k] ?? ''
    return out
  }
  return {
    id: f.id,
    slug: f.slug,
    status: f.status,
    title: pick('title'),
    shortDescription: pick('shortDescription'),
    description: pick('description'),
    program: pick('program'),
    bannerUrl: f.bannerUrl ?? '',
    startsAt: f.startsAt,
    endsAt: f.endsAt,
    venueName: f.venueName ?? '',
    venueAddress: f.venueAddress ?? '',
    capacity: f.capacity,
    maxTicketsPerAccount: f.maxTicketsPerAccount,
    qrExpiresAt: f.qrExpiresAt,
    publishAt: f.publishAt,
    categories: f.categories.map((c) => ({ code: c.code, priceMinor: c.priceMinor, capacity: c.capacity })),
    sold: f.stats?.activeTickets ?? 0,
    checkedIn: f.stats?.checkIns ?? 0,
  }
}

const CATEGORY_NAMES: Record<string, string> = { STANDARD: 'Standard', VIP: 'VIP' }

function toApiBody(f: AdminForum, { includeCategories }: { includeCategories: boolean }) {
  const absolute = (u: string) => (u ? new URL(u, window.location.origin).toString() : undefined)
  const translations = LOCS.filter((l) => f.title[l.ui].trim()).map((l) => ({
    locale: l.api,
    title: f.title[l.ui].trim(),
    ...(f.shortDescription[l.ui].trim() && { shortDescription: f.shortDescription[l.ui].trim() }),
    ...(f.description[l.ui].trim() && { description: f.description[l.ui].trim() }),
    ...(f.program[l.ui].trim() && { program: f.program[l.ui].trim() }),
  }))
  const body: Record<string, unknown> = {
    status: f.status,
    bannerUrl: absolute(f.bannerUrl),
    venueName: f.venueName.trim(),
    venueAddress: f.venueAddress.trim(),
    timeZone: 'Asia/Bishkek',
    startsAt: new Date(f.startsAt).toISOString(),
    ...(f.endsAt ? { endsAt: new Date(f.endsAt).toISOString() } : {}),
    qrExpiresAt: new Date(f.qrExpiresAt).toISOString(),
    capacity: f.capacity,
    maxTicketsPerAccount: f.maxTicketsPerAccount,
    ...(f.publishAt ? { publishAt: new Date(f.publishAt).toISOString() } : {}),
    translations,
  }
  if (includeCategories) {
    body.categories = f.categories.map((c, i) => ({
      code: c.code,
      priceMinor: c.priceMinor,
      currency: 'KGS',
      ...(c.capacity ? { capacity: c.capacity } : {}),
      sortOrder: i,
      isActive: true,
      translations: LOCS.map((l) => ({ locale: l.api, name: CATEGORY_NAMES[c.code] ?? c.code })),
    }))
  }
  return body
}

export async function listForums(): Promise<ApiOutcome<AdminForum[]>> {
  const res = await api<{ forums: ApiForum[] }>('/api/v1/admin/forums?limit=100&sortBy=startsAt&sortOrder=asc')
  return res.ok && res.data ? { ok: true, data: res.data.forums.map(fromApi) } : { ok: false, error: describe(res) }
}

export async function createForum(f: AdminForum): Promise<ApiOutcome<null>> {
  const res = await api('/api/v1/admin/forums', { method: 'POST', csrf: true, body: { slug: f.slug, ...toApiBody(f, { includeCategories: true }) } })
  return res.ok ? { ok: true } : { ok: false, error: describe(res) }
}

/** Categories are only sent while nothing is sold: the backend recreates them on update. */
export async function updateForum(f: AdminForum): Promise<ApiOutcome<null>> {
  const res = await api(`/api/v1/admin/forums/${f.id}`, { method: 'PATCH', csrf: true, body: toApiBody(f, { includeCategories: f.sold === 0 }) })
  return res.ok ? { ok: true } : { ok: false, error: describe(res) }
}

export async function setForumStatus(id: string, status: ForumStatus): Promise<ApiOutcome<null>> {
  const res = await api(`/api/v1/admin/forums/${id}`, { method: 'PATCH', csrf: true, body: { status } })
  return res.ok ? { ok: true } : { ok: false, error: describe(res) }
}

interface ApiUser {
  id: string; firstName: string | null; lastName: string | null; phone: string | null; phoneVerified: boolean
  email: string | null; role: string; status: 'ACTIVE' | 'SUSPENDED'; createdAt: string; orderCount: number; ticketCount: number
}
export type AdminUserRow = AdminUser & { role: string; phoneVerified: boolean }

export async function listUsers(): Promise<ApiOutcome<AdminUserRow[]>> {
  const res = await api<{ data: { users: ApiUser[] } }>('/api/v1/admin/users?limit=100')
  if (!res.ok || !res.data) return { ok: false, error: describe(res) }
  return {
    ok: true,
    data: res.data.data.users.map((u) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.phone || '—',
      phone: u.phone ?? '—',
      email: u.email,
      registeredAt: u.createdAt,
      status: u.status,
      orders: u.orderCount,
      tickets: u.ticketCount,
      spentMinor: 0,
      role: u.role,
      phoneVerified: u.phoneVerified,
    })),
  }
}

export async function setUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<ApiOutcome<null>> {
  const res = await api(`/api/v1/admin/users/${id}`, { method: 'PATCH', csrf: true, body: { status } })
  return res.ok ? { ok: true } : { ok: false, error: describe(res) }
}

export interface DashboardStats {
  users: { total: number; newInPeriod: number }
  forums: { total: number; active: number }
  orders: { total: number; pending: number; completed: number; cancelled: number; revenueMinor: number }
  payments: { totalAmountMinor: number; successful: number; failed: number; pending: number }
  system: { dbStatus: string }
}

export async function getDashboardStats(): Promise<ApiOutcome<DashboardStats>> {
  const res = await api<{ data: DashboardStats }>('/api/v1/admin/dashboard/stats')
  return res.ok && res.data ? { ok: true, data: res.data.data } : { ok: false, error: describe(res) }
}
