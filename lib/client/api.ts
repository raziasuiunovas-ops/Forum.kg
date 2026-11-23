/**
 * Browser helper for calling the backend (/api/v1/*).
 * - Sends cookies (session is HttpOnly cookie based).
 * - Adds the CSRF token (X-CSRF-Token) to state-changing requests.
 */
export interface ApiResult<T = unknown> {
  ok: boolean
  status: number
  data: T | null
  /** Backend error code (e.g. INVALID_OTP) when ok === false */
  code?: string
  message?: string
  /** true when the server could not be reached at all */
  network?: boolean
}

let csrfToken: string | null = null

async function getCsrf(): Promise<string | null> {
  if (csrfToken) return csrfToken
  try {
    const res = await fetch('/api/v1/auth/csrf-token', { credentials: 'include' })
    if (!res.ok) return null
    csrfToken = (await res.json()).csrfToken ?? null
  } catch {
    return null
  }
  return csrfToken
}

export function resetCsrf() {
  csrfToken = null
}

export async function api<T = unknown>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
    body?: unknown
    csrf?: boolean
    headers?: Record<string, string>
  } = {},
): Promise<ApiResult<T>> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && opts.csrf) {
    const token = await getCsrf()
    if (token) headers['X-CSRF-Token'] = token
  }

  try {
    const res = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      /* empty body */
    }
    if (res.ok) return { ok: true, status: res.status, data: data as T }
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error
    return { ok: false, status: res.status, data: data as T, code: err?.code, message: err?.message }
  } catch {
    return { ok: false, status: 0, data: null, network: true }
  }
}
