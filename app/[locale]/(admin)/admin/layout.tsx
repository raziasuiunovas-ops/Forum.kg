import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isAppLocale } from '@/i18n/routing'
import { AdminShell } from '@/components/admin/AdminShell'

export const metadata: Metadata = { title: 'Админ-панель — FORUM.KG', robots: { index: false, follow: false } }

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  return <AdminShell locale={locale}>{children}</AdminShell>
}
