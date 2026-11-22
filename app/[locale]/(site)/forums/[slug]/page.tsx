import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, Clock, MapPin } from 'lucide-react'
import { isAppLocale, locales } from '@/i18n/routing'
import { getT, loadMessages } from '@/lib/i18n/server'
import { getForumBySlug, getForumSlugs } from '@/lib/forums'
import { formatEventDate, formatEventTime, formatMoneyMinor } from '@/lib/format'
import { BuyPanel } from '@/components/forum/BuyPanel'
import type { Messages } from '@/lib/i18n/client'

export function generateStaticParams() {
  return locales.flatMap((locale) => getForumSlugs().map((slug) => ({ locale, slug })))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isAppLocale(locale)) return {}
  const forum = await getForumBySlug(locale, slug)
  return forum ? { title: `${forum.title} — FORUM.KG`, description: forum.shortDescription } : {}
}

export default async function ForumPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  if (!isAppLocale(locale)) notFound()
  const forum = await getForumBySlug(locale, slug)
  if (!forum) notFound()

  const t = await getT(locale, 'forum')
  const messages = (await loadMessages(locale)).forum as Messages

  return (
    <div className="bg-surface pb-24">
      {/* banner */}
      <section className="relative isolate overflow-hidden bg-footer pb-24 pt-32 text-white sm:pt-36">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={forum.bannerUrl}
          alt=""
          style={{ objectPosition: forum.bannerPosition }}
          className="absolute inset-0 -z-20 h-full w-full object-cover opacity-60"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-footer/60 via-footer/55 to-footer/95" />
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Link
            href={`/${locale}/forums`}
            className="inline-flex items-center gap-2 text-xs font-bold text-white/70 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> {t('back')}
          </Link>
          <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
            {forum.tag} · {forum.venueName.split(',')[0]}
          </p>
          <h1 className="mt-3 max-w-3xl text-5xl font-black leading-[0.95] tracking-tighter sm:text-7xl">{forum.title}</h1>
          <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-3 text-sm text-white/85">
            <li className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {formatEventDate(forum.startsAt, locale, forum.timeZone)}
            </li>
            <li className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {formatEventTime(forum.startsAt, locale, forum.timeZone)}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {forum.venueName}
            </li>
          </ul>
        </div>
      </section>

      <div className="relative -mt-12 rounded-t-[2.5rem] bg-surface pt-12">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        <article>
          <h2 className="text-2xl font-black tracking-tight text-ink">{t('about')}</h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-600">{forum.description}</p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
              <dt className="text-[11px] font-bold uppercase tracking-widest text-primary">{t('when')}</dt>
              <dd className="mt-2 text-sm font-semibold text-ink">
                {formatEventDate(forum.startsAt, locale, forum.timeZone)}, {formatEventTime(forum.startsAt, locale, forum.timeZone)}
              </dd>
            </div>
            <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
              <dt className="text-[11px] font-bold uppercase tracking-widest text-primary">{t('where')}</dt>
              <dd className="mt-2 text-sm font-semibold text-ink">{forum.venueName}</dd>
              <dd className="text-xs text-slate-500">{forum.venueAddress}</dd>
            </div>
          </dl>
        </article>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <BuyPanel
            locale={locale}
            slug={forum.slug}
            maxPerAccount={forum.maxTicketsPerAccount}
            messages={messages}
            categories={forum.categoriesFull.map((c) => ({
              code: c.code,
              name: c.name,
              priceMinor: c.priceMinor,
              priceLabel: `${formatMoneyMinor(c.priceMinor, locale)} ${t('kgs')}`,
              available: c.available,
            }))}
          />
        </aside>
      </div>
      </div>
    </div>
  )
}
