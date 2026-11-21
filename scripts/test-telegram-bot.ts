/**
 * Тестовый скрипт для проверки Telegram Bot
 * Запуск: npx tsx scripts/test-telegram-bot.ts
 */

import 'dotenv/config'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const BOT_API = `https://api.telegram.org/bot${BOT_TOKEN}`

async function testBot() {
  console.log('🤖 Тестирование Telegram Bot...\n')

  try {
    // 1. Получить информацию о боте
    console.log('📡 Получение информации о боте...')
    const meResponse = await fetch(`${BOT_API}/getMe`)
    const meData = await meResponse.json()

    if (!meData.ok) {
      throw new Error(`API Error: ${meData.description}`)
    }

    const bot = meData.result
    console.log('✅ Бот успешно подключён!\n')
    console.log('📋 Информация о боте:')
    console.log(`   ID: ${bot.id}`)
    console.log(`   Username: @${bot.username}`)
    console.log(`   Name: ${bot.first_name}`)
    console.log(`   Can join groups: ${bot.can_join_groups}`)
    console.log()

    // 2. Проверить webhook
    console.log('🔗 Проверка webhook...')
    const webhookResponse = await fetch(`${BOT_API}/getWebhookInfo`)
    const webhookData = await webhookResponse.json()

    if (webhookData.ok) {
      const info = webhookData.result
      console.log(`   URL: ${info.url || '(не установлен)'}`)
      console.log(`   Pending updates: ${info.pending_update_count}`)
      if (info.last_error_message) {
        console.log(`   ⚠️ Last error: ${info.last_error_message}`)
      }
      console.log()
    }

    // 3. Получить последние обновления
    console.log('📨 Проверка последних сообщений...')
    const updatesResponse = await fetch(`${BOT_API}/getUpdates?limit=1`)
    const updatesData = await updatesResponse.json()

    if (updatesData.ok) {
      const updates = updatesData.result
      console.log(`   Получено обновлений: ${updates.length}`)
      if (updates.length > 0) {
        const lastUpdate = updates[0]
        console.log(`   Последнее обновление ID: ${lastUpdate.update_id}`)
        if (lastUpdate.message) {
          console.log(`   От: ${lastUpdate.message.from.first_name} (@${lastUpdate.message.from.username || 'no username'})`)
          console.log(`   Текст: ${lastUpdate.message.text || '(no text)'}`)
        }
      } else {
        console.log('   ℹ️ Нет новых сообщений')
      }
      console.log()
    }

    console.log('✅ Все проверки пройдены успешно!')
    console.log()
    console.log('🔗 Ссылка на бота: https://t.me/Forum_kg_bot')
    console.log('💡 Напишите боту /start чтобы начать диалог')

  } catch (error) {
    console.error('❌ Ошибка:', error)
    process.exit(1)
  }
}

testBot()
