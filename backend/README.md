# 🔴 Backend API (твоя часть)

Backend код находится в `app/api/`

## Структура:

```
app/api/
├── auth/       # Авторизация
├── posts/      # Посты
├── users/      # Пользователи
└── hello/      # Тест API
```

## Доступ к API:

Все эндпоинты доступны по адресу: `http://localhost:3000/api/`

Примеры:
- GET `http://localhost:3000/api/hello`
- GET `http://localhost:3000/api/posts`
- POST `http://localhost:3000/api/auth`

## База данных:

Prisma находится в корне проекта:
- `prisma/schema.prisma` - схема БД
- `lib/db.ts` - Prisma клиент

## Команды:

```bash
npm run db:push    # Применить схему к БД
npm run db:studio  # Открыть Prisma Studio
```
