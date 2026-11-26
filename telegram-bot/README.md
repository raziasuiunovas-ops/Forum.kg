# FORUM.KG Telegram Bot

Telegram бот для автоматических уведомлений о форумах и билетах.

## Установка

```bash
cd telegram-bot
npm install
```

## Настройка

Убедитесь что в корневом `.env` файле есть:

```env
TELEGRAM_BOT_TOKEN=your-bot-token
NEXT_PUBLIC_APP_URL=https://forum.kg
```

## Запуск

### В режиме разработки (с автоперезагрузкой)
```bash
npm run dev
```

### В продакшене
```bash
npm start
```

### С PM2 (рекомендуется для продакшена)
```bash
# Установить PM2
npm install -g pm2

# Запустить бот
pm2 start bot.mjs --name forum-bot

# Автозапуск при перезагрузке сервера
pm2 startup
pm2 save

# Просмотр логов
pm2 logs forum-bot

# Остановить бот
pm2 stop forum-bot
```

## Команды бота

- `/start` - Подключить аккаунт FORUM.KG
- `/status` - Проверить статус подключения
- `/help` - Справка по командам

## Deep Link для подключения

Чтобы пользователи могли подключить Telegram из веб-интерфейса:

```typescript
// В React компоненте
const userId = user.id
const botUsername = 'Forum_kg_bot'
const deepLink = `https://t.me/${botUsername}?start=user_${userId}`

<a href={deepLink}>Подключить Telegram</a>
```

## Архитектура

```
Пользователь -> Telegram Bot -> API (/api/v1/telegram/connect)
                                  -> Database (TelegramConnection)
                                  -> Welcome Message
```

## Логи

Бот выводит логи всех действий:
```
🤖 FORUM.KG Bot started!
📱 New /start from chat 123456, userId: abc-def-123
✅ User abc-def-123 connected successfully
```

## Деплой

### На VPS (Ubuntu/Debian)

```bash
# Скопировать файлы на сервер
scp -r telegram-bot user@server:/var/www/forum-kg/

# На сервере
cd /var/www/forum-kg/telegram-bot
npm install --production

# Запустить с PM2
pm2 start bot.mjs --name forum-bot
pm2 startup
pm2 save
```

### Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY telegram-bot/package*.json ./
RUN npm ci --production

COPY telegram-bot/ ./
COPY .env ./

CMD ["node", "bot.mjs"]
```

```bash
docker build -t forum-bot .
docker run -d --name forum-bot --env-file .env forum-bot
```

## Мониторинг

### С PM2
```bash
pm2 monit
```

### Веб-интерфейс PM2
```bash
pm2 install pm2-server-monit
```

## Безопасность

- Бот работает в polling режиме (не требует webhook)
- Все пользовательские данные валидируются
- API endpoint `/api/v1/telegram/connect` защищён от дублирования
- Chat ID хранится в зашифрованном виде в БД

## Troubleshooting

### Бот не запускается
- Проверьте что `TELEGRAM_BOT_TOKEN` правильный
- Убедитесь что бот создан через @BotFather
- Проверьте логи: `pm2 logs forum-bot`

### Бот не отвечает
- Проверьте что процесс запущен: `pm2 status`
- Проверьте интернет соединение
- Перезапустите: `pm2 restart forum-bot`

### Уведомления не приходят
- Проверьте что у пользователя подключен Telegram в БД
- Проверьте что API сервер доступен
- Проверьте логи API: `/api/v1/telegram/connect`
