// Root layout is intentionally minimal: <html>/<body> live in app/[locale]/layout.tsx
// so that the lang attribute follows the active locale (next-intl pattern).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children
}
