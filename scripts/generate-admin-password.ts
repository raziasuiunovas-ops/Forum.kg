/**
 * Generate secure admin password and bcrypt hash
 * Run: npx tsx scripts/generate-admin-password.ts
 */

import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'

async function generateAdminPassword() {
  console.log('🔐 Генерация безопасного admin пароля...\n')

  // Generate cryptographically secure password
  // 32 bytes = 256 bits entropy
  const passwordBytes = randomBytes(32)
  const password = passwordBytes.toString('base64url') // URL-safe Base64 encoding

  console.log('✅ Сгенерированный пароль (сохраните отдельно):')
  console.log(`   ${password}\n`)

  // Hash password with bcrypt (10 rounds)
  console.log('⚙️  Хеширование пароля...')
  const passwordHash = await bcrypt.hash(password, 10)

  console.log('✅ Bcrypt хеш:\n')
  console.log('Добавьте в .env:')
  console.log('─'.repeat(80))
  console.log(`ADMIN_LOGIN=admin`)
  console.log(`ADMIN_PASSWORD_HASH=${passwordHash}`)
  console.log(`ADMIN_TELEGRAM_CHAT_ID=YOUR_TELEGRAM_CHAT_ID`)
  console.log('─'.repeat(80))
  console.log()
  console.log('⚠️  ВАЖНО:')
  console.log('   1. Скопируйте пароль выше и сохраните в безопасном месте')
  console.log('   2. Добавьте credentials в .env файл')
  console.log('   3. Получите ADMIN_TELEGRAM_CHAT_ID:')
  console.log('      - Напишите боту @Forum_kg_bot')
  console.log('      - Отправьте команду /start')
  console.log('      - Запустите: npx tsx scripts/test-telegram-bot.ts')
  console.log('      - Скопируйте ваш chat ID из вывода')
  console.log()
}

generateAdminPassword().catch(console.error)
