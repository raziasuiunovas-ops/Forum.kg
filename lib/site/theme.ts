// Temporary stub - will be replaced by frontend-v4 merge
export function buildThemeStyle(colors: {
  primary: string
  accent: string
}): Record<string, string> {
  return {
    '--color-primary': colors.primary,
    '--color-accent': colors.accent,
  }
}
