/**
 * Telegram Bot Integration Service
 * Handles sending messages via Telegram Bot API
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API_BASE = 'https://api.telegram.org'

if (!TELEGRAM_BOT_TOKEN) {
  console.error('⚠️  TELEGRAM_BOT_TOKEN is not configured')
}

/**
 * Telegram API Error
 */
export class TelegramError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly telegramError?: string
  ) {
    super(message)
    this.name = 'TelegramError'
  }
}

/**
 * Telegram message options
 */
export interface SendMessageOptions {
  chatId: string | number
  text: string
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
  disableWebPagePreview?: boolean
  disableNotification?: boolean
}

/**
 * Telegram API response
 */
interface TelegramResponse<T = any> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
}

/**
 * Send message via Telegram Bot API
 * 
 * @throws {TelegramError} If message sending fails
 */
export async function sendTelegramMessage(
  options: SendMessageOptions
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new TelegramError('Telegram bot token not configured')
  }

  const url = `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`

  const payload = {
    chat_id: options.chatId,
    text: options.text,
    parse_mode: options.parseMode,
    disable_web_page_preview: options.disableWebPagePreview,
    disable_notification: options.disableNotification,
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data: TelegramResponse = await response.json()

    if (!data.ok) {
      throw new TelegramError(
        data.description || 'Telegram API request failed',
        data.error_code,
        data.description
      )
    }
  } catch (error) {
    // Re-throw TelegramError as-is
    if (error instanceof TelegramError) {
      throw error
    }

    // Network or other errors
    if (error instanceof Error) {
      throw new TelegramError(
        `Failed to send Telegram message: ${error.message}`
      )
    }

    throw new TelegramError('Unknown error while sending Telegram message')
  }
}

/**
 * Send admin 2FA code via Telegram
 * Formatted message for authentication code
 */
export async function sendAdmin2FACode(
  chatId: string,
  code: string,
  expiresInMinutes: number = 5
): Promise<void> {
  const text = `🔐 <b>Код аутентификации администратора</b>

Ваш код подтверждения: <code>${code}</code>

⏱ Код действителен в течение ${expiresInMinutes} минут.
🔒 Никому не сообщайте этот код.

Если вы не запрашивали этот код, проигнорируйте это сообщение.`

  await sendTelegramMessage({
    chatId,
    text,
    parseMode: 'HTML',
    disableWebPagePreview: true,
    disableNotification: false,
  })
}

/**
 * Get bot information (for testing/debugging)
 */
export async function getBotInfo(): Promise<any> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new TelegramError('Telegram bot token not configured')
  }

  const url = `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/getMe`

  try {
    const response = await fetch(url)
    const data: TelegramResponse = await response.json()

    if (!data.ok) {
      throw new TelegramError(
        data.description || 'Failed to get bot info',
        data.error_code
      )
    }

    return data.result
  } catch (error) {
    if (error instanceof TelegramError) {
      throw error
    }
    throw new TelegramError('Failed to get bot information')
  }
}
