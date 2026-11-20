# 🔵 Frontend (часть подруги)

Frontend код находится в `app/`

## Структура:

```
app/
├── page.tsx         # Главная страница
├── layout.tsx       # Layout
├── globals.css      # Глобальные стили
└── page.module.css  # Модульные стили
```

## Работа с API:

Все API запросы идут на `/api/`:

```typescript
// Пример запроса
const response = await fetch('/api/posts')
const data = await response.json()
```

## Стили:

Используется чистый CSS (без Tailwind):
- `globals.css` - глобальные стили
- `page.module.css` - модульные стили для компонентов

## Создание новых страниц:

```
app/
├── about/
│   └── page.tsx     # /about
├── posts/
│   └── [id]/
│       └── page.tsx # /posts/123
```
