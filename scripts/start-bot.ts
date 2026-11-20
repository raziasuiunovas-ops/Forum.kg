import { getTelegramBot } from '../lib/telegram-bot';
import { registerHandlers } from '../lib/telegram-handlers';

async function startBot() {
  try {
    console.log('🤖 Starting Telegram bot...');
    
    const bot = getTelegramBot();
    
    // Регистрируем все обработчики команд
    registerHandlers(bot);
    
    // Получаем информацию о боте
    const me = await bot.getMe();
    console.log(`✅ Bot started successfully!`);
    console.log(`👤 Bot username: @${me.username}`);
    console.log(`🆔 Bot ID: ${me.id}`);
    console.log(`📝 Bot name: ${me.first_name}`);
    console.log('\n💬 Waiting for messages...\n');
    
    // Обработка ошибок
    bot.on('polling_error', (error) => {
      console.error('❌ Polling error:', error);
    });
    
    bot.on('error', (error) => {
      console.error('❌ Bot error:', error);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping bot...');
      bot.stopPolling();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Stopping bot...');
      bot.stopPolling();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

startBot();
