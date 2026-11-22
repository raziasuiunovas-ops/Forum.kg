import { notFound } from 'next/navigation'
import { isAppLocale } from '@/i18n/routing'
import { getSiteSettings } from '@/lib/site/settings'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Hero } from '@/components/landing/Hero'
import { UpcomingForums } from '@/components/landing/UpcomingForums'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { About } from '@/components/landing/About'
import { Contacts } from '@/components/landing/Contacts'

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const settings = await getSiteSettings(locale)

  return (
    <>
      <Header locale={locale} settings={settings} />
      <main>
        <Hero locale={locale} settings={settings} />
        <UpcomingForums locale={locale} />
        <HowItWorks locale={locale} />
        <About locale={locale} settings={settings} />
        <Contacts locale={locale} settings={settings} />
      </main>
      <Footer locale={locale} settings={settings} />
    </>
  )
}
