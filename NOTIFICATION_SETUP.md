# Настройка Web Push уведомлений ✅

## Что было исправлено

1. **Добавлена переменная окружения в `.env.local`**
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` теперь доступна на клиенте
   - Эта переменная используется для подписки на Web Push уведомления

2. **Перезапущен dev server**
   - Dev server был перезапущен с новыми переменными окружения
   - Сервер работает на `http://localhost:3000`

## Как протестировать

### 1. Откройте приложение
Перейдите на: `http://localhost:3000`

### 2. Войдите в аккаунт
Войдите или зарегистрируйтесь в системе

### 3. Перейдите в настройки уведомлений
- Откройте личный кабинет (Account)
- Перейдите на вкладку "Уведомления"

### 4. Включите уведомления
- Нажмите кнопку "Включить"
- Браузер запросит разрешение на отправку уведомлений
- Разрешите уведомления

### 5. Проверьте статус
После успешной подписки вы должны увидеть:
- ✅ "Уведомления включены"
- Зеленая иконка колокольчика
- Сообщение об успехе

## Технические детали

### Переменные окружения
```env
# .env.local
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BK2T1iYARywRyA_M6HGL3b0TP90E4uHICRk6eYzzuStvHxKvv7P15pW9zis5DPNeilZAb1gjsNG2SPfkhQOFIkU

# .env
VAPID_PRIVATE_KEY=vVGEdqLhcPs0PGhu15c4M2PLENTpGKH0hz3NHXtihpk
VAPID_EMAIL=mailto:admin@forum.kg
```

### API Endpoints
- `POST /api/v1/push/subscribe` - Подписка на уведомления
- `DELETE /api/v1/push/subscribe` - Отписка от уведомлений
- `POST /api/v1/push/test` - Отправка тестового уведомления текущему пользователю

### Service Worker
- Файл: `public/sw.js`
- Регистрируется при подписке на уведомления
- Обрабатывает push события и показывает уведомления

### База данных
Подписки сохраняются в таблице `PushSubscription`:
- `userId` - ID пользователя
- `endpoint` - URL для отправки уведомлений
- `endpointHash` - Хеш endpoint для быстрого поиска
- `p256dh` - Ключ шифрования
- `auth` - Секрет аутентификации

## Отправка тестового уведомления

### Вариант 1: Через API (рекомендуется)

После того как вы подписались на уведомления, отправьте POST запрос:

```bash
curl -X POST http://localhost:3000/api/v1/push/test \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "title": "Тестовое уведомление 🔔",
    "body": "Это тестовое push уведомление!",
    "url": "/ru/account"
  }'
```

Или откройте консоль браузера на странице и выполните:

```javascript
fetch('/api/v1/push/test', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Привет! 👋',
    body: 'Уведомления работают отлично!',
    url: '/ru/forums'
  })
}).then(r => r.json()).then(console.log)
```

### Вариант 2: Программно

Для отправки тестового уведомления используйте функцию `sendPushToUser`:

```typescript
import { sendPushToUser } from '@/lib/push/send'

await sendPushToUser('userId', {
  title: 'Тестовое уведомление',
  body: 'Это тестовое push уведомление',
  url: '/ru/account',
  icon: '/icons/icon-192.png'
})
```

## Требования браузера

- ✅ Chrome/Edge (desktop & mobile)
- ✅ Firefox (desktop & mobile)
- ✅ Safari 16.4+ (iOS и macOS)
- ✅ Opera (desktop & mobile)
- ⚠️ Требуется HTTPS (в dev режиме работает на localhost)

## Устранение проблем

### "Уведомления пока не настроены на сервере"
- ✅ Исправлено! Добавлена переменная `NEXT_PUBLIC_VAPID_PUBLIC_KEY` в `.env.local`
- Перезапустите dev server если проблема остается

### "Уведомления заблокированы в браузере"
- Нажмите на замок рядом с адресом сайта
- Найдите "Уведомления" и измените на "Разрешить"
- Обновите страницу

### "Уведомления недоступны"
- Проверьте, что сайт открыт через HTTPS (или localhost)
- Проверьте поддержку браузера
- Откройте консоль браузера для отладочной информации

## Статус: ✅ ГОТОВО К РАБОТЕ

Система Web Push уведомлений полностью настроена и готова к использованию!
