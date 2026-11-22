import Link from 'next/link'
import type { AppLocale } from '@/i18n/routing'

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" className={className} aria-hidden="true">
      <polygon points="0,40 18,8 30,28 36,18 48,40" fill="hsl(var(--primary))" />
      <polygon points="18,8 24,18 18,15 12,18" fill="#fff" opacity=".9" />
      <polygon points="14,40 30,16 40,40" fill="hsl(var(--primary))" opacity=".7" />
    </svg>
  )
}

export function Logo({
  locale,
  name,
  logoUrl,
  light = false,
}: {
  locale: AppLocale
  name: string
  logoUrl?: string | null
  light?: boolean
}) {
  return (
    <Link href={`/${locale}`} className="flex items-center gap-2" aria-label={name}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-8 w-auto" />
      ) : (
        <LogoMark className={light ? 'h-8 w-8 [&_polygon]:fill-white' : 'h-8 w-8'} />
      )}
      <span className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>
        {name}
      </span>
    </Link>
  )
}
