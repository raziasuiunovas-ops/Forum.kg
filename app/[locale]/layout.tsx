import type { Metadata } from 'next'
import { locales, isAppLocale } from '@/i18n/routing'
import { getT } from '@/lib/i18n/server'
import { getSiteSettings } from '@/lib/site/settings'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return {}

  const [settings, t] = await Promise.all([getSiteSettings(locale), getT(locale, 'hero')])

  return {
    title: `${settings.displayName} — ${t('line1')}. ${t('line2')}. ${t('line3')}.`,
    description: settings.heroSubtitle ?? t('subtitle'),
  }
}

export default async function LocaleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
