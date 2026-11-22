import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { notFound } from 'next/navigation'
import '../globals.css'
import { isAppLocale, locales, type AppLocale } from '@/i18n/routing'
import { getT } from '@/lib/i18n/server'
import { getSiteSettings } from '@/lib/site/settings'
import { buildThemeStyle } from '@/lib/site/theme'

const inter = Inter({ subsets: ['latin', 'cyrillic'], display: 'swap' })

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return {}
  const [settings, t] = await Promise.all([getSiteSettings(locale), getT(locale, 'hero')])
  return {
    title: `${settings.displayName} — ${t('cta')}`,
    description: settings.heroSubtitle ?? t('subtitle'),
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const settings = await getSiteSettings(locale as AppLocale)

  return (
    <html
      lang={locale}
      style={buildThemeStyle({
        primary: settings.primaryColorHex,
        accent: settings.accentColorHex,
        footer: settings.footerColorHex,
      })}
    >
      <body className={inter.className}>{children}</body>
    </html>
  )
}
