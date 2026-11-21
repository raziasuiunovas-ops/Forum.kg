-- ЭТАП 2.2 - SQL-запросы для тестирования RBAC Fresh Role Check

-- 1. Создать тестового пользователя с ролью USER
-- (выполнить после успешного OTP verify для +996555100200)
-- User будет создан автоматически при первом OTP verify

-- 2. Проверить текущую роль пользователя
SELECT 
  id,
  phone,
  role,
  status,
  created_at
FROM "User"
WHERE phone = '+996555100200';
-- Ожидается: role = USER

-- 3. Симуляция: администратор повышает роль USER -> MANAGER
UPDATE "User"
SET role = 'MANAGER', updated_at = NOW()
WHERE phone = '+996555100200';

-- 4. Проверка обновления
SELECT 
  id,
  phone,
  role,
  status,
  updated_at
FROM "User"
WHERE phone = '+996555100200';
-- Ожидается: role = MANAGER

-- 5. Тест: Получить сессию через API GET /api/v1/auth/session
-- Ожидаемое поведение:
--   - JWT содержит старую роль USER (не обновляется автоматически)
--   - API должен вернуть актуальную роль MANAGER из БД
--   - Middleware requireRole должен использовать MANAGER для RBAC

-- 6. Симуляция: администратор понижает роль MANAGER -> USER
UPDATE "User"
SET role = 'USER', updated_at = NOW()
WHERE phone = '+996555100200';

-- 7. Проверка обновления
SELECT 
  id,
  phone,
  role,
  status,
  updated_at
FROM "User"
WHERE phone = '+996555100200';
-- Ожидается: role = USER

-- 8. Тест: Попытка доступа к endpoint требующему MANAGER role
-- Ожидаемое поведение:
--   - JWT всё ещё содержит старую роль MANAGER
--   - Middleware должен проверить актуальную роль USER из БД
--   - Доступ должен быть ЗАПРЕЩЁН (403 INSUFFICIENT_PERMISSIONS)

-- 9. Симуляция: администратор блокирует пользователя
UPDATE "User"
SET status = 'SUSPENDED', updated_at = NOW()
WHERE phone = '+996555100200';

-- 10. Проверка блокировки
SELECT 
  id,
  phone,
  role,
  status,
  updated_at
FROM "User"
WHERE phone = '+996555100200';
-- Ожидается: status = SUSPENDED

-- 11. Тест: Попытка доступа к любому protected endpoint
-- Ожидаемое поведение:
--   - JWT валиден
--   - Middleware должен проверить status = SUSPENDED из БД
--   - Доступ должен быть ЗАПРЕЩЁН (403 ACCOUNT_SUSPENDED)

-- 12. Восстановление пользователя
UPDATE "User"
SET status = 'ACTIVE', role = 'USER', updated_at = NOW()
WHERE phone = '+996555100200';

-- 13. Симуляция: администратор удаляет пользователя
DELETE FROM "User"
WHERE phone = '+996555100200';

-- 14. Тест: Попытка доступа после удаления
-- Ожидаемое поведение:
--   - JWT валиден (ещё не истёк)
--   - Middleware должен проверить существование пользователя в БД
--   - User не найден
--   - Доступ должен быть ЗАПРЕЩЁН (401 INVALID_TOKEN "Пользователь не найден")

-- 15. Очистка тестовых данных
-- DELETE FROM "OtpChallenge" WHERE phone = '+996555100200';
-- DELETE FROM "User" WHERE phone = '+996555100200';

-- 16. Проверка всех пользователей с ролями выше USER
SELECT 
  id,
  phone,
  first_name,
  last_name,
  role,
  status,
  created_at,
  updated_at
FROM "User"
WHERE role IN ('SCANNER', 'MANAGER', 'SUPER_ADMIN')
ORDER BY role DESC, created_at DESC;

-- 17. Проверка активных сессий (если Session Management реализован)
-- SELECT 
--   s.id,
--   s.user_id,
--   u.phone,
--   u.role AS current_role,
--   s.created_at,
--   s.expires_at,
--   s.revoked_at
-- FROM "Session" s
-- JOIN "User" u ON s.user_id = u.id
-- WHERE s.revoked_at IS NULL AND s.expires_at > NOW()
-- ORDER BY s.created_at DESC;
