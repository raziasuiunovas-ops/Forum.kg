import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isAppLocale } from '@/i18n/routing'
import { loadMessages } from '@/lib/i18n/server'
import type { Messages } from '@/lib/i18n/client'
import { AccountClient } from '@/components/account/AccountClient'
import { pageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) return {}
  return pageMetadata(locale, 'account', '/account')
}

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const messages = (await loadMessages(locale)).account as Messages

  return (
    <div className="min-h-screen bg-surface pb-24 pt-32 sm:pt-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <AccountClient locale={locale} messages={messages} />
      </div>
    </div>
  )
}
