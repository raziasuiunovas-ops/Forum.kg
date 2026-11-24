import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'

export async function Marquee({ locale }: { locale: AppLocale }) {
  const t = await getT(locale, 'marquee')
  const items = ['1', '2', '3', '4'].map((k) => t(k))

  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((text) => (
        <li key={text} className="flex items-center whitespace-nowrap">
          <span className="px-8 text-[11px] font-extrabold uppercase tracking-[0.22em] text-white sm:text-xs">{text}</span>
          <span className="text-white/70">✳</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="relative z-10 overflow-hidden bg-gradient-to-r from-primary via-[#6a4dff] to-[#8b5cf6] py-4">
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        {row(false)}
        {row(true)}
        {row(true)}
        {row(true)}
      </div>
    </div>
  )
}
