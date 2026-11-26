/**
 * Telegram Bot Integration Service
 * Handles sending messages via Telegram Bot API
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
// Overridable only for local end-to-end tests (fake Telegram server); unset in production.
const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE_URL?.replace(/\/$/, '') || 'https://api.telegram.org'

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
 * SECURITY: Does not log message text to prevent leaking sensitive codes
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
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(10000), // 10 seconds
    })

    const data: TelegramResponse = await response.json()

    if (!data.ok) {
      // Don't log the full response which might contain sensitive data
      throw new TelegramError(
        'Telegram API request failed',
        data.error_code,
        data.description
      )
    }
  } catch (error) {
    // Re-throw TelegramError as-is
    if (error instanceof TelegramError) {
      throw error
    }

    // Network or timeout errors - don't log full error which might contain sensitive data
    if (error instanceof Error) {
      // Extract only the error type, not the message which might contain URL with token
      const errorType = error.name || 'Error'
      throw new TelegramError(
        `Failed to send Telegram message: ${errorType}`
      )
    }

    throw new TelegramError('Unknown error while sending Telegram message')
  }
}

/**
 * Send admin 2FA code via Telegram
 * Formatted message for authentication code
 * 
 * SECURITY: Code is sent in message text, never logged
 */
export async function sendAdmin2FACode(
  chatId: string,
  code: string,
  expiresInMinutes: number = 5
): Promise<void> {
  // SECURITY: Format code with HTML to prevent injection
  // <code> tag ensures code is displayed as monospace and prevents HTML interpretation
  const safeCode = code.replace(/[<>&"']/g, (c) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[c] || c
  })

  const text = `🔐 <b>Код аутентификации администратора</b>

Ваш код подтверждения: <code>${safeCode}</code>

⏱ Код действителен в течение ${expiresInMinutes} минут.
🔒 Никому не сообщайте этот код.

Если вы не запрашивали этот код, проигнорируйте это сообщение.`

  // Send without logging sensitive data
  await sendTelegramMessage({
    chatId,
    text,
    parseMode: 'HTML',
    disableWebPagePreview: true,
    disableNotification: false,
  })
}

/**
 * Send ticket purchase notification to user via Telegram
 * 
 * @param chatId - User's Telegram chat ID
 * @param ticketInfo - Ticket information
 */
export async function sendTicketPurchaseNotification(
  chatId: string,
  ticketInfo: {
    forumTitle: string
    forumDate: string
    ticketCount: number
    totalAmount: string
    orderNumber: string
  }
): Promise<void> {
  const { forumTitle, forumDate, ticketCount, totalAmount, orderNumber } = ticketInfo

  const ticketWord = ticketCount === 1 ? 'билет' : ticketCount < 5 ? 'билета' : 'билетов'
  
  const text = `🎉 <b>Оплата прошла успешно!</b>

📋 <b>Информация о заказе:</b>
• Заказ: <code>${orderNumber}</code>
• Форум: ${forumTitle}
• Дата: ${forumDate}
• Билетов: ${ticketCount} ${ticketWord}
• Сумма: ${totalAmount}

✅ Ваши билеты готовы! QR-коды доступны в личном кабинете на сайте FORUM.KG

📱 Не забудьте показать QR-код на входе!

Спасибо за покупку! До встречи на форуме! 🚀`

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
