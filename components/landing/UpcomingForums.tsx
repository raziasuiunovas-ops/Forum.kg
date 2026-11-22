import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import { getUpcomingForums } from '@/lib/forums'
import type { AppLocale } from '@/i18n/routing'
import { ForumCard } from './ForumCard'

export async function UpcomingForums({ locale }: { locale: AppLocale }) {
  const t = await getT(locale, 'forums')
  const forums = await getUpcomingForums(locale)

  return (
    <section id="forums" className="container px-4 py-14 sm:px-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('title')}</h2>
          <p className="mt-2 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <Link href={`/${locale}/forums`} className="hidden items-center gap-1 text-sm font-semibold text-primary sm:flex">
          {t('all')} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {forums.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-slate-500">{t('empty')}</p>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {forums.map((f) => (
            <ForumCard key={f.id} forum={f} locale={locale} />
          ))}
        </div>
      )}
    </section>
  )
}
