# Автоматические уведомления в Telegram

## Обзор

Система автоматических уведомлений в Telegram включает:

1. **Приветственное сообщение** - при подключении Telegram
2. **Напоминания о форумах** - за 1 день до события
3. **Уведомления о новых форумах** - для всех подписчиков
4. **Массовые рассылки** - кастомные уведомления администраторами

## 1. Приветственное сообщение

### Когда отправляется
Автоматически при первом подключении пользователя к боту `@Forum_kg_bot`

### Формат сообщения
```
👋 Привет, Имя!

Добро пожаловать в FORUM.KG! 🎉

Теперь вы будете получать:
📢 Уведомления о новых форумах
🎫 Подтверждения покупки билетов
⏰ Напоминания о предстоящих событиях

Следите за анонсами — самые интересные события Кыргызстана ждут вас!

🌐 Сайт: forum.kg
📱 Билеты всегда в вашем телефоне!
```

### API Endpoint
```typescript
POST /api/v1/telegram/connect
Body: {
  userId: string,
  chatId: string,
  firstName?: string
}
```

## 2. Напоминания о форумах

### Когда отправляется
- За 1 день до начала форума
- Запускается через cron задачу ежедневно в 9:00 утра по времени Бишкека

### Кому отправляется
Только пользователям у которых:
- Есть активные билеты на предстоящий форум
- Подключен Telegram

### Формат сообщения
```
⏰ Напоминание о форуме!

🎯 Название форума

📅 15 декабря 2026 г., среда, 10:00
📍 Место проведения

🎫 У вас 2 билета

⏳ Завтра — не забудьте!

📱 QR-коды билетов доступны в личном кабинете на forum.kg

До встречи на форуме! 🚀
```

### Настройка Cron

#### Вариант 1: Vercel Cron Jobs

Добавьте в `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/send-reminders?days=1&secret=YOUR_SECRET",
    "schedule": "0 9 * * *"
  }]
}
```

#### Вариант 2: Внешний Cron сервис

Используйте сервис типа [cron-job.org](https://cron-job.org) или [EasyCron](https://www.easycron.com/):

```
URL: https://forum.kg/api/cron/send-reminders?days=1&secret=YOUR_SECRET
Schedule: 0 9 * * * (ежедневно в 9:00 UTC+6)
```

#### Вариант 3: Локальный Cron (Linux)

```bash
# Откройте crontab
crontab -e

# Добавьте задачу (9:00 по Бишкеку)
0 3 * * * curl "https://forum.kg/api/cron/send-reminders?days=1&secret=YOUR_SECRET"
```

### API Endpoint
```
GET /api/cron/send-reminders?days=1&secret=YOUR_SECRET
```

Параметры:
- `days` - За сколько дней до события (1-30)
- `secret` - CRON_SECRET из .env

## 3. Уведомления о новых форумах

### Когда отправляется
Автоматически при публикации нового форума (когда статус меняется на PUBLISHED)

### Кому отправляется
Всем пользователям у которых:
- Включены уведомления (`announcementsPushEnabled = true`)
- Подключен Telegram

### Формат сообщения
```
🆕 Новый форум доступен для регистрации!

🎯 Название форума

📝 Краткое описание...

📅 15 декабря 2026 г., 10:00
📍 Место проведения
💰 От 500 сом

🎟 Билеты уже в продаже!

🌐 Подробности и регистрация: forum.kg/forum-slug

Не упустите возможность! 🚀
```

### Интеграция в админку

При публикации форума в админ-панели автоматически вызывается:
```typescript
POST /api/v1/forums/:slug/announce
```

**Пример интеграции** (добавьте в код публикации форума):
```typescript
// После изменения статуса на PUBLISHED
if (newStatus === ForumStatus.PUBLISHED) {
  await fetch(`/api/v1/forums/${forumSlug}/announce`, {
    method: 'POST',
    credentials: 'include',
  })
}
```

## 4. Массовые рассылки

### Функции для массовых уведомлений

```typescript
import { sendBulkNotification } from '@/lib/notifications/telegram-notifications'

// Отправить всем подписчикам
await sendBulkNotification(
  'Важное объявление',
  'Текст сообщения...',
  false // всем
)

// Отправить только владельцам билетов
await sendBulkNotification(
  'Информация для участников',
  'Текст сообщения...',
  true // только с активными билетами
)
```

### Кастомные уведомления одному пользователю

```typescript
import { sendCustomNotification } from '@/lib/notifications/telegram-notifications'

await sendCustomNotification(
  userId,
  'Заголовок',
  'Текст сообщения'
)
```

## Настройка переменных окружения

В `.env` добавьте:

```env
# Telegram Bot (уже настроен)
TELEGRAM_BOT_TOKEN=9258325267:AAFKYS1BlLADCGtbWXX9_fIWc8oNbjfMdfA
TELEGRAM_BOT_USERNAME=Forum_kg_bot

# Cron Secret (для защиты endpoints)
CRON_SECRET=ваш-случайный-секрет-32-символа
```

Генерация `CRON_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Rate Limiting

Система включает автоматическую задержку между сообщениями (50ms) для предотвращения блокировки Telegram API.

Telegram API лимиты:
- 30 сообщений в секунду
- 20 сообщений в минуту в одну группу/канал

## Обработка ошибок

- Ошибки отправки не прерывают процесс
- Каждая ошибка логируется с user ID
- Успешно отправленные сообщения подсчитываются
- Возвращается статистика: сколько отправлено успешно

## Мониторинг

### Проверка работы cron задачи

```bash
curl "https://forum.kg/api/cron/send-reminders?days=1&secret=YOUR_SECRET"
```

Ответ:
```json
{
  "success": true,
  "sentCount": 15,
  "days": 1,
  "timestamp": "2026-11-26T12:00:00.000Z"
}
```

### Логи

Все операции логируются:
```
[Cron Reminders] Starting reminder send for forums in 1 days
[Telegram Reminder] Failed to send to user abc-123: Error...
[Cron Reminders] Successfully sent 15 reminders
```

## Тестирование

### 1. Тест приветственного сообщения
```bash
curl -X POST https://forum.kg/api/v1/telegram/connect \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-id","chatId":"123456789","firstName":"Тест"}'
```

### 2. Тест напоминаний (ручной запуск)
```bash
curl "https://forum.kg/api/cron/send-reminders?days=1&secret=YOUR_SECRET"
```

### 3. Тест анонса форума
```bash
curl -X POST https://forum.kg/api/v1/forums/forum-slug/announce
```

## Telegram Bot настройка

Бот должен обрабатывать команду `/start` и отправлять данные на API:

```javascript
// Пример бота (Node.js)
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const userId = extractUserIdFromDeepLink(msg.text) // из параметра
  
  await fetch('https://forum.kg/api/v1/telegram/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      chatId,
      firstName: msg.from.first_name
    })
  })
})
```

## Будущие улучшения

- [ ] Уведомления за 7 дней до форума
- [ ] Уведомления в день форума (утром)
- [ ] Персонализированные рекомендации форумов
- [ ] История отправленных уведомлений
- [ ] Dashboard для мониторинга
- [ ] A/B тестирование текстов уведомлений
- [ ] Настройка времени отправки пользователями
