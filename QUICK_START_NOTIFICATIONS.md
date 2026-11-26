# 🚀 Быстрый старт: Автоматические уведомления в Telegram

## Что готово ✅

1. **Уведомление о покупке билета** - работает автоматически
2. **Приветственное сообщение** - при подключении Telegram
3. **Напоминания о форумах** - за 1 день до события
4. **Анонсы новых форумов** - для всех подписчиков
5. **UI для подключения** - кнопка в личном кабинете

## Настройка за 5 минут

### Шаг 1: Генерация CRON_SECRET

```bash
node scripts/generate-cron-secret.mjs
```

Добавьте в `.env`:
```env
CRON_SECRET=полученный_секрет
```

### Шаг 2: Запуск Telegram бота

```bash
cd telegram-bot
npm install
npm start
```

Или с PM2:
```bash
pm2 start telegram-bot/bot.mjs --name forum-bot
```

### Шаг 3: Настройка Cron задачи

#### Локально (для теста)
```bash
# Добавить в crontab (Linux/Mac)
crontab -e

# Запуск каждый день в 9:00
0 3 * * * curl "http://localhost:3000/api/cron/send-reminders?days=1&secret=YOUR_SECRET"
```

#### На Vercel (продакшен)
Файл `vercel.json` уже готов! При деплое на Vercel cron запустится автоматически.

## Как это работает

### 1. Пользователь подключает Telegram

```
Пользователь -> Нажимает "Подключить @Forum_kg_bot" 
              -> Открывается Telegram
              -> Нажимает /start
              -> Бот подключает аккаунт
              -> Отправляет приветствие
```

### 2. Покупка билета

```
Оплата успешна -> Webhook Finik
                -> Создаются билеты
                -> Web Push уведомление
                -> Telegram уведомление (если подключен)
```

### 3. Напоминание о форуме

```
Cron (ежедневно в 9:00) -> API /api/cron/send-reminders
                         -> Находит форумы через 1 день
                         -> Отправляет напоминания владельцам билетов
```

### 4. Анонс нового форума

```
Админ публикует форум -> Статус = PUBLISHED
                       -> POST /api/v1/forums/:slug/announce
                       -> Отправка всем подписчикам
```

## Тестирование

### 1. Тест подключения Telegram
1. Откройте http://localhost:3000/account
2. Перейдите во вкладку "Уведомления"
3. Нажмите "Подключить @Forum_kg_bot"
4. В Telegram отправьте `/start`
5. Получите приветственное сообщение

### 2. Тест покупки билета
1. Купите билет (тестовый режим)
2. После оплаты проверьте Telegram
3. Должно прийти подтверждение с деталями

### 3. Тест напоминаний (ручной)
```bash
curl "http://localhost:3000/api/cron/send-reminders?days=1&secret=YOUR_SECRET"
```

### 4. Тест анонса форума
```bash
curl -X POST "http://localhost:3000/api/v1/forums/forum-slug/announce"
```

## Шаблоны сообщений

### Приветствие
```
👋 Привет, Имя!
Добро пожаловать в FORUM.KG! 🎉
...
```

### Покупка билета
```
🎉 Оплата прошла успешно!
📋 Информация о заказе:
• Заказ: ORD-123
• Форум: Название
...
```

### Напоминание
```
⏰ Напоминание о форуме!
🎯 Название форума
📅 Завтра в 10:00
...
```

### Новый форум
```
🆕 Новый форум доступен!
🎯 Название
📝 Описание
🎟 Билеты в продаже!
...
```

## Мониторинг

### Проверка работы бота
```bash
pm2 status
pm2 logs forum-bot
```

### Проверка cron задачи
```bash
# Вызвать вручную
curl "https://forum.kg/api/cron/send-reminders?days=1&secret=SECRET"

# Ответ
{
  "success": true,
  "sentCount": 15,
  "days": 1,
  "timestamp": "2026-11-26T12:00:00Z"
}
```

### Логи в коде
Все операции логируются:
```
[Telegram Connect] User abc-123 connected successfully
[Cron Reminders] Successfully sent 15 reminders
[Forum Announcement] Successfully sent to 234 users
```

## Частые вопросы

### Как изменить время напоминаний?
Отредактируйте `vercel.json`:
```json
{
  "crons": [{
    "schedule": "0 6 * * *"  // 9:00 по Бишкеку = 3:00 UTC
  }]
}
```

### Как отправить напоминание за 3 дня?
```bash
curl ".../api/cron/send-reminders?days=3&secret=SECRET"
```

### Как отключить уведомления для пользователя?
Пользователь может:
1. В профиле на сайте отключить `announcementsPushEnabled`
2. В Telegram заблокировать бота

### Как отправить кастомное уведомление?
```typescript
import { sendBulkNotification } from '@/lib/notifications/telegram-notifications'

await sendBulkNotification(
  'Важное объявление',
  'Текст сообщения',
  false // true = только с билетами
)
```

## Следующие шаги

- [ ] Добавить напоминание за 7 дней
- [ ] Уведомление в день форума (утром)
- [ ] Персональные рекомендации
- [ ] Статистика доставки
- [ ] A/B тестирование сообщений

## Полезные ссылки

- Основная документация: `TELEGRAM_AUTOMATED_NOTIFICATIONS.md`
- Код бота: `telegram-bot/bot.mjs`
- API endpoints: `app/api/v1/telegram/`
- Сервис уведомлений: `lib/notifications/telegram-notifications.ts`
