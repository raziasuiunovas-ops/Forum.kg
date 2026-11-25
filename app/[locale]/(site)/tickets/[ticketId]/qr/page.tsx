import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { isAppLocale } from '@/i18n/routing'
import { TicketQRPage } from '@/components/tickets/TicketQRPage'

export const metadata: Metadata = {
  title: 'QR-код билета | FORUM.KG',
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; ticketId: string }>
}) {
  const { locale, ticketId } = await params
  if (!isAppLocale(locale)) notFound()

  return (
    <Suspense fallback={null}>
      <TicketQRPage locale={locale} ticketId={ticketId} />
    </Suspense>
  )
}
