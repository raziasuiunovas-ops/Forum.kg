import { createSign, createVerify } from 'node:crypto'

const PAYMENT_PATH = '/v1/payment'
const MAX_RESPONSE_BYTES = 16 * 1024

export interface FinikPaymentInput {
  paymentId: string
  orderNumber: string
  amountMinor: number
  currency: string
  reservedUntil: Date
}

export interface FinikPaymentResult {
  paymentUrl: string
}

export interface FinikRuntimeConfig {
  environment: 'beta' | 'prod'
  apiKey: string
  accountId: string
  privateKey: string
  publicKey: string
  redirectUrl: string
  webhookUrl: string
  apiBaseUrl: string
}

export type FinikFetch = typeof fetch

export function readFinikConfig(env: Readonly<Record<string, string | undefined>>): FinikRuntimeConfig {
  const environment = env.FINIK_ENV === 'beta' ? 'beta' : env.FINIK_ENV === 'prod' ? 'prod' : null
  const apiKey = env.FINIK_API_KEY?.trim()
  const accountId = env.FINIK_ACCOUNT_ID?.trim()
  const privateKey = (env.FINIK_PRIVATE_KEY ?? env.FINIK_PRIVATE_PEM)?.trim().replace(/\\n/g, '\n')
  const publicKey = (environment === 'beta' ? env.FINIK_BETA_PUBLIC_KEY : env.FINIK_PROD_PUBLIC_KEY)
    ?.trim().replace(/\\n/g, '\n')
  
  // Auto-generate URLs if not provided
  const baseUrl = env.NEXT_PUBLIC_APP_URL || 'https://forum-kg-ten.vercel.app'
  const redirectUrl = env.FINIK_REDIRECT_URL?.trim() || `${baseUrl}/payment/result`
  const webhookUrl = env.FINIK_WEBHOOK_URL?.trim() || `${baseUrl}/api/v1/payments/webhooks/finik`

  if (!environment || !apiKey || !accountId || !privateKey) {
    throw new Error('Finik is not configured')
  }

  // Validate RSA private key format (PEM)
  if (!privateKey.includes('BEGIN PRIVATE KEY') && !privateKey.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error('Finik is not configured')
  }

  // Public key validation only if provided
  if (publicKey && !publicKey.includes('BEGIN PUBLIC KEY') && !publicKey.includes('BEGIN RSA PUBLIC KEY')) {
    throw new Error('Invalid Finik public key format')
  }

  validateHttpsUrl(redirectUrl)
  validateHttpsUrl(webhookUrl)

  return {
    environment,
    apiKey,
    accountId,
    privateKey,
    publicKey: publicKey || '', // Empty string if not provided
    redirectUrl,
    webhookUrl,
    apiBaseUrl: environment === 'beta'
      ? 'https://beta.api.acquiring.averspay.kg'
      : 'https://api.acquiring.averspay.kg',
  }
}

/** Finik signs the method, path, canonical headers and top-level sorted JSON body. */
export function createFinikCanonicalString(input: {
  method: string
  path: string
  host: string
  headers: Readonly<Record<string, string>>
  query?: URLSearchParams
  body?: unknown
}): string {
  const canonicalHeaders: Array<[string, string]> = [
    ['host', input.host.trim()],
    ...Object.entries(input.headers)
      .filter(([name]) => name.toLowerCase().startsWith('x-api-'))
      .map(([name, value]) => [name.toLowerCase(), value.trim()] as [string, string]),
  ]
  canonicalHeaders.sort(([a], [b]) => a.localeCompare(b))

  const headerLine = canonicalHeaders.map(([name, value]) => `${name}:${value}`).join('&')
  const queryLine = input.query ? canonicalizeQuery(input.query) : ''
  const bodyText = input.body === undefined ? '' : JSON.stringify(sortTopLevelObject(input.body))

  let canonical = `${input.method.toLowerCase()}\n${input.path}\n${headerLine}\n`
  if (queryLine) canonical += `${queryLine}\n`
  return canonical + bodyText
}

export async function createFinikPayment(
  input: FinikPaymentInput,
  options: {
    env?: Readonly<Record<string, string | undefined>>
    fetcher?: FinikFetch
    now?: () => number
  } = {}
): Promise<FinikPaymentResult> {
  const config = readFinikConfig(options.env ?? process.env)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.paymentId)) {
    throw new Error('Invalid Finik payment identifier')
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.currency !== 'KGS') {
    throw new Error('Invalid Finik payment amount or currency')
  }

  const amount = input.amountMinor / 100
  const body = {
    Amount: amount,
    CardType: 'FINIK_QR',
    PaymentId: input.paymentId,
    RedirectUrl: config.redirectUrl,
    Currency: input.currency,
    Lang: 'ru',
    Data: {
      accountId: config.accountId,
      name_en: `FORUM.KG ${input.orderNumber}`,
      webhookUrl: config.webhookUrl,
      description: `Forum order ${input.orderNumber}`,
      endDate: input.reservedUntil.getTime(),
      additionalData: [
        { fieldId: 'currency', name: 'Currency', isHidden: true, value: input.currency },
        { fieldId: 'orderNumber', name: 'Order number', isHidden: true, value: input.orderNumber },
      ],
      currencies: [{ currency: input.currency, amount }],
    },
  }

  const timestamp = String((options.now ?? Date.now)())
  const host = new URL(config.apiBaseUrl).host
  const headers = {
    'x-api-key': config.apiKey,
    'x-api-timestamp': timestamp,
  }
  const canonical = createFinikCanonicalString({
    method: 'POST',
    path: PAYMENT_PATH,
    host,
    headers,
    body,
  })
  const signer = createSign('RSA-SHA256')
  signer.update(canonical, 'utf8')
  signer.end()
  const signature = signer.sign(config.privateKey, 'base64')

  let response: Response
  try {
    response = await (options.fetcher ?? fetch)(`${config.apiBaseUrl}${PAYMENT_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host,
        ...headers,
        signature,
      },
      body: JSON.stringify(body),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error('Finik payment request failed')
  }

  if (response.status !== 302) {
    await cancelResponseBody(response)
    // Log HTTP status for diagnostics without exposing response body or credentials
    console.error('Finik payment creation failed', {
      status: response.status,
      paymentId: input.paymentId,
      environment: config.environment,
    })
    throw new Error('Finik rejected the payment request')
  }

  const location = response.headers.get('location')
  if (!location) throw new Error('Finik returned an invalid payment response')
  const paymentUrl = validatePaymentUrl(location, config.apiBaseUrl)
  await cancelResponseBody(response)
  return { paymentUrl }
}

export function verifyFinikWebhookSignature(input: {
  method: string
  path: string
  host: string | null
  headers: Headers
  query: URLSearchParams
  body: unknown
  signature: string | null
  publicKey: string
}): boolean {
  if (!input.host || !input.signature || !input.publicKey) return false

  const timestamp = input.headers.get('x-api-timestamp')
  if (!timestamp || !/^\d{10,13}$/.test(timestamp)) return false
  const parsedTimestamp = Number(timestamp)
  if (!Number.isSafeInteger(parsedTimestamp)) return false

  const signedHeaders: Record<string, string> = {}
  input.headers.forEach((value, name) => {
    if (name.toLowerCase().startsWith('x-api-')) signedHeaders[name.toLowerCase()] = value
  })

  const canonical = createFinikCanonicalString({
    method: input.method,
    path: input.path,
    host: input.host,
    headers: signedHeaders,
    query: input.query,
    body: input.body,
  })

  try {
    const verifier = createVerify('RSA-SHA256')
    verifier.update(canonical, 'utf8')
    verifier.end()
    const signatureBytes = Buffer.from(input.signature, 'base64')
    if (!signatureBytes.length || signatureBytes.toString('base64') !== input.signature) return false
    return verifier.verify(input.publicKey, signatureBytes)
  } catch {
    return false
  }
}

export function readFinikWebhookPublicKey(
  env: Readonly<Record<string, string | undefined>>
): string {
  const environment = env.FINIK_ENV
  const key = environment === 'beta'
    ? env.FINIK_BETA_PUBLIC_KEY
    : environment === 'prod'
      ? env.FINIK_PROD_PUBLIC_KEY
      : undefined
  if (!key?.trim()) throw new Error('Finik webhook verification is not configured')
  const publicKey = key.trim().replace(/\\n/g, '\n')
  
  // Validate RSA public key format (PEM)
  if (!publicKey.includes('BEGIN PUBLIC KEY') && !publicKey.includes('BEGIN RSA PUBLIC KEY')) {
    throw new Error('Finik webhook verification is not configured')
  }
  
  return publicKey
}

export async function readLimitedRequestText(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(body)
}

export const FINIK_MAX_WEBHOOK_BYTES = MAX_RESPONSE_BYTES

function sortTopLevelObject(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const source = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(source).sort().map((key) => [key, source[key]]))
}

function canonicalizeQuery(query: URLSearchParams): string {
  return [...query.entries()]
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue)
    )
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&')
}

function validateHttpsUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Finik is not configured')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Finik is not configured')
  }
  return url
}

function validatePaymentUrl(value: string, apiBaseUrl: string): string {
  const url = validateHttpsUrl(value)
  const allowedHost = url.hostname === 'qr.finik' ||
    url.hostname === 'qr.finik.kg' ||
    url.hostname.endsWith('.finik.kg')
  if (!allowedHost || url.username || url.password || url.port || url.search || url.hash || url.origin === apiBaseUrl) {
    throw new Error('Finik returned an invalid payment response')
  }
  return url.toString()
}

async function cancelResponseBody(response: Response): Promise<void> {
  try { await response.body?.cancel() } catch { /* No response body is needed. */ }
}
