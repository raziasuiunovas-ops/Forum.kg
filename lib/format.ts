import type { AppLocale } from '@/i18n/routing'

const INTL_LOCALE: Record<AppLocale, string> = {
  ru: 'ru-RU',
  ky: 'ky-KG',
  en: 'en-GB',
}

/** "21 ноября 2026" in the forum's own time zone. */
export function formatEventDate(iso: string, locale: AppLocale, timeZone: string) {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso))
}

/** "10:00" in the forum's own time zone. */
export function formatEventTime(iso: string, locale: AppLocale, timeZone: string) {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(iso))
}

/** Money is stored in tyiyn (1 KGS = 100). Returns "2 500". */
export function formatMoneyMinor(minor: number, locale: AppLocale) {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 0 }).format(
    minor / 100,
  )
}
