import type { CSSProperties } from 'react'

/** "#2563EB" -> "221 83% 53%" (format used by the `hsl(var(--x))` Tailwind tokens). */
export function hexToHslTriplet(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/** Readable text colour (white/near-black) for a given background hex. */
export function foregroundFor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '0 0% 100%'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '222 47% 11%' : '0 0% 100%'
}

/**
 * Turns admin-editable colours into CSS variables. Invalid values are ignored,
 * so the defaults from globals.css stay in effect.
 */
export function buildThemeStyle(colors: {
  primary: string
  accent: string
  footer: string
}): CSSProperties {
  const style: Record<string, string> = {}
  const primary = hexToHslTriplet(colors.primary)
  const accent = hexToHslTriplet(colors.accent)
  const footer = hexToHslTriplet(colors.footer)
  if (primary) {
    style['--primary'] = primary
    style['--ring'] = primary
    style['--primary-foreground'] = foregroundFor(colors.primary)
  }
  if (accent) style['--brand-accent'] = accent
  if (footer) style['--footer'] = footer
  return style as CSSProperties
}
