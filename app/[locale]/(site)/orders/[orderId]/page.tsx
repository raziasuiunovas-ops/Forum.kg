import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { isAppLocale } from '@/i18n/routing'
import { loadMessages } from '@/lib/i18n/server'
import type { Messages } from '@/lib/i18n/client'
import { PaymentResult } from '@/components/orders/PaymentResult'

export const metadata: Metadata = { title: 'FORUM.KG', robots: { index: false } }

export default async function Page({ params }: { params: Promise<{ locale: string; orderId: string }> }) {
  const { locale, orderId } = await params
  if (!isAppLocale(locale)) notFound()
  const messages = (await loadMessages(locale)).payment as Messages

  return (
    <div className="min-h-screen bg-surface px-5 pb-24 pt-36">
      <Suspense fallback={null}>
        <PaymentResult locale={locale} messages={messages} orderId={orderId} />
      </Suspense>
    </div>
  )
}
