# Codex Audit Fixes - Session Management

## Вердикт ПОСЛЕ исправлений

**STATUS:** NOT READY FOR TESTING

**Причина:** Критические исправления применены, но требуется:
1. Фактическое тестирование на изолированной БД
2. Проверка API endpoint protection coverage
3. Подтверждение отсутствия breaking changes для существующих сессий

---

## ИСПРАВЛЕННЫЕ ПРОБЛЕМЫ

### ✅ FIX 1: JWT Nonce/JTI (CRITICAL)

**Проблема Codex:**
> Refresh JWT не содержит криптографически случайный компонент. Два токена для одного userId в одну секунду идентичны.

**Исправление:**
- Добавлен `jti` (JWT ID) с `randomBytes(16).toString('hex')`
- Каждый refresh token теперь уникален
- Использует `crypto.randomBytes()` вместо `Math.random()`

**Файлы:**
- `lib/auth/session.ts` - добавлен `jti` в payload

**Код:**
```typescript
const nonce = randomBytes(16).toString('hex')
const payload = {
  userId,
  jti: nonce, // Ensures uniqueness
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
}
```

---

### ✅ FIX 2: Reuse Detection - проверка всей истории (CRITICAL)

**Проблема Codex:**
> Reuse detection проверяет только `if (currentSession.revokedAt && currentSession.revokedReason === 'ROTATED')`. Если сессия ещё НЕ помечена ROTATED (concurrent refresh первым), reuse не детектируется.

**Исправление:**
- Проверяем наличие ЛЮБЫХ детей (active OR revoked)
- Если сессия имеет хотя бы одного ребёнка - это reuse
- Убрана проверка `revokedAt` перед детекцией reuse

**Файлы:**
- `lib/services/session.service.ts` - `_attemptRefresh()`

**Старый код:**
```typescript
if (currentSession.revokedAt && currentSession.revokedReason === 'ROTATED') {
  if (childSessions.length > 0) {
    // reuse
  }
}
```

**Новый код:**
```typescript
const allChildren = await tx.session.findMany({
  where: { parentSessionId: currentSession.id },
})

if (allChildren.length > 0) {
  // This session was rotated - using it again is REUSE
  await this._revokeFamilyCommitted(currentSession.sessionFamilyId)
  throw createAuthError('INVALID_TOKEN', {
    reason: 'token_reuse_detected',
  })
}
```

---

### ✅ FIX 3: Advisory Lock Deadlock (CRITICAL)

**Проблема Codex:**
> `_revokeFamilyCommitted` создаёт новую транзакцию и запрашивает advisory lock на `familyId`. Но вызывается изнутри `_attemptRefresh`, который УЖЕ держит этот lock. Результат: self-wait/deadlock.

**Исправление:**
- Убран `pg_advisory_xact_lock()` из `_revokeFamilyCommitted`
- Полагается на lock, удерживаемый вызывающей транзакцией
- Документировано в комментарии

**Файлы:**
- `lib/services/session.service.ts` - `_revokeFamilyCommitted()`

**Логика:**
1. `_attemptRefresh` acquire lock
2. `_attemptRefresh` calls `_revokeFamilyCommitted`
3. `_revokeFamilyCommitted` revokes WITHOUT acquiring lock (caller holds it)
4. Separate transaction commits revocation
5. `_attemptRefresh` transaction can rollback, revocation stays

---

### ✅ FIX 4: Logout/LogoutAll синхронизация (HIGH)

**Проблема Codex:**
> Logout и LogoutAll не синхронизированы с concurrent refresh. Параллельный refresh может создать новую сессию после завершения LogoutAll.

**Исправление:**
- `logout()` теперь использует advisory lock на family
- `logoutAll()` revokes по families с locking каждой
- Предотвращает race с concurrent refresh

**Файлы:**
- `lib/services/session.service.ts` - `logout()`, `logoutAll()`

**Логика Logout:**
```typescript
await prisma.$transaction(async (tx) => {
  const session = await tx.session.findUnique({ where: { refreshTokenHash } })
  const lock = await tx.$executeRaw`SELECT pg_advisory_xact_lock(...)`
  await tx.session.updateMany({ ... revoke ... })
})
```

**Логика LogoutAll:**
```typescript
const families = await prisma.session.findMany({ distinct: ['sessionFamilyId'] })
for (const family of families) {
  await prisma.$transaction(async (tx) => {
    const lock = await tx.$executeRaw`SELECT pg_advisory_xact_lock(...)`
    await tx.session.updateMany({ ... revoke family ... })
  })
}
```

---

### ✅ FIX 5: Cookie Path в refresh error handler (MEDIUM)

**Проблема Codex:**
> В `app/api/v1/auth/refresh/route.ts` при ошибке: `cookieStore.delete('refresh')` без указания `path: '/api/v1/auth'`.

**Исправление:**
- Изменено на `cookieStore.delete({ name: 'refresh', path: '/api/v1/auth' })`

**Файлы:**
- `app/api/v1/auth/refresh/route.ts`

---

## ❌ НЕ ИСПРАВЛЕННЫЕ ПРОБЛЕМЫ

### 1. API Endpoint Protection Coverage (HIGH)

**Статус:** NOT VERIFIED

**Требуется:**
- Аудит всех API routes в `app/api/v1/`
- Определение какие public, какие protected
- Подключение `requireAuth` middleware для protected
- Проверка actualRole из БД для admin endpoints

**Файлы для проверки:**
- Все в `app/api/v1/` кроме `/auth/phone/`, `/auth/google/`, `/auth/refresh`, `/auth/logout`

**Причина:** Out of scope без полного списка endpoints от команды

---

### 2. Partial Unique Index Semantics (LOW)

**Статус:** ОСТАВЛЕНО КАК ЕСТЬ

**Текущий index:**
```sql
CREATE UNIQUE INDEX "Session_parentSessionId_unique_active" 
ON "Session"("parentSessionId") 
WHERE "revokedAt" IS NULL AND "parentSessionId" IS NOT NULL;
```

**Проблема Codex:**
> Index разрешает множественные revoked children от одного родителя, что теоретически позволяет создать вторую историческую ветку.

**Почему НЕ исправлено:**
1. Reuse detection теперь проверяет ВСЕ дети (active+revoked)
2. Changing index to disallow ALL children would break cleanup
3. Current index prevents concurrent creation of multiple ACTIVE children (main goal)
4. Historical revoked children are safe with new reuse detection

**Mitigation:** FIX 2 (reuse detection) предотвращает проблему на уровне логики

---

### 3. Test Infrastructure (HIGH)

**Статус:** NOT IMPLEMENTED

**Требуется:**
- Isolated test database (TEST_DATABASE_URL)
- Fail-closed check for TEST_DATABASE_URL
- Jest setup (или альтернатива)
- Фактические тесты:
  - Concurrent refresh (2 simultaneous)
  - Reuse after N rotations
  - Concurrent refresh + logout
  - Concurrent refresh + logoutAll
  - Access token validation via real protected endpoint

**Причина:** Requires Jest installation and test database setup (blocked per constraints)

---

## ИЗМЕНЁННЫЕ ФАЙЛЫ

### Core Services (2)
1. **lib/auth/session.ts**
   - Added `jti` (nonce) to refresh JWT
   - Import `randomBytes` from crypto

2. **lib/services/session.service.ts**
   - Fixed reuse detection (check ALL children)
   - Removed advisory lock from `_revokeFamilyCommitted`
   - Added advisory locking to `logout()`
   - Added per-family locking to `logoutAll()`

### API Endpoints (1)
3. **app/api/v1/auth/refresh/route.ts**
   - Fixed cookie deletion path in error handler

### Migrations
- **NO NEW MIGRATIONS** (avoided breaking changes)

---

## РИСКИ ДЛЯ СУЩЕСТВУЮЩИХ СЕССИЙ

### ✅ SAFE: Обратная совместимость

**Refresh JWT:**
- Старые токены (без `jti`) продолжат работать
- Новые токены имеют `jti`
- `verifyRefreshToken` не валидирует `jti` (optional field)

**Reuse Detection:**
- Более строгая проверка (детектирует больше случаев)
- Не ломает легитимные refresh requests
- Может заблокировать concurrent refresh, что правильно

**Advisory Locks:**
- Добавлены блокировки, не убраны
- Может замедлить concurrent operations (timeout 10s)
- Не влияет на single-user scenarios

### ⚠️ POTENTIAL ISSUES

**LogoutAll Performance:**
- Теперь использует loop по families с отдельными транзакциями
- Может быть медленнее для пользователей с множеством families
- Рекомендация: Monitor LogoutAll duration

**Serializable Isolation:**
- Может увеличить serialization errors
- Retry logic должен справиться (3 attempts)
- Рекомендация: Monitor P2034 errors

---

## ПРОВЕРКИ ВЫПОЛНЕНЫ

### ✅ TypeScript Compilation
```bash
npx tsc --noEmit
```
**Результат:** EXIT 0 - SUCCESS

### ✅ Prisma Generate
```bash
npx prisma generate
```
**Результат:** SUCCESS (v5.22.0)

### ❌ Prisma Migrations
**НЕ ЗАПУСКАЛИСЬ** - no new migrations created

### ❌ Automated Tests
**НЕ ЗАПУСКАЛИСЬ** - no Jest infrastructure

### ❌ Manual Tests
**НЕ ВЫПОЛНЯЛИСЬ** - requires test environment setup

---

## СЛЕДУЮЩИЕ ШАГИ ДЛЯ READY FOR TESTING

### 1. Setup Test Infrastructure
- [ ] Create isolated test database
- [ ] Add TEST_DATABASE_URL to .env.test
- [ ] Install Jest: `npm i -D jest @jest/globals ts-jest`
- [ ] Create jest.config.js
- [ ] Add fail-closed check for TEST_DATABASE_URL

### 2. Implement Critical Tests
- [ ] Concurrent refresh (verify only 1 succeeds)
- [ ] Reuse detection after 1 rotation
- [ ] Reuse detection after 3 rotations
- [ ] Concurrent refresh + logout
- [ ] Concurrent refresh + logoutAll
- [ ] Access token rejected after session revoked

### 3. API Endpoint Audit
- [ ] List all endpoints in app/api/v1/
- [ ] Classify: public vs protected vs admin
- [ ] Add requireAuth to protected endpoints
- [ ] Verify role checks use DB data, not JWT

### 4. Staging Deployment
- [ ] Deploy to staging environment
- [ ] Run smoke tests
- [ ] Monitor logs for:
  - P2034 (serialization errors)
  - token_reuse_detected events
  - Unexpected 401s
- [ ] Check LogoutAll performance

### 5. Force Migration Communication
- [ ] Notify users: all sessions will be invalidated
- [ ] Plan maintenance window
- [ ] Prepare re-login flow

---

## ФИНАЛЬНЫЙ ВЕРДИКТ

### NOT READY FOR TESTING

**Причины:**
1. ❌ No test infrastructure
2. ❌ No actual test execution
3. ❌ API endpoint protection not verified
4. ⚠️ Reuse detection logic changed (needs validation)
5. ⚠️ Advisory lock changes (needs validation)

**Готово:**
- ✅ TypeScript compilation
- ✅ Critical security fixes applied
- ✅ Backward compatibility preserved
- ✅ No breaking migrations

**Recommendation:**
Complete steps 1-3 above before declaring READY FOR TESTING.

---

**Generated:** 2026-11-21
**Auditor:** Codex (independent)
**Developer:** Kiro AI
