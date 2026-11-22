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
  tone = 'light',
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

  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 text-sm">
      {locales.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className={tone === 'dark' ? 'text-white/40' : 'text-slate-300'}>/</span>}
          <button
            type="button"
            onClick={() => switchTo(l)}
            aria-current={l === current ? 'true' : undefined}
            className={
              l === current
                ? tone === 'dark'
                  ? 'font-bold text-white'
                  : 'font-bold text-primary'
                : tone === 'dark'
                  ? 'text-white/60 hover:text-white'
                  : 'text-slate-500 hover:text-slate-900'
            }
          >
            {l.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  )
}
