/**
 * Root page that redirects / to /[locale] structure.
 * Actual landing page is in app/[locale]/page.tsx
 */
import { redirect } from 'next/navigation'
import { defaultLocale } from '@/i18n/routing'

export default function RootPage() {
  // Redirect root to default locale
  redirect(`/${defaultLocale}`)
}
