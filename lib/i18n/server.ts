/**
 * Server-side translations WITHOUT the next-intl Next.js plugin / middleware
 * (the backend owns middleware.ts and next.config.ts, so we do not depend on them).
 * Messages live in messages/{ru,ky,en}.json.
 */
import { createTranslator } from 'next-intl'
import type { AppLocale } from '@/i18n/routing'

export async function loadMessages(locale: AppLocale) {
  return (await import(`@/messages/${locale}.json`)).default as Record<string, unknown>
}

export async function getT(locale: AppLocale, namespace: string) {
  const messages = await loadMessages(locale)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createTranslator({ locale, messages, namespace } as any) as unknown as Translator
}

export interface Translator {
  (key: string, values?: Record<string, string | number | Date>): string
  rich: (
    key: string,
    values?: Record<string, string | number | ((chunks: React.ReactNode) => React.ReactNode)>,
  ) => React.ReactNode
}
