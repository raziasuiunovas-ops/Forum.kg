import { NextRequest, NextResponse } from 'next/server';
import { getTelegramBot } from '@/lib/telegram-bot';

// Webhook endpoint для Telegram
export async function POST(request: NextRequest) {
  try {
    const bot = getTelegramBot();
    const update = await request.json();

    await bot.processUpdate(update);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Endpoint для проверки статуса бота
export async function GET() {
  try {
    const bot = getTelegramBot();
    const me = await bot.getMe();
    
    return NextResponse.json({
      status: 'running',
      bot: {
        id: me.id,
        username: me.username,
        first_name: me.first_name,
      },
    });
  } catch (error) {
    console.error('Bot status check error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Bot not initialized' },
      { status: 500 }
    );
  }
}
