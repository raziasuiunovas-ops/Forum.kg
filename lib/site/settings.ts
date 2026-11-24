// Temporary stub - will be replaced by frontend-v4 merge
import type { AppLocale } from '@/i18n/routing'

export type SiteSettingsView = {
  primaryColorHex: string
  accentColorHex: string
  footerColorHex: string
}

export async function getSiteSettings(_locale: AppLocale): Promise<SiteSettingsView> {
  return {
    primaryColorHex: '#3b82f6',
    accentColorHex: '#8b5cf6',
    footerColorHex: '#1f2937',
  }
}
