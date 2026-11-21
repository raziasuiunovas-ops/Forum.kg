# Архитектурное решение: Гибридный подход для FORUM.KG

**Дата принятия:** 19 ноября 2026  
**Статус:** ✅ УТВЕРЖДЕНО  
**Вариант:** Hybrid Approach (Вариант 3)

---

## 1. Контекст

Проект **FORUM.KG** — платформа продажи билетов для мероприятий в Кыргызстане.

**Техническая Спецификация (раздел 3.1)** описывает NestJS монорепозиторий, но проект фактически использует **Next.js Full-Stack** архитектуру.

---

## 2. Утверждённое решение

### MVP Architecture
- **Backend:** Next.js API Routes (`app/api/`)
- **Worker:** Отдельный Node.js процесс с BullMQ
- **Database:** Prisma + PostgreSQL (35 таблиц)

### После MVP
Миграция на NestJS монорепозиторий согласно ТЗ.

---

## 3. Временное отклонение от ТЗ

**ТЗ требует:** NestJS Backend в монорепозитории  
**MVP реализует:** Next.js API Routes  
**Обоснование:** Ускорение разработки (экономия 2-3 недели на настройку)

**План миграции:**
1. Вынос логики в NestJS модули
2. Создание монорепозитория (Turborepo/Nx)
3. Миграция API Routes → NestJS контроллеры
4. Разделение на `apps/web/` и `apps/api/`

---

## 4. Координация Frontend/Backend

### 🔴 Критические файлы (требуют обсуждения в Issues)
- `package.json`, `next.config.ts`, `middleware.ts`, `tsconfig.json`, `.env`

### 🟢 Backend-only (координация не требуется)
- `app/api/*`, `prisma/*`, `lib/services/*`, `lib/integrations/*`, `worker/*`, `shared/*`

### 🟡 Frontend-only
- `app/(pages)/*`, `components/*`, `globals.css`, `tailwind.config.ts`, `i18n/*`, `messages/*`

---

## 5. Git Workflow

- **Backend ветки:** `backend/*`
- **Frontend ветки:** `frontend/*`
- **Критические файлы:** Issue → обсуждение → согласованный коммит

---

## 6. Критерии завершения MVP

1. ✅ Аутентификация (Email/Google/Phone/Telegram)
2. ✅ CRUD форумов (ky/ru)
3. ✅ Заказы + оплата (Finik)
4. ✅ Генерация билетов с QR
5. ✅ Check-in по QR
6. ✅ Уведомления (Email/SMS/Telegram/Push)
7. ✅ Admin-панель
8. ✅ Worker для асинхронных задач

---

## 7. Утверждённые условия

1. ✅ Next.js Full-Stack как первый этап
2. ✅ Worker — отдельный процесс (не в Next.js)
3. ✅ Миграция на NestJS после MVP
4. ✅ Временное отклонение от ТЗ согласовано
5. ✅ Frontend/Backend в отдельных ветках с правилами координации

---

**Дата начала разработки:** 19 ноября 2026  
**Ожидаемый срок MVP:** 2-3 месяца
