/**
 * Server-side contract for the SMS gateway. The concrete provider is selected
 * separately; until then the resolver deliberately returns no provider.
 */

export type SmsDeliveryCertainty = 'rejected' | 'unknown'

export interface SmsOtpMessage {
  challengeId: string
  to: string
  code: string
  purpose: 'LOGIN' | 'VERIFY_PHONE' | 'CHANGE_PHONE'
  expiresAt: Date
}

export interface SmsProvider {
  /**
   * Submit one OTP message. Implementations must validate the gateway HTTP
   * status and response, honor the AbortSignal, and use the idempotency key
   * when the selected gateway supports it. Definite rejections throw
   * SmsProviderError('rejected'); transport ambiguity throws 'unknown'.
   */
  sendOtp(
    message: SmsOtpMessage,
    options: { idempotencyKey: string; signal: AbortSignal }
  ): Promise<{ accepted: true; providerMessageId?: string }>
}

export class SmsProviderError extends Error {
  constructor(public readonly certainty: SmsDeliveryCertainty) {
    super('SMS delivery failed')
    this.name = 'SmsProviderError'
  }
}

export const SMS_PROVIDER_TIMEOUT_MS = 10_000

/** No concrete provider is wired until the business selects one. */
export function getSmsProvider(): SmsProvider | null {
  return null
}

/**
 * Calls the provider once and classifies a timeout/network failure as
 * uncertain. Uncertain submissions are never retried automatically.
 */
export async function sendOtpSms(
  provider: SmsProvider,
  message: SmsOtpMessage,
  timeoutMs = SMS_PROVIDER_TIMEOUT_MS
): Promise<void> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new SmsProviderError('unknown'))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([
      provider.sendOtp(message, {
        idempotencyKey: message.challengeId,
        signal: controller.signal,
      }),
      timeout,
    ])
    if (!result || result.accepted !== true) {
      throw new SmsProviderError('unknown')
    }
  } catch (error) {
    if (error instanceof SmsProviderError) throw error
    throw new SmsProviderError('unknown')
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
