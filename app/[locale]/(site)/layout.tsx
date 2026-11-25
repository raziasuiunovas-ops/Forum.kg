import { notFound } from 'next/navigation'
import { isAppLocale } from '@/i18n/routing'
import { getSiteSettings } from '@/lib/site/settings'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { InstallBanner } from '@/components/pwa/InstallBanner'

/** Public site shell: floating header + footer around every public page. */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const settings = await getSiteSettings(locale)

  return (
    <>
      <Header locale={locale} settings={settings} />
      <main>{children}</main>
      <Footer locale={locale} settings={settings} />
      <InstallBanner />
    </>
  )
}
