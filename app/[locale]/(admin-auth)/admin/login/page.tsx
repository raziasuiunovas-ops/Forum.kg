import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isAppLocale } from '@/i18n/routing'
import { AdminLogin } from '@/components/admin/AdminLogin'

export const metadata: Metadata = { title: 'Вход в админ-панель — FORUM.KG', robots: { index: false, follow: false } }

export default async function AdminLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  return <AdminLogin locale={locale} />
}
