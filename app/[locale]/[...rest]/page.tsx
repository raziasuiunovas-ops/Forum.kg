import { notFound } from 'next/navigation'

// Any unknown URL under /ru|/ky|/en renders the localized 404 (app/[locale]/not-found.tsx).
export default function CatchAll() {
  notFound()
}
