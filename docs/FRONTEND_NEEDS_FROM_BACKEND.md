# Что фронтенду нужно от бэкенда

Файл для бэкенд-разработчика. Всё, что ниже, уже подключено или подготовлено на стороне фронтенда.

## 0. Исправлено фронтендом
- `admin/verify-2fa`: вызов `verifyCode` был без `await` (уже исправлено и в последнем main).

## 0b. Вход через Google (готово)
`/api/v1/auth/google/login` и `/callback` реализованы (code + PKCE, проверка id_token, привязка по подтверждённому email).
Нужны `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; redirect URI: `https://<домен>/api/v1/auth/google/callback`.
Требование ТЗ (BR-16) о подтверждении телефона после Google-входа пока не реализовано (нет эндпоинта привязки телефона).

## 0c. ВАЖНО: Upstash Redis
В production `middleware.ts` через `lib/security/api-rate-limit.ts` отвечает **503 на любой /api/***, если не заданы
`UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN` (fail closed). Без них не работают вход, админка и заказы.

## 1. Вход по email и паролю (новое)
- `prisma/schema.prisma`: `User.passwordHash String?` и миграция `20261123130000_add_user_password_hash`
  (нужно выполнить `prisma migrate deploy` на Neon).
- Эндпоинты: `POST /api/v1/auth/email/register`, `POST /api/v1/auth/email/login`
  (`lib/auth/email-auth.ts`, сессия создаётся так же, как в `verify-otp`).
- Проверьте и при необходимости усилить: блокировка после N неверных попыток, подтверждение email,
  сброс пароля (не реализованы), логирование. Тесты с реальной БД не запускались.
- ТЗ (BR-16 / п. 10.1): телефон должен быть подтверждён до покупки. Для аккаунтов с email нужен эндпоинт
  «привязать и подтвердить телефон» (`OtpPurpose.VERIFY_PHONE` у авторизованного пользователя): сейчас
  `verify-otp` по номеру создаёт/находит отдельный аккаунт.

## 2. QR-код билета
Настоящий QR уже генерируется (пакет `qrcode`). Сканер (`/admin/scanner`) ждёт в QR строку `FORUM.KG|<ticketNumber>|<token>`.
Нужно проверить на реальном билете, что сканирование камерой проходит через `POST /api/v1/check-in/validate`.

## 3. API админ-панели (не реализовано)
Интерфейс готов (`components/admin/*`), данные пока в `lib/admin/store.ts` (localStorage).
Заменить функции в `actions` на `fetch` к эндпоинтам из `docs/openapi.yaml`:
- форумы: список/создание/изменение/публикация/отмена, категории; переводы ru/ky/en; `qrExpiresAt`, `maxTicketsPerAccount`
- заказы и заявки на отмену: одобрить / отклонить / аннулировать билеты / статус возврата (отдельно!)
- платежи (фильтр только по календарной дате), билеты (ручное аннулирование с причиной), пользователи
- настройки сайта (+ переводы, соцсети), сотрудники и роли, журнал аудита, рассылки, офлайн-допуски, health интеграций
- Роли проверять на сервере: `SUPER_ADMIN`, `MANAGER`, `SCANNER` (скрытие пунктов в интерфейсе — не защита).
- Вход в админку сейчас по `ADMIN_LOGIN` / `ADMIN_PASSWORD_HASH` + код в Telegram (`ADMIN_TELEGRAM_CHAT_ID`, `TELEGRAM_BOT_TOKEN`).

## 4. Форумы (публичный API)
- Добавить в `GET /api/v1/forums`: категорию/тег форума (чипы фильтра на главной) и точный остаток по каждой
  категории (в `/forums/{slug}` помечено «Simplified»).
- Пока в базе нет опубликованных форумов, сайт показывает демо-события (нельзя заказать).
  Когда форумы появятся: `FORUMS_DEMO_FALLBACK=false`.

## 5. Оплата Finik
Заказ: `POST /api/v1/orders` (заголовок `Idempotency-Key`), в ответ `paymentUrl`. После оплаты Finik должен
вернуть пользователя на `https://<домен>/ru/payment/result` (страница сама проверяет статус по
`/api/v1/orders/{id}/payment-status`, номер заказа берёт из `?orderId=` или из sessionStorage).

## 6. Переменные окружения (Vercel)
Обязательные для сборки: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY_BASE64`,
`QR_ENCRYPTION_KEY`, `FINIK_WEBHOOK_SECRET`. Дополнительно: `NEXT_PUBLIC_APP_URL=https://<домен>`,
`ADMIN_LOGIN`, `ADMIN_PASSWORD_HASH`, `ADMIN_TELEGRAM_CHAT_ID`, `TELEGRAM_BOT_TOKEN`, `FINIK_*`, `GOOGLE_*`.
