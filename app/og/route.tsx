/**
 * GET /og?l=ru|ky|en[&slug=forum-slug]
 * 1200x630 Open Graph preview image (Telegram, WhatsApp, Facebook, X, LinkedIn...).
 * Text is localized; a forum slug renders that forum's title, date, venue and price.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { isAppLocale, type AppLocale } from '@/i18n/routing'
import { getForumBySlug } from '@/lib/forums'
import { formatMoneyMinor } from '@/lib/format'
import { SEO, clip, formatForumDate } from '@/lib/seo'

export const runtime = 'nodejs'

const SIZE = { width: 1200, height: 630 }
let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 800; style: 'normal' }[]> | null = null

function loadFonts() {
  fonts ??= Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/Inter-Medium.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/Inter-ExtraBold.ttf')),
  ]).then(([medium, bold]) => [
    { name: 'Inter', data: medium, weight: 500 as const, style: 'normal' as const },
    { name: 'Inter', data: bold, weight: 800 as const, style: 'normal' as const },
  ])
  return fonts
}

function Mark() {
  return (
    <svg width="54" height="45" viewBox="0 0 48 40">
      <polygon points="0,40 18,8 30,28 36,18 48,40" fill="#4F6BFF" />
      <polygon points="14,40 30,16 40,40" fill="#8EA2FF" opacity="0.7" />
    </svg>
  )
}

function Frame({ children, locale }: { children: React.ReactNode; locale: AppLocale }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 72px',
        fontFamily: 'Inter',
        color: '#FFFFFF',
        backgroundColor: '#070B24',
        backgroundImage:
          'radial-gradient(circle at 88% 12%, rgba(91,108,255,0.55) 0%, rgba(7,11,36,0) 45%), radial-gradient(circle at 8% 100%, rgba(139,92,246,0.35) 0%, rgba(7,11,36,0) 40%), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
        backgroundSize: '100% 100%, 100% 100%, 60px 60px, 60px 60px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Mark />
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
            <span>FORUM</span>
            <span style={{ color: '#6F86FF' }}>.KG</span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.08)',
            fontSize: 22,
            fontWeight: 800,
          }}
        >
          {(['ru', 'ky', 'en'] as const).map((l) => (
            <span
              key={l}
              style={{
                padding: '6px 16px',
                borderRadius: 999,
                color: l === locale ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
                backgroundColor: l === locale ? '#4F6BFF' : 'transparent',
              }}
            >
              {l.toUpperCase()}
            </span>
          ))}
        </div>
      </div>
      {children}
    </div>
  )
}

function homeImage(locale: AppLocale) {
  const t = SEO[locale]
  const words = t.tagline.split(' ')
  return (
    <Frame locale={locale}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 24, rowGap: 6, maxWidth: 1056, fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1.05 }}>
          {words.map((w, i) => (
            <span key={w} style={{ color: i === words.length - 1 ? '#7D93FF' : '#FFFFFF' }}>
              {w}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 30, maxWidth: 1000, fontSize: 30, fontWeight: 500, lineHeight: 1.35, color: 'rgba(255,255,255,0.78)' }}>
          {clip(t.home.description, 130)}
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 24, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>forum.kg</div>
    </Frame>
  )
}

function forumImage(
  locale: AppLocale,
  f: { title: string; startsAt: string; timeZone: string; venueName: string; minPriceMinor: number; soldOut: boolean },
) {
  const t = SEO[locale]
  const date = formatForumDate(f.startsAt, locale, f.timeZone)
  const currency = locale === 'en' ? 'KGS' : 'сом'
  const price = Number.isFinite(f.minPriceMinor) ? t.priceFrom(`${formatMoneyMinor(f.minPriceMinor, locale)} ${currency}`) : ''
  const size = f.title.length > 70 ? 54 : f.title.length > 40 ? 66 : 80
  return (
    <Frame locale={locale}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: size, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, maxWidth: 1050 }}>
          {clip(f.title, 110)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 36, fontSize: 30, fontWeight: 500 }}>
          <span style={{ display: 'flex', padding: '12px 24px', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)' }}>{date}</span>
          {f.venueName && (
            <span style={{ display: 'flex', padding: '12px 24px', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)' }}>
              {clip(f.venueName, 40)}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>{t.tagline}</div>
        {price && !f.soldOut && (
          <div style={{ display: 'flex', padding: '16px 30px', borderRadius: 999, backgroundColor: '#4F6BFF', fontSize: 30, fontWeight: 800 }}>{price}</div>
        )}
      </div>
    </Frame>
  )
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const l = url.searchParams.get('l')
  const locale: AppLocale = isAppLocale(l) ? l : 'ru'
  const slug = url.searchParams.get('slug')

  const forum = slug ? await getForumBySlug(locale, slug).catch(() => null) : null
  const element = forum ? forumImage(locale, forum) : homeImage(locale)

  return new ImageResponse(element, {
    ...SIZE,
    fonts: await loadFonts(),
    headers: {
      'Cache-Control': forum
        ? 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400'
        : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
