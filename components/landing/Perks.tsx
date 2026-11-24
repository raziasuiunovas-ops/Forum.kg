import { CreditCard, QrCode, Send } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'

export async function Perks({ locale }: { locale: AppLocale }) {
  const t = await getT(locale, 'perks')
  const items = [
    { Icon: QrCode, key: 'qr' },
    { Icon: CreditCard, key: 'payment' },
    { Icon: Send, key: 'telegram' },
  ] as const

  return (
    <div className="border-y border-primary/10 bg-[#e9efff]">
      <ul className="mx-auto grid max-w-6xl divide-y divide-primary/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map(({ Icon, key }) => (
          <li key={key} className="flex items-center gap-4 px-6 py-6 sm:px-8">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
              <Icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-extrabold text-ink">{t(`${key}.title`)}</span>
              <span className="block text-xs text-slate-500">{t(`${key}.text`)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
