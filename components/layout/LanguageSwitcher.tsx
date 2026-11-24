'use client'

import { usePathname, useRouter } from 'next/navigation'
import { locales, LOCALE_COOKIE, type AppLocale } from '@/i18n/routing'

/**
 * RU / KY / EN switcher. Keeps the current page, swaps the first path segment
 * and remembers the choice in a cookie (spec section 17: persist language).
 */
export function LanguageSwitcher({
  current,
  label,
  tone = 'dark',
}: {
  current: AppLocale
  label: string
  tone?: 'light' | 'dark'
}) {
  const pathname = usePathname()
  const router = useRouter()

  function switchTo(next: AppLocale) {
    if (next === current) return
    try {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    } catch {
      /* cookies may be blocked; navigation still works */
    }
    const parts = pathname.split('/')
    parts[1] = next
    router.push(parts.join('/') || `/${next}`)
  }

  const dark = tone === 'dark'
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-center gap-0.5 rounded-full p-1 text-[11px] font-bold ${dark ? 'bg-white/5' : 'bg-slate-100'}`}
    >
      {locales.map((l) => {
        const active = l === current
        return (
          <button
            key={l}
            type="button"
            onClick={() => switchTo(l)}
            aria-current={active ? 'true' : undefined}
            className={`h-7 min-w-7 rounded-full px-2 transition ${
              active
                ? dark
                  ? 'bg-white/15 text-white'
                  : 'bg-white text-slate-900 shadow'
                : dark
                  ? 'text-white/50 hover:text-white'
                  : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {l.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
