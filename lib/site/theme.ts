// Temporary stub - will be replaced by frontend-v4 merge
export function buildThemeStyle(colors: {
  primary: string
  accent: string
  footer: string
}): React.CSSProperties {
  return {
    '--color-primary': colors.primary,
    '--color-accent': colors.accent,
    '--color-footer': colors.footer,
  } as React.CSSProperties
}
