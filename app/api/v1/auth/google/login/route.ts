/**
 * GET /api/v1/auth/google/login?next=/ru/account&locale=ru
 * Starts Google sign-in: sets a short-lived HttpOnly cookie with state + PKCE verifier and redirects to Google.
 * If Google is not configured the browser is sent back to the login page with ?error=google_not_configured.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  OAUTH_COOKIE, OAUTH_COOKIE_MAX_AGE, buildAuthUrl, createPkce, createState, readGoogleConfig, safeNext,
} from '@/lib/auth/google-oauth'

const LOCALES = ['ru', 'ky', 'en']

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const locale = LOCALES.includes(url.searchParams.get('locale') ?? '') ? url.searchParams.get('locale')! : 'ru'
  const back = (error: string) => NextResponse.redirect(new URL(`/${locale}/login?error=${error}`, url.origin))

  const cfg = readGoogleConfig(process.env, url.origin)

  // Diagnostics: /api/v1/auth/google/login?debug=1 shows what is sent to Google (public values only, never the secret).
  if (url.searchParams.get('debug') === '1') {
    return NextResponse.json({
      configured: !!cfg,
      redirectUri: cfg?.redirectUri ?? null,
      clientId: cfg?.clientId ?? null,
      requestOrigin: url.origin,
      hint: 'Authorized redirect URIs in Google Cloud Console must contain redirectUri EXACTLY, in the OAuth client with this clientId.',
    })
  }

  if (!cfg) return back('google_not_configured')

  const state = createState()
  const { verifier, challenge } = createPkce()
  const next = safeNext(url.searchParams.get('next'), `/${locale}/account`)

  const res = NextResponse.redirect(buildAuthUrl(cfg, state, challenge))
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, next, locale }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Google redirects back with a cross-site top-level GET; Strict would drop the cookie
    path: '/api/v1/auth/google',
    maxAge: OAUTH_COOKIE_MAX_AGE,
  })
  return res
}
