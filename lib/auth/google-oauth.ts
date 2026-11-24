/**
 * Google OAuth 2.0 (authorization code + PKCE) helpers. Pure functions - no framework imports -
 * so they can be unit-tested.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

export const OAUTH_COOKIE = 'g_oauth'
export const OAUTH_COOKIE_MAX_AGE = 10 * 60

export interface GoogleConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Token endpoint; overridable only for local end-to-end tests. */
  tokenUrl: string
}

/** Returns null when Google sign-in is not configured. */
export function readGoogleConfig(
  env: Readonly<Record<string, string | undefined>>,
  origin: string,
): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  const base = (env.NEXT_PUBLIC_APP_URL?.trim() || origin).replace(/\/$/, '')
  return {
    clientId,
    clientSecret,
    redirectUri: env.GOOGLE_REDIRECT_URI?.trim() || `${base}/api/v1/auth/google/callback`,
    tokenUrl: env.GOOGLE_TOKEN_URL?.trim() || GOOGLE_TOKEN_URL,
  }
}

const b64url = (buf: Buffer) => buf.toString('base64url')

export function createPkce() {
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export const createState = () => b64url(randomBytes(24))

/** Constant-time string comparison (state check). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Only same-site relative paths are allowed as a post-login redirect (prevents open redirects). */
export function safeNext(raw: string | null | undefined, fallback: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback
  return raw
}

export function buildAuthUrl(cfg: GoogleConfig, state: string, challenge: string): string {
  const u = new URL(GOOGLE_AUTH_URL)
  u.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return u.toString()
}

export interface GoogleClaims {
  sub: string
  email: string
  emailVerified: boolean
  givenName: string | null
  familyName: string | null
}

/**
 * Reads and validates the id_token received DIRECTLY from Google's token endpoint over TLS
 * (OIDC Core 3.1.3.7 allows trusting TLS instead of verifying the signature in this case).
 * Checks issuer, audience, expiry and that the email is verified.
 */
export function parseIdToken(idToken: string, clientId: string, now = Date.now()): GoogleClaims {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('INVALID_ID_TOKEN')
  const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
  if (!GOOGLE_ISSUERS.includes(String(p.iss))) throw new Error('BAD_ISSUER')
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud]
  if (!aud.includes(clientId)) throw new Error('BAD_AUDIENCE')
  if (typeof p.exp !== 'number' || p.exp * 1000 < now) throw new Error('TOKEN_EXPIRED')
  if (typeof p.sub !== 'string' || !p.sub) throw new Error('NO_SUBJECT')
  if (typeof p.email !== 'string' || !p.email) throw new Error('NO_EMAIL')
  if (p.email_verified !== true) throw new Error('EMAIL_NOT_VERIFIED')
  return {
    sub: p.sub,
    email: p.email.trim().toLowerCase(),
    emailVerified: true,
    givenName: typeof p.given_name === 'string' ? p.given_name.slice(0, 100) : null,
    familyName: typeof p.family_name === 'string' ? p.family_name.slice(0, 100) : null,
  }
}
