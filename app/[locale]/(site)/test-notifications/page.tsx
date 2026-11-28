import { notFound } from 'next/navigation'
import { isAppLocale } from '@/i18n/routing'
import { TestNotificationsClient } from '@/components/test/TestNotificationsClient'

export default async function TestNotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()

  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  return (
    <div className="min-h-screen bg-surface pb-24 pt-32 sm:pt-36">
      <div className="mx-auto max-w-4xl px-5 sm:px-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200/70">
          <h1 className="text-3xl font-black tracking-tight text-ink">
            🧪 Тестирование уведомлений
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Проверка работы Web Push уведомлений
          </p>

          <TestNotificationsClient locale={locale} />
        </div>
      </div>
    </div>
  )
}
