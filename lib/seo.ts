/**
 * SEO / Open Graph for all public pages: localized titles and descriptions (RU / KY / EN),
 * canonical + hreflang alternates, Open Graph and Twitter cards with a generated preview image (/og).
 */
import type { Metadata } from 'next'
import { locales, type AppLocale } from '@/i18n/routing'

export const SITE_NAME = 'FORUM.KG'

/** Public origin of the site (used for absolute og:url / og:image). */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    'http://localhost:3000'
  return raw.replace(/\/$/, '')
}

const OG_LOCALE: Record<AppLocale, string> = { ru: 'ru_RU', ky: 'ky_KG', en: 'en_US' }

export type SeoPage = 'home' | 'forums' | 'login' | 'register' | 'account' | 'checkout' | 'payment' | 'order' | 'forgotPassword' | 'resetPassword'

interface SeoTexts {
  tagline: string
  home: { title: string; description: string }
  forums: { title: string; description: string }
  login: { title: string; description: string }
  register: { title: string; description: string }
  account: { title: string; description: string }
  checkout: { title: string; description: string }
  payment: { title: string; description: string }
  order: { title: string; description: string }
  forgotPassword: { title: string; description: string }
  resetPassword: { title: string; description: string }
  /** Forum page: description when the forum has no short description */
  forumFallback: (when: string, venue: string) => string
  priceFrom: (price: string) => string
  imageAlt: string
}

export const SEO: Record<AppLocale, SeoTexts> = {
  ru: {
    tagline: 'Люди. Идеи. Будущее.',
    home: {
      title: 'FORUM.KG — форумы и конференции Кыргызстана',
      description:
        'Афиша форумов, конференций и деловых событий Кыргызстана. Покупайте билеты онлайн, получайте QR-билет и проходите на вход за секунды.',
    },
    forums: {
      title: 'Афиша форумов и событий',
      description:
        'Все форумы, конференции и бизнес-события Кыргызстана в одном месте. Выбирайте событие и оформляйте билет онлайн за пару минут.',
    },
    login: { title: 'Вход и регистрация', description: 'Войдите в FORUM.KG, чтобы покупать билеты, хранить QR-билеты и следить за заказами.' },
    register: { title: 'Регистрация', description: 'Создайте аккаунт FORUM.KG: билеты с QR-кодом, история заказов и уведомления о новых событиях.' },
    account: { title: 'Личный кабинет', description: 'Ваши билеты, заказы и настройки профиля на FORUM.KG.' },
    checkout: { title: 'Оформление билета', description: 'Оформление и оплата билета на FORUM.KG.' },
    payment: { title: 'Результат оплаты', description: 'Статус оплаты заказа на FORUM.KG.' },
    order: { title: 'Заказ', description: 'Информация о заказе на FORUM.KG.' },
    forgotPassword: { title: 'Восстановление пароля', description: 'Восстановите доступ к аккаунту FORUM.KG.' },
    resetPassword: { title: 'Новый пароль', description: 'Создайте новый пароль для аккаунта FORUM.KG.' },
    forumFallback: (when, venue) => `${when}${venue ? ` · ${venue}` : ''}. Билеты онлайн на FORUM.KG — QR-билет сразу после оплаты.`,
    priceFrom: (p) => `Билеты от ${p}`,
    imageAlt: 'FORUM.KG — форумы и конференции Кыргызстана',
  },
  ky: {
    tagline: 'Адамдар. Идеялар. Келечек.',
    home: {
      title: 'FORUM.KG — Кыргызстандын форумдары жана конференциялары',
      description:
        'Кыргызстандагы форумдардын, конференциялардын жана бизнес-иш-чаралардын афишасы. Билетти онлайн сатып алып, QR-билет менен кирүүдөн бир нече секундда өтүңүз.',
    },
    forums: {
      title: 'Форумдардын жана иш-чаралардын афишасы',
      description:
        'Кыргызстандын бардык форумдары, конференциялары жана бизнес-иш-чаралары бир жерде. Иш-чараны тандап, билетти онлайн бир нече мүнөттө алыңыз.',
    },
    login: { title: 'Кирүү жана катталуу', description: 'Билет сатып алуу, QR-билеттерди сактоо жана буйрутмаларды көзөмөлдөө үчүн FORUM.KG сайтына кириңиз.' },
    register: { title: 'Катталуу', description: 'FORUM.KG аккаунтун түзүңүз: QR-коддуу билеттер, буйрутмалардын тарыхы жана жаңы иш-чаралар тууралуу билдирмелер.' },
    account: { title: 'Жеке кабинет', description: 'FORUM.KG сайтындагы билеттериңиз, буйрутмаларыңыз жана профиль жөндөөлөрү.' },
    checkout: { title: 'Билет тариздөө', description: 'FORUM.KG сайтында билетти тариздөө жана төлөө.' },
    payment: { title: 'Төлөмдүн жыйынтыгы', description: 'FORUM.KG сайтындагы буйрутманын төлөм абалы.' },
    order: { title: 'Буйрутма', description: 'FORUM.KG сайтындагы буйрутма тууралуу маалымат.' },
    forgotPassword: { title: 'Сырсөздү калыбына келтирүү', description: 'FORUM.KG аккаунтуна кирүүнү калыбына келтириңиз.' },
    resetPassword: { title: 'Жаңы сырсөз', description: 'FORUM.KG аккаунту үчүн жаңы сырсөз түзүңүз.' },
    forumFallback: (when, venue) => `${when}${venue ? ` · ${venue}` : ''}. FORUM.KG сайтында онлайн билеттер — төлөгөндөн кийин дароо QR-билет.`,
    priceFrom: (p) => `Билеттер ${p} баштап`,
    imageAlt: 'FORUM.KG — Кыргызстандын форумдары жана конференциялары',
  },
  en: {
    tagline: 'People. Ideas. Future.',
    home: {
      title: 'FORUM.KG — Forums and conferences in Kyrgyzstan',
      description:
        'Discover forums, conferences and business events in Kyrgyzstan. Buy tickets online, get a QR ticket and check in within seconds.',
    },
    forums: {
      title: 'Forums & events',
      description:
        'All forums, conferences and business events in Kyrgyzstan in one place. Pick an event and get your ticket online in a couple of minutes.',
    },
    login: { title: 'Sign in', description: 'Sign in to FORUM.KG to buy tickets, keep your QR tickets and track your orders.' },
    register: { title: 'Create an account', description: 'Create a FORUM.KG account: QR tickets, order history and alerts about new events.' },
    account: { title: 'My account', description: 'Your tickets, orders and profile settings on FORUM.KG.' },
    checkout: { title: 'Checkout', description: 'Get and pay for your ticket on FORUM.KG.' },
    payment: { title: 'Payment result', description: 'Payment status of your FORUM.KG order.' },
    order: { title: 'Order', description: 'Your FORUM.KG order details.' },
    forgotPassword: { title: 'Reset password', description: 'Restore access to your FORUM.KG account.' },
    resetPassword: { title: 'New password', description: 'Create a new password for your FORUM.KG account.' },
    forumFallback: (when, venue) => `${when}${venue ? ` · ${venue}` : ''}. Tickets online at FORUM.KG — QR ticket right after payment.`,
    priceFrom: (p) => `Tickets from ${p}`,
    imageAlt: 'FORUM.KG — Forums and conferences in Kyrgyzstan',
  },
}

/** Pages that must not appear in search results (personal or transactional). */
const PRIVATE: SeoPage[] = ['account', 'checkout', 'payment', 'order', 'forgotPassword', 'resetPassword']

export interface BuildMetadataInput {
  locale: AppLocale
  /** Path after the locale, e.g. "" for home, "/forums", "/forums/my-slug" */
  path: string
  title: string
  description: string
  /** Absolute or site-relative preview image; defaults to the generated /og image */
  image?: string
  imageAlt?: string
  type?: 'website' | 'article'
  noindex?: boolean
  /** Keep the title exactly as given (no " — FORUM.KG" suffix) */
  absoluteTitle?: boolean
}

export function buildMetadata(input: BuildMetadataInput): Metadata {
  const { locale, path, description, type = 'website', noindex = false } = input
  const base = siteUrl()
  const url = `${base}/${locale}${path}`
  const title = input.absoluteTitle || input.title.includes(SITE_NAME) ? input.title : `${input.title} — ${SITE_NAME}`
  
  // For home page, use static image; otherwise use /og route
  let image: string
  if (input.image) {
    image = input.image
  } else if (path === '') {
    // Home page: use static images
    const staticImages: Record<AppLocale, string> = {
      ru: '/opengraph-ru.jpg',
      ky: '/opengraph-kg.jpg',
      en: '/opengraph-en.jpg',
    }
    image = staticImages[locale]
  } else {
    // Other pages: use /og route
    image = `/og?l=${locale}`
  }
  
  const imageUrl = image.startsWith('http') ? image : `${base}${image}`
  const alt = input.imageAlt ?? title

  return {
    metadataBase: new URL(base),
    title: { absolute: title },
    description,
    applicationName: SITE_NAME,
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(locales.map((l) => [l, `${base}/${l}${path}`])),
        'x-default': `${base}/ru${path}`,
      },
    },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      title,
      description,
      locale: OG_LOCALE[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      images: [{ url: imageUrl, width: 1200, height: 630, alt, type: 'image/jpeg' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{ url: imageUrl, alt }],
    },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
  }
}

/** Metadata for a standard (non-forum) page. */
export function pageMetadata(locale: AppLocale, page: SeoPage, path: string): Metadata {
  const t = SEO[locale][page]
  return buildMetadata({
    locale,
    path,
    title: t.title,
    description: t.description,
    absoluteTitle: page === 'home',
    noindex: PRIVATE.includes(page),
    imageAlt: SEO[locale].imageAlt,
  })
}

/** "15 марта 2027" in the forum's time zone. */
export function formatForumDate(iso: string, locale: AppLocale, timeZone = 'Asia/Bishkek'): string {
  const tag = locale === 'ky' ? 'ky-KG' : locale === 'en' ? 'en-GB' : 'ru-RU'
  try {
    return new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

/** Trim to a social-card friendly length on a word boundary. */
export function clip(text: string, max = 200): string {
  const s = text.replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30))}…`
}
