/**
 * GET /api/v1/auth/google/callback
 * Google redirects here with ?code&state. Exchanges the code (PKCE), creates or links the user,
 * starts a session and redirects to the page the user came from.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Locale, UserRole, UserStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { describeAuthError, startSession } from '@/lib/auth/email-auth'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'
import {
  OAUTH_COOKIE, parseIdToken, readGoogleConfig, safeEqual, safeNext,
} from '@/lib/auth/google-oauth'

const LOCALES = ['ru', 'ky', 'en']

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  let locale = 'ru'

  const fail = (error: string, reason: string) => {
    writeSecurityAuditEvent({ eventType: 'AUTH_FAILURE', result: 'denied', request, reason: `google_${reason}`, statusCode: 302 })
    const res = NextResponse.redirect(new URL(`/${locale}/login?error=${error}`, url.origin))
    res.cookies.delete({ name: OAUTH_COOKIE, path: '/api/v1/auth/google' })
    return res
  }

  try {
    const cfg = readGoogleConfig(process.env, url.origin)
    if (!cfg) return fail('google_not_configured', 'not_configured')

    const saved = request.cookies.get(OAUTH_COOKIE)?.value
    if (!saved) return fail('google_failed', 'missing_cookie')
    const { state, verifier, next, locale: loc } = JSON.parse(saved) as { state: string; verifier: string; next: string; locale: string }
    if (LOCALES.includes(loc)) locale = loc

    if (url.searchParams.get('error')) return fail('google_cancelled', 'user_cancelled')
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    if (!code || !returnedState || !safeEqual(returnedState, state)) return fail('google_failed', 'bad_state')

    // 1. Exchange the authorization code (server-to-server, uses the client secret + PKCE verifier)
    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!tokenRes.ok) {
      const errorText = await tokenRes.text().catch(() => 'could not read error')
      console.error('[Google OAuth Debug] Token error response:', errorText.slice(0, 500))
      return fail('google_failed', `token_${tokenRes.status}`)
    }
    const { id_token } = (await tokenRes.json()) as { id_token?: string }
    if (!id_token) return fail('google_failed', 'no_id_token')

    // 2. Validate the identity
    const claims = parseIdToken(id_token, cfg.clientId)

    // 3. Find or create the user
    let user = (await prisma.authIdentity.findUnique({
      where: { provider_providerSubject: { provider: 'GOOGLE', providerSubject: claims.sub } },
      include: { user: true },
    }))?.user ?? null

    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email: claims.email } })
      if (byEmail) {
        // An email+password account is not proof of email ownership (the email was never verified),
        // so it must not be taken over by a Google sign-in. The user signs in with the password instead.
        if (byEmail.passwordHash) return fail('google_account_exists', 'email_password_account')
        user = byEmail
        const { randomUUID } = await import('node:crypto')
        await prisma.authIdentity.create({
          data: { id: randomUUID(), userId: byEmail.id, provider: 'GOOGLE', providerSubject: claims.sub, providerEmail: claims.email },
        })
      } else {
        const { randomUUID } = await import('node:crypto')
        user = await prisma.user.create({
          data: {
            id: randomUUID(),
            email: claims.email,
            firstName: claims.givenName,
            lastName: claims.familyName,
            role: UserRole.USER,
            status: UserStatus.ACTIVE,
            preferredLocale: locale.toUpperCase() as Locale,
            updatedAt: new Date(),
            authIdentities: { create: { id: randomUUID(), provider: 'GOOGLE', providerSubject: claims.sub, providerEmail: claims.email } },
          },
        })
      }
    }

    if (user.status === UserStatus.SUSPENDED) return fail('google_suspended', 'suspended')

    // 4. Session + redirect
    await startSession(user, request)
    writeSecurityAuditEvent({ eventType: 'AUTH_SUCCESS', result: 'success', request, userId: user.id, reason: 'google_login', statusCode: 302 })

    const res = NextResponse.redirect(new URL(safeNext(next, `/${locale}/account`), url.origin))
    res.cookies.delete({ name: OAUTH_COOKIE, path: '/api/v1/auth/google' })
    return res
  } catch (e) {
    console.error('[Google OAuth Debug] EXCEPTION:', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
    if (e instanceof Error) console.error('[Google OAuth Debug] Stack:', e.stack?.slice(0, 500))
    describeAuthError(e, 'auth/google/callback')
    return fail('google_failed', 'exception')
  }
}
