/**
 * GET  /api/v1/admin/settings  — public read (used by getSiteSettings on every page)
 * PUT  /api/v1/admin/settings  — admin write (requires auth)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireManager } from '@/lib/auth/middleware'
import { revalidateTag } from 'next/cache'

const SITE_ID = 'main'

const DEFAULT = {
  displayName: 'FORUM.KG',
  logoUrl: null as string | null,
  heroImageUrl: '/images/hero-forum.webp',
  primaryColorHex: '#3B5BFF',
  accentColorHex: '#7C5CFF',
  footerColorHex: '#070B24',
  contactEmail: 'info@forum.kg',
  contactPhone: '+996 700 123 456',
  socialLinks: [] as { platform: string; url: string }[],
}

async function getOrCreateSettings() {
  let settings = await prisma.siteSettings.findUnique({
    where: { id: SITE_ID },
    include: { translations: true, socialLinks: { orderBy: { sortOrder: 'asc' } } },
  })

  if (!settings) {
    settings = await prisma.siteSettings.create({
      data: {
        id: SITE_ID,
        displayName: DEFAULT.displayName,
        primaryColorHex: DEFAULT.primaryColorHex,
        accentColorHex: DEFAULT.accentColorHex,
        footerColorHex: DEFAULT.footerColorHex,
        contactEmail: DEFAULT.contactEmail,
        contactPhone: DEFAULT.contactPhone,
      },
      include: { translations: true, socialLinks: { orderBy: { sortOrder: 'asc' } } },
    })
  }

  return settings
}

export async function GET() {
  try {
    const settings = await getOrCreateSettings()
    return NextResponse.json({
      displayName: settings.displayName,
      logoUrl: settings.logoUrl ?? null,
      heroImageUrl: settings.heroImageUrl ?? DEFAULT.heroImageUrl,
      primaryColorHex: settings.primaryColorHex,
      accentColorHex: settings.accentColorHex,
      footerColorHex: (settings as typeof settings & { footerColorHex?: string }).footerColorHex ?? DEFAULT.footerColorHex,
      contactEmail: settings.contactEmail ?? DEFAULT.contactEmail,
      contactPhone: settings.contactPhone ?? DEFAULT.contactPhone,
      translations: settings.translations,
      socialLinks: settings.socialLinks.map((l) => ({ platform: l.platform, url: l.url })),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (error) {
    console.error('[Settings GET]', error)
    return NextResponse.json(DEFAULT)
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireManager(request)
  if ('headers' in authResult) return authResult

  try {
    const body = await request.json()
    const {
      displayName, logoUrl, heroImageUrl,
      primaryColorHex, accentColorHex, footerColorHex,
      contactEmail, contactPhone,
      translations = [], socialLinks = [],
    } = body

    // Upsert main settings
    await prisma.siteSettings.upsert({
      where: { id: SITE_ID },
      create: {
        id: SITE_ID,
        displayName: displayName ?? DEFAULT.displayName,
        logoUrl: logoUrl ?? null,
        heroImageUrl: heroImageUrl ?? null,
        primaryColorHex: primaryColorHex ?? DEFAULT.primaryColorHex,
        accentColorHex: accentColorHex ?? DEFAULT.accentColorHex,
        footerColorHex: footerColorHex ?? DEFAULT.footerColorHex,
        contactEmail: contactEmail ?? null,
        contactPhone: contactPhone ?? null,
      },
      update: {
        displayName: displayName ?? DEFAULT.displayName,
        logoUrl: logoUrl ?? null,
        heroImageUrl: heroImageUrl ?? null,
        primaryColorHex: primaryColorHex ?? DEFAULT.primaryColorHex,
        accentColorHex: accentColorHex ?? DEFAULT.accentColorHex,
        footerColorHex: footerColorHex ?? DEFAULT.footerColorHex,
        contactEmail: contactEmail ?? null,
        contactPhone: contactPhone ?? null,
      },
    })

    // Upsert translations
    for (const tr of translations) {
      if (!tr.locale) continue
      await prisma.siteSettingsTranslation.upsert({
        where: { siteId_locale: { siteId: SITE_ID, locale: tr.locale.toUpperCase() } },
        create: {
          siteId: SITE_ID,
          locale: tr.locale.toUpperCase(),
          heroTitle: tr.heroTitle ?? null,
          heroSubtitle: tr.heroSubtitle ?? null,
          aboutText: tr.aboutText ?? null,
        },
        update: {
          heroTitle: tr.heroTitle ?? null,
          heroSubtitle: tr.heroSubtitle ?? null,
          aboutText: tr.aboutText ?? null,
        },
      })
    }

    // Replace social links
    await prisma.socialLink.deleteMany({ where: { siteId: SITE_ID } })
    if (socialLinks.length > 0) {
      await prisma.socialLink.createMany({
        data: socialLinks.map((l: { platform: string; url: string }, i: number) => ({
          siteId: SITE_ID,
          platform: l.platform,
          url: l.url,
          sortOrder: i,
        })),
      })
    }

    // Invalidate Next.js cache so landing reloads settings
    revalidateTag('site-settings')

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Settings PUT]', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
