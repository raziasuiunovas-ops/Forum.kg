# Telegram Bot для Форума

## 🤖 Описание

Этот телеграм бот позволяет пользователям взаимодействовать с форумом прямо из Telegram.

## 📋 Функции бота

### Доступные команды:

- `/start` - Приветственное сообщение и список команд
- `/help` - Справка по командам
- `/latest` - Получить последние 5 постов с форума
- `/topics` - Список категорий форума
- `/register` - Зарегистрироваться на форуме через Telegram
- `/myprofile` - Просмотреть свой профиль

### Дополнительные возможности:

- **Поиск постов**: Просто отправьте текст боту, и он найдет посты по вашему запросу
- **Автоматическая регистрация**: При регистрации через бота, ваш Telegram ID связывается с учетной записью форума

## 🚀 Установка и запуск

### 1. Установите зависимости

```bash
npm install
```

Основные зависимости:
- `node-telegram-bot-api` - Библиотека для работы с Telegram Bot API
- `@types/node-telegram-bot-api` - TypeScript типы

### 2. Настройте базу данных

```bash
npm run db:push
```

Это создаст необходимые таблицы в базе данных, включая поле `telegramId` для пользователей.

### 3. Настройте токен бота

Токен уже добавлен в файл `.env`:
```
TELEGRAM_BOT_TOKEN=9258325267:AAFKYS1BlLADCGtbWXX9_fIWc8oNbjfMdfA
```

### 4. Запустите бота

**Для разработки (с авто-перезапуском):**
```bash
npm run bot:dev
```

**Для обычного запуска:**
```bash
npm run bot
```

## 📂 Структура файлов бота

```
lib/
├── telegram-bot.ts          # Инициализация бота
└── telegram-handlers.ts     # Обработчики команд

scripts/
└── start-bot.ts            # Скрипт запуска бота

app/api/telegram/
└── route.ts                # API endpoint для webhook (production)
```

## 🔧 Режимы работы

### Development (Polling)

В режиме разработки бот использует **polling** - постоянно опрашивает Telegram API на наличие новых сообщений.

```bash
npm run bot
```

### Production (Webhook)

В продакшене рекомендуется использовать **webhook** - Telegram будет отправлять обновления на ваш сервер.

Для настройки webhook:
1. Запустите ваше приложение Next.js на публичном домене
2. Telegram будет отправлять запросы на: `https://your-domain.com/api/telegram`

## 💡 Примеры использования

### Регистрация пользователя

1. Пользователь отправляет `/register` боту
2. Бот создает учетную запись с Telegram ID
3. Пользователь может войти на форум через Telegram

### Просмотр постов

1. Пользователь отправляет `/latest`
2. Бот показывает последние 5 постов с форума

### Поиск

1. Пользователь отправляет текст, например: "JavaScript"
2. Бот ищет посты, содержащие это слово

## 🗄️ База данных

Схема пользователя обновлена для поддержки Telegram:

```prisma
model User {
  id         Int      @id @default(autoincrement())
  username   String   @unique
  email      String   @unique
  password   String
  telegramId String?  @unique  // Telegram ID пользователя
  // ... другие поля
}
```

## ⚠️ Важные моменты

1. **Безопасность токена**: Никогда не публикуйте `.env` файл с токеном бота в публичных репозиториях
2. **Права бота**: Убедитесь, что бот имеет необходимые права в настройках @BotFather
3. **Лимиты API**: Telegram имеет лимиты на количество запросов, используйте их разумно

## 🐛 Отладка

Если бот не запускается:

1. Проверьте, что токен правильно установлен в `.env`
2. Убедитесь, что база данных подключена
3. Проверьте логи в консоли

Логи бота будут показывать:
```
🤖 Starting Telegram bot...
✅ Bot started successfully!
👤 Bot username: @your_bot_name
🆔 Bot ID: 123456789
📝 Bot name: Your Bot Name

💬 Waiting for messages...
```

## 📝 Добавление новых команд

Чтобы добавить новую команду:

1. Создайте обработчик в `lib/telegram-handlers.ts`:
```typescript
export async function handleMyCommand(bot: TelegramBot, msg: TelegramBot.Message) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Hello from new command!');
}
```

2. Зарегистрируйте команду в функции `registerHandlers`:
```typescript
bot.onText(/\/mycommand/, (msg) => handleMyCommand(bot, msg));
```

## 🎯 Следующие шаги

- [ ] Добавить inline кнопки для навигации
- [ ] Добавить уведомления о новых постах
- [ ] Добавить возможность создавать посты через бота
- [ ] Добавить админ-команды для модерации
- [ ] Добавить мультиязычность

## 📞 Поддержка

Если у вас возникли проблемы, проверьте:
- Документацию Telegram Bot API: https://core.telegram.org/bots/api
- Документацию node-telegram-bot-api: https://github.com/yagop/node-telegram-bot-api
