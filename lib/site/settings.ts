import type { AppLocale } from '@/i18n/routing'
import { prisma } from '@/lib/db'
import { Locale } from '@prisma/client'
import { cache } from 'react'

export type SiteSettingsView = {
  displayName: string
  logoUrl?: string | null
  heroImageUrl?: string | null
  primaryColorHex: string
  accentColorHex: string
  heroSubtitle?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  socialLinks?: SocialLinkView[]
}

export type SocialLinkView = {
  platform: string
  url: string
}

// Конвертируем AppLocale в Prisma Locale enum
function toPrismaLocale(locale: AppLocale): Locale {
  return locale.toUpperCase() as Locale
}

// Кешируем на время рендера для предотвращения hydration mismatch
export const getSiteSettings = cache(async (_locale: AppLocale): Promise<SiteSettingsView> => {
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: 'main' },
      select: {
        displayName: true,
        logoUrl: true,
        contactEmail: true,
        primaryColorHex: true,
        accentColorHex: true,
        translations: {
          where: { locale: toPrismaLocale(_locale) },
          select: {
            heroSubtitle: true,
          },
          take: 1,
        },
      },
    })

    if (!settings) {
      // Дефолтные значения если настроек нет в БД
      return {
        displayName: 'FORUM.KG',
        primaryColorHex: '#3b82f6',
        accentColorHex: '#8b5cf6',
      }
    }

    return {
      displayName: settings.displayName,
      logoUrl: settings.logoUrl,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactEmail, // Временно используем email
      socialLinks: [],
      primaryColorHex: settings.primaryColorHex,
      accentColorHex: settings.accentColorHex,
      heroSubtitle: settings.translations[0]?.heroSubtitle,
    }
  } catch (error) {
    console.error('Failed to load site settings:', error)
    // Fallback на дефолтные значения при ошибке
    return {
      displayName: 'FORUM.KG',
      primaryColorHex: '#3b82f6',
      accentColorHex: '#8b5cf6',
    }
  }
})
