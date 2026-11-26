#!/usr/bin/env node
/**
 * FORUM.KG Telegram Bot
 * Handles user connections and sends notifications
 * 
 * Setup:
 * 1. npm install node-telegram-bot-api
 * 2. Set TELEGRAM_BOT_TOKEN in .env
 * 3. Run: node telegram-bot/bot.mjs
 */

import TelegramBot from 'node-telegram-bot-api'
import { config } from 'dotenv'

config()

const token = process.env.TELEGRAM_BOT_TOKEN
const apiUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in .env')
  process.exit(1)
}

const bot = new TelegramBot(token, { polling: true })

console.log('🤖 FORUM.KG Bot started!')
console.log(`📡 API URL: ${apiUrl}`)

/**
 * Extract user ID from deep link
 * Example: /start user_abc-123-def
 */
function extractUserId(text) {
  const match = text.match(/\/start\s+user_(.+)/)
  return match ? match[1] : null
}

/**
 * /start command handler
 */
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const userId = extractUserId(msg.text)
  const firstName = msg.from.first_name || 'друг'

  console.log(`📱 New /start from chat ${chatId}, userId: ${userId || 'none'}`)

  if (!userId) {
    // No user ID in deep link - show instructions
    await bot.sendMessage(
      chatId,
      `👋 Привет, ${firstName}!

Добро пожаловать в FORUM.KG Bot! 🎉

Чтобы подключить уведомления:
1. Перейдите на сайт forum.kg
2. Войдите в свой аккаунт
3. В профиле нажмите "Подключить Telegram"
4. Следуйте инструкциям

После подключения вы будете получать:
📢 Уведомления о новых форумах
🎫 Подтверждения покупки билетов
⏰ Напоминания о событиях

🌐 Перейти на сайт: https://forum.kg`,
      { parse_mode: 'HTML' }
    )
    return
  }

  // Connect user to Telegram
  try {
    const response = await fetch(`${apiUrl}/api/v1/telegram/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        chatId: chatId.toString(),
        firstName,
      }),
    })

    const data = await response.json()

    if (data.success) {
      console.log(`✅ User ${userId} connected successfully`)
      
      if (data.alreadyConnected) {
        await bot.sendMessage(
          chatId,
          `✅ Вы уже подключены к FORUM.KG!

Вы будете получать все уведомления о форумах и билетах.

🌐 Личный кабинет: https://forum.kg/account`,
          { parse_mode: 'HTML' }
        )
      }
      // Welcome message is sent by API automatically
    } else {
      throw new Error(data.error || 'Connection failed')
    }
  } catch (error) {
    console.error(`❌ Failed to connect user ${userId}:`, error.message)
    
    await bot.sendMessage(
      chatId,
      `❌ Не удалось подключить Telegram.

Попробуйте ещё раз через несколько минут или обратитесь в поддержку.

🌐 Сайт: https://forum.kg`,
      { parse_mode: 'HTML' }
    )
  }
})

/**
 * /status command - check connection status
 */
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id
  
  await bot.sendMessage(
    chatId,
    `📊 <b>Статус подключения</b>

Chat ID: <code>${chatId}</code>

Если у вас подключен аккаунт FORUM.KG, вы будете получать все уведомления.

Чтобы проверить подключение, зайдите в профиль на сайте.

🌐 https://forum.kg/account`,
    { parse_mode: 'HTML' }
  )
})

/**
 * /help command
 */
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id
  
  await bot.sendMessage(
    chatId,
    `🤖 <b>FORUM.KG Bot - Помощь</b>

<b>Команды:</b>
/start - Подключить аккаунт
/status - Проверить статус
/help - Показать эту справку

<b>Что умеет бот:</b>
📢 Уведомления о новых форумах
🎫 Подтверждения покупки билетов
⏰ Напоминания о предстоящих событиях

<b>Настройки:</b>
Управление уведомлениями доступно в профиле на сайте.

🌐 https://forum.kg
📧 Поддержка: support@forum.kg`,
    { parse_mode: 'HTML' }
  )
})

/**
 * Handle any other messages
 */
bot.on('message', async (msg) => {
  if (msg.text?.startsWith('/')) return // Ignore commands
  
  const chatId = msg.chat.id
  
  await bot.sendMessage(
    chatId,
    `Используйте команду /help для просмотра доступных команд.`,
    { parse_mode: 'HTML' }
  )
})

/**
 * Error handler
 */
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.message)
})

// Keep the process running
process.on('SIGINT', () => {
  console.log('\n👋 Stopping bot...')
  bot.stopPolling()
  process.exit(0)
})
