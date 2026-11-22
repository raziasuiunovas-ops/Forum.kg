import { ArrowRight, CalendarDays, CreditCard, QrCode, Ticket } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'

export async function HowItWorks({ locale }: { locale: AppLocale }) {
  const t = await getT(locale, 'how')
  const steps = [
    { n: 1, Icon: CalendarDays },
    { n: 2, Icon: Ticket },
    { n: 3, Icon: CreditCard },
    { n: 4, Icon: QrCode },
  ]

  return (
    <section id="how" className="bg-gradient-to-b from-white to-slate-50 py-14">
      <div className="container px-4 sm:px-8">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('title')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('subtitle')}</p>

        <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
          {steps.map(({ n, Icon }, idx) => (
            <li key={n} className="contents">
              <div className="relative rounded-2xl border border-border bg-white p-5 shadow-sm">
                <span className="absolute left-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {n}
                </span>
                <div className="flex h-24 items-center justify-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-9 w-9" />
                  </span>
                </div>
                <h3 className="mt-2 text-base font-bold text-slate-900">{t(`steps.${n}.title`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{t(`steps.${n}.text`)}</p>
              </div>
              {idx < steps.length - 1 && (
                <ArrowRight className="hidden h-5 w-5 self-center text-slate-400 lg:block" aria-hidden />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
