import Link from 'next/link'
import type { AppLocale } from '@/i18n/routing'

export function LogoMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" className={className} aria-hidden="true">
      <polygon points="0,40 18,8 30,28 36,18 48,40" fill="currentColor" />
      <polygon points="14,40 30,16 40,40" fill="currentColor" opacity=".55" />
    </svg>
  )
}

export function Logo({
  locale,
  name,
  logoUrl,
  dark = true,
}: {
  locale: AppLocale
  name: string
  logoUrl?: string | null
  dark?: boolean
}) {
  const [main, ext] = name.split('.')
  return (
    <Link href={`/${locale}`} className="flex items-center gap-2" aria-label={name}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-7 w-auto" />
      ) : (
        <LogoMark className="h-6 w-6 text-primary" />
      )}
      <span className={`text-lg font-extrabold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>
        {main}
        {ext !== undefined && <span className={dark ? 'text-white' : 'text-ink'}>.{ext}</span>}
      </span>
    </Link>
  )
}
