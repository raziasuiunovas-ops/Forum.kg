import { Inter } from 'next/font/google'
import { defaultLocale, isAppLocale } from '@/i18n/routing'
import { getSiteSettings } from '@/lib/site/settings'
import { buildThemeStyle } from '@/lib/site/theme'
import './globals.css'

const inter = Inter({ subsets: ['latin', 'cyrillic'], display: 'swap' })

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale?: string }>
}) {
  const { locale: routeLocale } = await params
  const locale = isAppLocale(routeLocale) ? routeLocale : null
  const settings = locale ? await getSiteSettings(locale) : null

  return (
    <html
      lang={locale ?? defaultLocale}
      style={settings ? buildThemeStyle({
        primary: settings.primaryColorHex,
        accent: settings.accentColorHex,
      }) as React.CSSProperties : undefined}
    >
      <body className={`${inter.className} bg-surface text-ink`}>
        <noscript>
          <style>{'.reveal{opacity:1!important;transform:none!important}'}</style>
        </noscript>
        {children}
      </body>
    </html>
  )
}
