import { locales, type Locale } from './request'

export const defaultLocale: Locale = 'ru'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function isAppLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.includes(value as Locale)
}
