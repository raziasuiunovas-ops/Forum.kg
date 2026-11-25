import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { notFound } from 'next/navigation'
import '../globals.css'
import { isAppLocale, locales, type AppLocale } from '@/i18n/routing'
import { getSiteSettings } from '@/lib/site/settings'
import { buildThemeStyle } from '@/lib/site/theme'
import { pageMetadata } from '@/lib/seo'

const inter = Inter({ subsets: ['latin', 'cyrillic'], display: 'swap' })

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return {}
  const base = pageMetadata(locale, 'home', '')
  return {
    ...base,
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'FORUM.KG',
      startupImage: '/icons/icon-512.png',
    },
    icons: {
      icon: [
        { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      shortcut: '/icons/favicon-32.png',
    },
    other: {
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'black-translucent',
      'apple-mobile-web-app-title': 'FORUM.KG',
      'msapplication-TileColor': '#070B24',
      'msapplication-TileImage': '/icons/icon-192.png',
      'theme-color': '#070B24',
    },
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
      <body className={`${inter.className} bg-surface text-ink`}>
        {/* If JS is disabled the scroll-reveal content must stay visible */}
        <noscript>
          <style>{'.reveal{opacity:1!important;transform:none!important}'}</style>
        </noscript>
        {children}
      </body>
    </html>
  )
}
