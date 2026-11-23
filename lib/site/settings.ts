/**
 * Site settings used by the public pages (name, logo, colours, images, contacts).
 *
 * Admin Panel will edit these values (spec 8.5 / BR-18). Backend contract:
 * GET /api/v1/settings?locale=RU  (see docs/openapi.yaml -> SiteSettings).
 *
 * For now defaults below are used. When the backend endpoint is ready, set
 * NEXT_PUBLIC_USE_API=true and the API response is merged over the defaults.
 */
import type { AppLocale } from '@/i18n/routing'

export interface SocialLinkView {
  platform: 'instagram' | 'telegram' | 'facebook' | 'whatsapp' | 'linkedin'
  url: string
}

export interface SiteSettingsView {
  displayName: string
  logoUrl: string | null
  heroImageUrl: string
  aboutImageUrl: string | null
  primaryColorHex: string
  accentColorHex: string
  footerColorHex: string
  contactEmail: string
  contactPhone: string
  /** Optional admin overrides of translated texts; fall back to messages/*.json. */
  heroTitle?: string
  heroSubtitle?: string
  aboutText?: string
  socialLinks: SocialLinkView[]
}

export const DEFAULT_SITE_SETTINGS: SiteSettingsView = {
  displayName: 'FORUM.KG',
  logoUrl: null,
  heroImageUrl: '/images/hero-card.svg',
  aboutImageUrl: null,
  primaryColorHex: '#3B5BFF',
  accentColorHex: '#7C5CFF',
  footerColorHex: '#070B24',
  contactEmail: 'info@forum.kg',
  contactPhone: '+996 700 123 456',
  socialLinks: [
    { platform: 'instagram', url: '#' },
    { platform: 'telegram', url: '#' },
    { platform: 'facebook', url: '#' },
    { platform: 'whatsapp', url: '#' },
    { platform: 'linkedin', url: '#' },
  ],
}

export async function getSiteSettings(locale: AppLocale): Promise<SiteSettingsView> {
  if (process.env.NEXT_PUBLIC_USE_API !== 'true') return DEFAULT_SITE_SETTINGS

  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(`${base}/api/v1/settings?locale=${locale.toUpperCase()}`, {
      next: { revalidate: 60, tags: ['site-settings'] },
    })
    if (!res.ok) return DEFAULT_SITE_SETTINGS

    const api = await res.json()
    const tr = (api.translations ?? []).find(
      (t: { locale: string }) => t.locale === locale.toUpperCase(),
    )

    return {
      ...DEFAULT_SITE_SETTINGS,
      displayName: api.displayName ?? DEFAULT_SITE_SETTINGS.displayName,
      logoUrl: api.logoUrl ?? null,
      heroImageUrl: api.heroImageUrl ?? DEFAULT_SITE_SETTINGS.heroImageUrl,
      primaryColorHex: api.primaryColorHex ?? DEFAULT_SITE_SETTINGS.primaryColorHex,
      accentColorHex: api.accentColorHex ?? DEFAULT_SITE_SETTINGS.accentColorHex,
      contactEmail: api.contactEmail ?? DEFAULT_SITE_SETTINGS.contactEmail,
      contactPhone: api.contactPhone ?? DEFAULT_SITE_SETTINGS.contactPhone,
      heroTitle: tr?.heroTitle ?? undefined,
      heroSubtitle: tr?.heroSubtitle ?? undefined,
      aboutText: tr?.aboutText ?? undefined,
    }
  } catch {
    return DEFAULT_SITE_SETTINGS
  }
}
