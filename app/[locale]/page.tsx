import { notFound } from 'next/navigation'
import { isAppLocale } from '@/i18n/routing'
import { getSiteSettings } from '@/lib/site/settings'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Hero } from '@/components/landing/Hero'
import { Marquee } from '@/components/landing/Marquee'
import { EventsSection } from '@/components/landing/EventsSection'
import { Perks } from '@/components/landing/Perks'
import { Steps } from '@/components/landing/Steps'
import { Organizers } from '@/components/landing/Organizers'
import { Faq } from '@/components/landing/Faq'

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const settings = await getSiteSettings(locale)

  return (
    <>
      <Header locale={locale} settings={settings} />
      <main>
        <Hero locale={locale} settings={settings} />
        <Marquee locale={locale} />
        <EventsSection locale={locale} />
        <Perks locale={locale} />
        <Steps locale={locale} />
        <Organizers locale={locale} email={settings.contactEmail} />
        <Faq locale={locale} email={settings.contactEmail} />
      </main>
      <Footer locale={locale} settings={settings} />
    </>
  )
}
