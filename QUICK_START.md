# 🚀 Быстрый запуск Telegram бота

## Что уже сделано:

✅ Токен бота добавлен в .env  
✅ Создана структура бота  
✅ Настроены команды  
✅ Подключена база данных

## Запуск за 3 шага:

### Шаг 1: Установить недостающие пакеты

```powershell
npm install
```

Это установит:
- `node-telegram-bot-api` - основная библиотека
- `@types/node-telegram-bot-api` - TypeScript типы
- `tsx` - для запуска TypeScript файлов

### Шаг 2: Создать таблицы в базе данных

```powershell
npm run db:push
```

Это создаст все необходимые таблицы, включая поле `telegramId` для связи пользователей с Telegram.

### Шаг 3: Запустить бота

```powershell
npm run bot
```

Вы увидите сообщение:
```
🤖 Starting Telegram bot...
✅ Bot started successfully!
👤 Bot username: @your_bot
💬 Waiting for messages...
```

## Проверка работы:

1. Откройте Telegram
2. Найдите вашего бота (имя бота в @BotFather)
3. Отправьте команду `/start`
4. Бот должен ответить приветственным сообщением!

## Доступные команды бота:

- `/start` - Приветствие
- `/help` - Справка
- `/latest` - Последние посты
- `/topics` - Категории форума
- `/register` - Регистрация
- `/myprofile` - Мой профиль

## Если что-то пошло не так:

**Ошибка: "TELEGRAM_BOT_TOKEN is not defined"**
- Проверьте файл .env, там должна быть строка:
  ```
  TELEGRAM_BOT_TOKEN=9258325267:AAFKYS1BlLADCGtbWXX9_fIWc8oNbjfMdfA
  ```

**Ошибка: "Cannot find module..."**
- Запустите: `npm install`

**Ошибка базы данных**
- Запустите: `npm run db:push`
- Проверьте DATABASE_URL в .env

**Бот не отвечает**
- Убедитесь, что скрипт запущен (`npm run bot`)
- Проверьте логи в консоли
- Проверьте, что токен правильный

## Разработка:

Для автоматической перезагрузки при изменениях:

```powershell
npm run bot:dev
```

## Одновременный запуск форума и бота:

**Терминал 1 (Форум):**
```powershell
npm run dev
```

**Терминал 2 (Бот):**
```powershell
npm run bot
```

Теперь и веб-форум, и телеграм бот работают параллельно!
