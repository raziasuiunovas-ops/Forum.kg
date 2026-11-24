import { Inter } from 'next/font/google'
import { defaultLocale } from '@/i18n/routing'
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

  return (
    <html lang={routeLocale ?? defaultLocale}>
      <body className={`${inter.className} bg-surface text-ink`}>
        <noscript>
          <style>{'.reveal{opacity:1!important;transform:none!important}'}</style>
        </noscript>
        {children}
      </body>
    </html>
  )
}
