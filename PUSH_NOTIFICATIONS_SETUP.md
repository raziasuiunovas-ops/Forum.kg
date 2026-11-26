# Настройка Push-уведомлений

## ✅ Что уже сделано:

1. ✅ Service Worker зарегистрирован (`/public/sw.js`)
2. ✅ VAPID ключи созданы и добавлены в `.env` и `.env.local`
3. ✅ API endpoints созданы:
   - `POST /api/v1/push/subscribe` - подписка на уведомления
   - `DELETE /api/v1/push/subscribe` - отписка
   - `GET /api/v1/push/vapid` - получение публичного VAPID ключа
   - `POST /api/v1/push/test` - тестовая отправка
4. ✅ UI компонент `NotificationsTab` готов

## 🔧 Что нужно сделать на сервере:

### Добавить переменные окружения на Vercel:

1. Перейти в настройки проекта: https://vercel.com/dashboard → Ваш проект → Settings → Environment Variables

2. Добавить следующие переменные:

```bash
# VAPID Public Key (для клиента)
VAPID_PUBLIC_KEY=BK2T1iYARywRyA_M6HGL3b0TP90E4uHICRk6eYzzuStvHxKvv7P15pW9zis5DPNeilZAb1gjsNG2SPfkhQOFIkU

# VAPID Public Key (клиентская версия, встраивается в бандл)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BK2T1iYARywRyA_M6HGL3b0TP90E4uHICRk6eYzzuStvHxKvv7P15pW9zis5DPNeilZAb1gjsNG2SPfkhQOFIkU

# VAPID Private Key (только на сервере!)
VAPID_PRIVATE_KEY=vVGEdqLhcPs0PGhu15c4M2PLENTpGKH0hz3NHXtihpk

# VAPID Email
VAPID_EMAIL=mailto:admin@forum.kg
```

3. После добавления переменных - сделать **Redeploy** проекта

## 🧪 Как протестировать:

### 1. Локально:

```bash
# Запустить dev сервер
npm run dev

# Открыть в браузере
# Chrome/Edge: http://localhost:3000
# НЕ работает в Safari на Mac (нужен HTTPS)
```

Перейти в `/ru/account` → вкладка "Уведомления" → нажать "Включить"

### 2. На продакшене:

После деплоя:
1. Открыть сайт через HTTPS
2. Войти в аккаунт
3. Перейти в Account → Notifications
4. Нажать "Включить"
5. Разрешить уведомления в браузере

### 3. Отправить тестовое уведомление:

```bash
# Через API (нужен Bearer token)
curl -X POST https://forum.kg/api/v1/push/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Тест уведомления",
    "body": "Это тестовое push уведомление",
    "url": "/ru/account"
  }'
```

## 🌐 Поддержка браузеров:

✅ **Работает:**
- Chrome 42+ (desktop & Android)
- Edge 17+
- Firefox 44+
- Opera 29+
- Safari 16.4+ (только iOS 16.4+, macOS 13+)

❌ **НЕ работает:**
- Safari < 16.4
- iOS < 16.4
- Старые браузеры без поддержки Service Workers

## 🔒 Безопасность:

- ✅ VAPID ключи защищены
- ✅ Private key НЕ экспортируется на клиент
- ✅ Требуется авторизация для подписки
- ✅ HTTPS обязателен для работы Service Workers
- ✅ Пользователь должен дать разрешение браузеру

## 📝 Примечания:

1. **Локальная разработка**: Работает через HTTP на localhost
2. **Продакшн**: Требуется HTTPS
3. **iOS Safari**: Требуется Safari 16.4+ и iOS 16.4+
4. **Первый запуск**: Нужно разрешить уведомления в браузере

## 🐛 Отладка:

Если не работает, проверьте в консоли браузера:

```javascript
// Проверка поддержки
console.log('Notifications:', 'Notification' in window)
console.log('Service Worker:', 'serviceWorker' in navigator)
console.log('Push Manager:', 'pushManager' in ServiceWorkerRegistration.prototype)

// Проверка VAPID ключа
fetch('/api/v1/push/vapid')
  .then(r => r.json())
  .then(console.log)
```

## 📚 Полезные ссылки:

- [Web Push Notifications Guide](https://web.dev/push-notifications-overview/)
- [VAPID Protocol](https://datatracker.ietf.org/doc/html/draft-ietf-webpush-vapid-01)
- [Service Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
