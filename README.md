# 🚀 Forum Project

Next.js 15 + TypeScript + Neon PostgreSQL

**Всё работает на одном URL**: `http://localhost:3000`

---

## 📁 Структура проекта

```
├── app/                    # Next.js App Router
│   ├── api/               # 🔴 Backend API (твоя часть)
│   │   ├── auth/         # Авторизация
│   │   ├── posts/        # Посты
│   │   ├── users/        # Пользователи
│   │   └── hello/        # Тест
│   │
│   ├── page.tsx          # 🔵 Frontend (часть подруги)
│   ├── layout.tsx
│   └── globals.css
│
├── backend/              # 📝 Документация backend
├── frontend/             # 📝 Документация frontend
│
├── prisma/               # База данных
│   └── schema.prisma
│
├── lib/
│   └── db.ts            # Prisma клиент
│
├── .env                 # Настройки (Neon БД подключена!)
└── package.json
```

---

## 🚀 Установка и запуск

### 1. Установка зависимостей:
```bash
npm install
```

### 2. Настройка базы данных:
```bash
npm run db:push
```

### 3. Запуск проекта:
```bash
npm run dev
```

Проект запустится на **http://localhost:3000**

---

## 🔗 Как это работает

### Backend API (твоя часть):
- Код в `app/api/`
- Доступ: `http://localhost:3000/api/...`
- База данных: Prisma + Neon PostgreSQL

### Frontend (часть подруги):
- Код в `app/`
- Страницы, компоненты, стили
- Обращается к API через `/api/...`

---

## 📋 Доступные команды

```bash
npm run dev        # Запуск dev сервера
npm run build      # Сборка для production
npm run start      # Запуск production
npm run lint       # Проверка кода
npm run db:push    # Применить схему к БД
npm run db:studio  # Открыть Prisma Studio
```

---

## 🗄️ База данных

**Neon PostgreSQL** подключена в `.env`

### Таблицы:
- `users` - пользователи
- `posts` - посты
- `comments` - комментарии
- `categories` - категории
- `likes` - лайки

---

## 🎯 API Endpoints

- `GET /api/hello` - проверка API
- `POST /api/auth` - авторизация
- `GET /api/posts` - получить посты
- `POST /api/posts` - создать пост
- `GET /api/users` - пользователи

---

## ✅ Преимущества этой структуры

✨ Всё на одном порту (3000)  
✨ Один `npm run dev` запускает всё  
✨ Frontend и Backend в одном проекте  
✨ Легко деплоить на Vercel  
✨ Разделение кода: backend в `app/api/`, frontend в `app/`  

---

## 📝 Следующие шаги

1. ✅ Запустить: `npm install && npm run db:push && npm run dev`
2. 📝 Дождаться ТЗ от подруги
3. 🚀 Начать разработку!

**Backend**: работаешь в `app/api/`  
**Frontend**: подруга работает в `app/` (страницы, компоненты)
