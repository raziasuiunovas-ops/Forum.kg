import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { defaultLocale, isAppLocale, LOCALE_COOKIE } from '@/i18n/routing'

// "/" -> remembered language, otherwise Russian (spec: RU is the default).
export default async function RootRedirect() {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value
  redirect(`/${isAppLocale(saved) ? saved : defaultLocale}`)
}
