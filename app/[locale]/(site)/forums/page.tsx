import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isAppLocale } from '@/i18n/routing'
import { getT } from '@/lib/i18n/server'
import { buildEventViews, getEventsLabels } from '@/lib/forums/views'
import { EventsCalendar } from '@/components/landing/EventsCalendar'
import { Eyebrow } from '@/components/landing/Eyebrow'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return {}
  const t = await getT(locale, 'forumsPage')
  return { title: `${t('title')} — FORUM.KG`, description: t('subtitle') }
}

export default async function ForumsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const t = await getT(locale, 'forumsPage')
  const [events, labels] = await Promise.all([buildEventViews(locale), getEventsLabels(locale)])

  return (
    <div className="min-h-screen bg-surface pb-24 pt-32 sm:pt-36">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-tighter text-ink sm:text-6xl">
          {t('title')}
          <span className="text-primary">.</span>
        </h1>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-500">{t('subtitle')}</p>
        <EventsCalendar events={events} labels={labels} />
      </div>
    </div>
  )
}
