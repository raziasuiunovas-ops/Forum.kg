/**
 * Site settings — reads from /api/v1/admin/settings (real DB).
 * Falls back to DEFAULT_SITE_SETTINGS if DB not available.
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
  heroTitle?: string
  heroSubtitle?: string
  aboutText?: string
  socialLinks: SocialLinkView[]
}

export const DEFAULT_SITE_SETTINGS: SiteSettingsView = {
  displayName: 'FORUM.KG',
  logoUrl: null,
  heroImageUrl: '/images/hero-forum.webp',
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
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(`${base}/api/v1/admin/settings`, {
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
      aboutImageUrl: null,
      primaryColorHex: api.primaryColorHex ?? DEFAULT_SITE_SETTINGS.primaryColorHex,
      accentColorHex: api.accentColorHex ?? DEFAULT_SITE_SETTINGS.accentColorHex,
      footerColorHex: api.footerColorHex ?? DEFAULT_SITE_SETTINGS.footerColorHex,
      contactEmail: api.contactEmail ?? DEFAULT_SITE_SETTINGS.contactEmail,
      contactPhone: api.contactPhone ?? DEFAULT_SITE_SETTINGS.contactPhone,
      socialLinks: api.socialLinks?.length ? api.socialLinks : DEFAULT_SITE_SETTINGS.socialLinks,
      heroTitle: tr?.heroTitle ?? undefined,
      heroSubtitle: tr?.heroSubtitle ?? undefined,
      aboutText: tr?.aboutText ?? undefined,
    }
  } catch {
    return DEFAULT_SITE_SETTINGS
  }
}
