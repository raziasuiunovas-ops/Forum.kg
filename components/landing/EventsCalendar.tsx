'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Clock, MapPin, Search, Tag } from 'lucide-react'

export interface EventView {
  id: string
  href: string
  bannerUrl: string
  tag: string
  title: string
  description: string
  city: string
  venue: string
  day: string
  monthShort: string
  year: string
  dayMonth: string
  time: string
  priceLabel: string
  leftLabel: string
  soldOut: boolean
  categories: string[]
}

export interface EventsLabels {
  all: string
  search: string
  featured: string
  ticketsFrom: string
  soldOut: string
  empty: string
}

export function EventsCalendar({ events, labels }: { events: EventView[]; labels: EventsLabels }) {
  const [tag, setTag] = useState<string>('all')
  const [query, setQuery] = useState('')

  const tags = useMemo(() => Array.from(new Set(events.map((e) => e.tag))), [events])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events.filter(
      (e) =>
        (tag === 'all' || e.tag === tag) &&
        (!q || `${e.title} ${e.description} ${e.venue} ${e.tag}`.toLowerCase().includes(q)),
    )
  }, [events, tag, query])

  const [featured, ...rest] = filtered

  return (
    <div>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0" role="tablist">
          {['all', ...tags].map((t) => {
            const active = t === tag
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTag(t)}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                  active
                    ? 'bg-ink text-white shadow-lg'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-ink hover:ring-slate-300'
                }`}
              >
                {t === 'all' ? labels.all : t}
              </button>
            )
          })}
        </div>

        <label className="relative block sm:w-64">
          <span className="sr-only">{labels.search}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.search}
            className="h-11 w-full rounded-full bg-white pl-11 pr-4 text-sm text-ink ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
      </div>

      {!featured ? (
        <p className="mt-10 rounded-3xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          {labels.empty}
        </p>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          {/* Featured */}
          <Link
            href={featured.href}
            className="group relative isolate flex min-h-[460px] flex-col justify-between overflow-hidden rounded-[2rem] p-6 text-white shadow-xl sm:p-8 lg:min-h-[540px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={featured.bannerUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 -z-20 h-full w-full object-cover transition duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#050a2e]/30 via-[#050a2e]/20 to-[#050a2e]/90" />

            <div className="flex items-start justify-between">
              <span className="rounded-full bg-white px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ink">
                + {labels.featured}
              </span>
              <span className="rounded-2xl border border-white/20 bg-white/10 px-3.5 py-2 text-center backdrop-blur">
                <span className="block text-2xl font-black leading-none">{featured.day}</span>
                <span className="block text-[9px] font-bold tracking-widest">{featured.monthShort}</span>
                <span className="block text-[9px] text-white/60">{featured.year}</span>
              </span>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                {featured.tag} · {featured.city}
              </p>
              <h3 className="mt-3 max-w-md text-4xl font-black leading-[0.98] tracking-tighter sm:text-5xl">{featured.title}</h3>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">{featured.description}</p>

              <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/80">
                <li className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{featured.venue}</li>
                <li className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{featured.time}</li>
                <li className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" />{featured.categories.join(' / ')}</li>
              </ul>

              <div className="mt-6 flex items-end justify-between border-t border-white/15 pt-5">
                <div>
                  <p className="text-[10px] text-white/60">{labels.ticketsFrom}</p>
                  <p className="text-2xl font-black">{featured.priceLabel}</p>
                  <p className={`mt-1 text-[11px] font-semibold ${featured.soldOut ? 'text-red-300' : 'text-emerald-300'}`}>
                    {featured.soldOut ? labels.soldOut : featured.leftLabel}
                  </p>
                </div>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink transition duration-300 group-hover:rotate-45 group-hover:bg-primary group-hover:text-white">
                  <ArrowUpRight className="h-5 w-5" />
                </span>
              </div>
            </div>
          </Link>

          {/* Side cards */}
          <div className="flex flex-col gap-5">
            {rest.map((e) => (
              <Link
                key={e.id}
                href={e.href}
                className="group flex min-h-[220px] flex-1 overflow-hidden rounded-[1.75rem] bg-white p-2 shadow-sm ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-primary">
                    {e.tag} / {e.dayMonth}
                  </p>
                  <h3 className="mt-2 text-xl font-black leading-tight tracking-tight text-ink">{e.title}</h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{e.description}</p>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <p className="text-[11px] leading-snug text-slate-500">
                      {e.venue}
                      <br />
                      {e.time}
                    </p>
                    <div className="text-right">
                      <p className="text-sm font-black text-ink">{e.priceLabel}</p>
                      <p className={`text-[10px] font-semibold ${e.soldOut ? 'text-red-500' : 'text-emerald-600'}`}>
                        {e.soldOut ? labels.soldOut : e.leftLabel}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="relative w-[38%] shrink-0 overflow-hidden rounded-[1.3rem]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.bannerUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                  />
                  <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink shadow transition group-hover:rotate-45 group-hover:bg-primary group-hover:text-white">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
