# Исправление проблемы "Untitled" в названиях форумов

## Проблема
На главной странице лендинга вместо названий форумов отображалось "Untitled", хотя в админ-панели названия были заполнены корректно.

## Причина
В API эндпоинте `/api/v1/forums` (файл `app/api/v1/forums/route.ts`) переводы форумов загружались с фильтром по запрошенной локали:

```typescript
translations: {
  where: {
    locale,  // Фильтровало только запрошенную локаль
  },
}
```

Это приводило к тому, что если запрошенная локаль не совпадала с доступными в базе данных, массив `forum.translations` был пустым, и код пытался взять `translation?.title`, который был `undefined`.

## Решение
Изменена логика загрузки переводов - теперь загружаются ВСЕ переводы форума, а затем выбирается нужный с fallback на русский:

### Изменения в `app/api/v1/forums/route.ts`:

1. **Загрузка всех переводов** (строка ~48):
```typescript
translations: true, // Load all translations, not just requested locale
```

2. **Правильный поиск перевода** (строка ~92):
```typescript
// Find translation for requested locale, fallback to RU
const translation = forum.translations.find((t) => t.locale === locale)
const fallbackTranslation = forum.translations.find((t) => t.locale === Locale.RU)
```

3. **То же для категорий билетов** (строка ~115):
```typescript
const catTranslation = cat.translations.find((t) => t.locale === locale)
const catFallback = cat.translations.find((t) => t.locale === Locale.RU)
```

## Проверка
После внесения изменений:

1. Запустите dev-сервер:
```bash
npm run dev
```

2. Проверьте API напрямую:
```bash
npx tsx scripts/test-forums-api.ts
```

3. Откройте главную страницу лендинга - названия форумов должны отображаться корректно

## Дополнительная информация
- Аналогичная проблема НЕ присутствовала в `/api/v1/forums/[slug]/route.ts`, так как там изначально загружались все переводы
- Схема форума (`lib/api/schemas/forum.ts`) требует наличия минимум одного русского (RU) перевода
- Проверка показала, что все форумы в базе данных имеют корректные переводы на русском языке
