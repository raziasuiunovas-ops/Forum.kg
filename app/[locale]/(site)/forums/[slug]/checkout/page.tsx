import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { isAppLocale } from '@/i18n/routing'
import { getT, loadMessages } from '@/lib/i18n/server'
import type { Messages } from '@/lib/i18n/client'
import { getForumBySlug } from '@/lib/forums'
import { formatEventDate, formatEventTime, formatMoneyMinor } from '@/lib/format'
import { CheckoutClient } from '@/components/checkout/CheckoutClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return {}
  const t = await getT(locale, 'checkout')
  return { title: `${t('title')} — FORUM.KG`, robots: { index: false } }
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  if (!isAppLocale(locale)) notFound()
  const forum = await getForumBySlug(locale, slug)
  if (!forum) notFound()
  const messages = (await loadMessages(locale)).checkout as Messages
  const kgs = locale === 'en' ? 'KGS' : 'сом'

  return (
    <div className="min-h-screen bg-surface pb-24 pt-32 sm:pt-36">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Suspense fallback={null}>
          <CheckoutClient
            locale={locale}
            slug={forum.slug}
            forumId={forum.id}
            forumTitle={forum.title}
            forumMeta={`${formatEventDate(forum.startsAt, locale, forum.timeZone)} · ${formatEventTime(forum.startsAt, locale, forum.timeZone)}`}
            isDemo={forum.isDemo}
            maxPerAccount={forum.maxTicketsPerAccount}
            messages={messages}
            categories={forum.categoriesFull.map((c) => ({
              id: c.id,
              code: c.code,
              name: c.name,
              priceMinor: c.priceMinor,
              priceLabel: `${formatMoneyMinor(c.priceMinor, locale)} ${kgs}`,
              available: c.available,
            }))}
          />
        </Suspense>
      </div>
    </div>
  )
}
