import Link from 'next/link'
import { CalendarDays, MapPin } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import { formatEventDate, formatEventTime, formatMoneyMinor } from '@/lib/format'
import type { AppLocale } from '@/i18n/routing'
import type { ForumCardData } from '@/lib/forums/types'
import { buttonVariants, cn } from '@/components/ui/button'

const TAG_STYLE = {
  blue: 'bg-blue-600',
  green: 'bg-emerald-500',
  purple: 'bg-violet-500',
} as const

export async function ForumCard({ forum, locale }: { forum: ForumCardData; locale: AppLocale }) {
  const t = await getT(locale, 'forums')
  const href = `/${locale}/forums/${forum.slug}`

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[16/9] bg-slate-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={forum.bannerUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        <span className={cn('absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold text-white', TAG_STYLE[forum.tagColor])}>
          {forum.tag}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold text-slate-900">{forum.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{forum.shortDescription}</p>

        <dl className="mt-4 space-y-2 text-sm text-slate-800">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
            <dd>
              {formatEventDate(forum.startsAt, locale, forum.timeZone)} • {formatEventTime(forum.startsAt, locale, forum.timeZone)}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <dd>{forum.venueName}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-slate-600">
          <span className="font-semibold">{t('categories')}</span>
          {forum.categories.map((c) => (
            <span
              key={c.code}
              className={cn(
                'rounded-full px-2.5 py-0.5 font-semibold',
                c.code === 'VIP' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary',
              )}
            >
              {c.name}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="text-lg font-extrabold text-slate-900">
              {t('from', { price: formatMoneyMinor(forum.minPriceMinor, locale) })}
            </p>
            {forum.soldOut ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
                <span className="h-2 w-2 rounded-full bg-red-500" /> {t('soldOut')}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t('left', { count: forum.availableTickets })}
              </p>
            )}
          </div>

          {forum.soldOut ? (
            <span className={cn(buttonVariants({ variant: 'muted' }), 'cursor-not-allowed')} aria-disabled="true">
              {t('soldOutButton')}
            </span>
          ) : (
            <Link href={href} className={cn(buttonVariants())}>
              {t('buy')}
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
