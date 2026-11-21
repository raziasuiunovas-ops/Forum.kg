-- ЭТАП 2.1 - SQL-запросы для проверки инвалидации OTP

-- 1. Просмотр всех OTP challenges для конкретного телефона
SELECT 
  id,
  phone,
  purpose,
  attempts,
  consumed_at AS "consumedAt (invalidated if NOT NULL)",
  expires_at AS "expiresAt",
  created_at AS "createdAt",
  CASE 
    WHEN consumed_at IS NOT NULL THEN 'INVALIDATED/CONSUMED'
    WHEN expires_at < NOW() THEN 'EXPIRED'
    ELSE 'ACTIVE'
  END AS status
FROM "OtpChallenge"
WHERE phone = '+996555000999'
ORDER BY created_at DESC
LIMIT 10;

-- 2. Проверка инвалидации: должен быть только один ACTIVE challenge на phone+purpose
SELECT 
  phone,
  purpose,
  COUNT(*) FILTER (WHERE consumed_at IS NULL AND expires_at >= NOW()) AS active_challenges,
  COUNT(*) AS total_challenges
FROM "OtpChallenge"
GROUP BY phone, purpose
HAVING COUNT(*) FILTER (WHERE consumed_at IS NULL AND expires_at >= NOW()) > 1
ORDER BY active_challenges DESC;
-- Ожидаемый результат: пустая таблица (нет телефонов с >1 активным challenge)

-- 3. Проверка rate limiting: количество OTP за последние 15 минут
SELECT 
  phone,
  purpose,
  COUNT(*) AS requests_last_15min
FROM "OtpChallenge"
WHERE created_at >= NOW() - INTERVAL '15 minutes'
GROUP BY phone, purpose
ORDER BY requests_last_15min DESC;

-- 4. Проверка attempts increment
SELECT 
  id,
  phone,
  attempts,
  consumed_at,
  created_at
FROM "OtpChallenge"
WHERE attempts > 0
ORDER BY created_at DESC
LIMIT 10;

-- 5. Очистка тестовых данных (опционально)
-- DELETE FROM "OtpChallenge" WHERE phone LIKE '+9965550%';
