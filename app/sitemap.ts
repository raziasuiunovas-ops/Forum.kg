import type { MetadataRoute } from 'next'
import { locales } from '@/i18n/routing'
import { getUpcomingForums } from '@/lib/forums'
import { siteUrl } from '@/lib/seo'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  // One URL per language, each listing its RU / KY / EN alternates (hreflang).
  const entry = (path: string, priority: number): MetadataRoute.Sitemap =>
    locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority,
      alternates: { languages: Object.fromEntries(locales.map((l) => [l, `${base}/${l}${path}`])) },
    }))

  const forums = await getUpcomingForums('ru').catch(() => [])
  return [
    ...entry('', 1),
    ...entry('/forums', 0.9),
    ...forums.filter((f) => !f.isDemo).flatMap((f) => entry(`/forums/${f.slug}`, 0.8)),
  ]
}
