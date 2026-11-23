import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import type { SiteSettingsView } from '@/lib/site/settings'
import { TiltCard } from '@/components/motion/TiltCard'
import { TicketCard } from './TicketCard'

const AVATARS = [
  ['╨Р', 'from-blue-500 to-indigo-500'],
  ['╨Ь', 'from-violet-500 to-fuchsia-500'],
  ['╨С', 'from-teal-400 to-cyan-500'],
  ['╨Ъ', 'from-purple-500 to-indigo-600'],
] as const

export async function Hero({ locale, settings }: { locale: AppLocale; settings: SiteSettingsView }) {
  const t = await getT(locale, 'hero')
  const lineClass =
    'block text-[clamp(3.2rem,11vw,8.2rem)] font-black uppercase leading-[0.88] tracking-tighter animate-fade-up'

  return (
    <section className="relative isolate overflow-hidden bg-footer pb-24 pt-32 text-white sm:pt-36">
      {/* background: grid, glows, orbits */}
      <div className="bg-grid absolute inset-0 -z-10" aria-hidden />
      <div className="absolute -right-32 top-10 -z-10 h-[34rem] w-[34rem] animate-glow rounded-full bg-primary/30 blur-[120px]" aria-hidden />
      <div className="absolute -left-40 bottom-0 -z-10 h-[26rem] w-[26rem] animate-glow rounded-full bg-violet-600/20 blur-[110px]" aria-hidden />
      <div className="absolute right-[-10%] top-[8%] -z-10 hidden h-[44rem] w-[44rem] animate-spin-slow rounded-full border border-white/[0.07] lg:block" aria-hidden>
        <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p
            className="flex items-center gap-2 text-[11px] font-bold tracking-[0.22em] text-white/70 animate-fade-up"
            style={{ animationDelay: '0ms' }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
            {t('eyebrow')}
          </p>

          <h1 className="mt-6">
            <span className={`${lineClass} text-white`} style={{ animationDelay: '80ms' }}>
              {t('line1')}.
            </span>
            <span className={`${lineClass} text-white`} style={{ animationDelay: '180ms' }}>
              {t('line2')}.
            </span>
            <span className={`${lineClass} text-outline !tracking-[-0.01em]`} style={{ animationDelay: '280ms' }}>
              {t('line3')}
              <span className="text-primary [-webkit-text-stroke:0]">.</span>
            </span>
          </h1>

          <p className="mt-7 max-w-md text-sm leading-relaxed text-white/60 animate-fade-up sm:text-base" style={{ animationDelay: '400ms' }}>
            {settings.heroSubtitle ?? t('subtitle')}
          </p>

          <div className="mt-8 flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: '500ms' }}>
            <a
              href="#events"
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-sm font-bold text-white shadow-[0_12px_36px_-8px_hsl(var(--primary))] transition hover:-translate-y-0.5 hover:brightness-110"
            >
              {t('ctaPrimary')}
              <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <Link
              href="#organizers"
              className="group inline-flex h-12 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              {t('ctaSecondary')}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-10 flex items-center gap-3 animate-fade-up" style={{ animationDelay: '600ms' }}>
            <div className="flex -space-x-2">
              {AVATARS.map(([ch, grad]) => (
                <span
                  key={ch}
                  className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${grad} text-xs font-bold ring-2 ring-footer`}
                >
                  {ch}
                </span>
              ))}
            </div>
            <div>
              <p className="text-xs font-bold">{t('communityTitle')}</p>
              <p className="text-[11px] text-white/50">{t('communityText')}</p>
            </div>
          </div>
        </div>

        {/* Visual: photo card + ticket + badge. Photo is editable in the Admin Panel (heroImageUrl). */}
        <div className="relative mx-auto w-full max-w-[460px] animate-fade-up" style={{ animationDelay: '250ms' }}>
          <svg className="absolute -left-10 top-1/3 h-6 w-6 animate-twinkle text-sky-300" viewBox="0 0 24 24" aria-hidden>
            <path fill="currentColor" d="M12 0c.8 6.4 5.6 11.2 12 12-6.4.8-11.2 5.6-12 12-.8-6.4-5.6-11.2-12-12 6.4-.8 11.2-5.6 12-12z" />
          </svg>
          <div className="animate-float">
            <TiltCard className="rotate-[4deg]">
              <div className="overflow-hidden rounded-[2rem] border border-white/15 bg-white/5 p-2 shadow-[0_40px_80px_-30px_hsl(var(--primary)/.7)] backdrop-blur">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={settings.heroImageUrl}
                  alt=""
                  width={800}
                  height={880}
                  fetchPriority="high"
                  className="aspect-[4/4.4] w-full rounded-[1.6rem] object-cover"
                />
              </div>
            </TiltCard>
          </div>

          <div className="absolute -bottom-8 -left-6 animate-float-rot sm:-left-14">
            <TicketCard label={t('ticketLabel')} title="Bishkek Digital Forum 2026" />
          </div>

          <div className="absolute -right-2 bottom-6 hidden items-center gap-2.5 rounded-2xl border border-white/10 bg-[#0e1540]/90 px-4 py-3 shadow-xl backdrop-blur sm:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/25 text-primary">
              <Check className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-xs font-bold">{t('badgeTitle')}</span>
              <span className="block text-[10px] text-white/55">{t('badgeText')}</span>
            </span>
          </div>
        </div>
      </div>

      <p className="absolute bottom-6 right-8 hidden text-[10px] font-bold tracking-[0.3em] text-white/35 lg:block">
        {t('discover')} / <span className="text-base text-white">01</span>
      </p>
    </section>
  )
}
