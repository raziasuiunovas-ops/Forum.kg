# Payment Security Tests

Комплект тестов для проверки безопасности Payment API системы FORUM.KG.

## Покрытие тестов

### ✅ QR Token Encryption (3 теста)
- Шифрование и дешифрование QR токенов с использованием AES-256-GCM
- Уникальность ciphertext для одного plaintext (проверка IV randomness)
- Отклонение tampered ciphertext (проверка authentication tag)

### ✅ Webhook Signature Verification (2 теста)
- Генерация валидных HMAC-SHA256 подписей
- Timing-safe сравнение подписей (защита от timing attacks)

### ✅ QR Token Generation (2 теста)
- Генерация криптографически стойких 256-bit токенов
- Консистентность SHA-256 хеширования

### ✅ QR Format Validation (1 тест)
- Парсинг QR формата `FORUM.KG|ticketNumber|token`

## Запуск тестов

### Быстрый запуск (используетразработческий encryption key):

```bash
NODE_ENV=test npx tsx tests/security/payment-security.test.ts
```

### Запуск с production encryption key:

```bash
export ENCRYPTION_KEY_BASE64="$(openssl rand -base64 32)"
npx tsx tests/security/payment-security.test.ts
```

### Пример результата:

```
✅ QR Encryption: encrypts and decrypts correctly
✅ QR Encryption: produces unique ciphertexts
✅ QR Encryption: rejects tampered ciphertext
✅ Webhook: generates valid HMAC-SHA256
✅ Webhook: timing-safe comparison works
✅ QR Token: generates 256-bit random tokens
✅ QR Token: SHA-256 hashing is consistent
✅ QR Format: parses correctly

==================================================
TEST SUMMARY
==================================================
Total: 8 | Passed: 8 | Failed: 0
```

## Тесты НЕ включены (требуют database/network)

Следующие тесты требуют полной интеграции и не могут быть запущены в изоляции:

### ❌ Webhook Integration Tests (требуют database)
- Replay attack prevention с реальной базой данных
- Race condition testing с concurrent requests
- Duplicate webhook processing с PaymentWebhookEvent table
- P2002 error handling в транзакциях

### ❌ Check-in Tests (требуют database)
- Single-use ticket enforcement с CheckIn UNIQUE constraint
- Concurrent check-in atomicity с Serializable transactions
- Invalid/expired/cancelled ticket validation
- Cross-forum check-in prevention

### ❌ End-to-End Tests (требуют live API)
- Forged webhook rejection (без signature)
- Successful payment flow (Order → Payment → Ticket issuance)
- Failed payment handling
- Webhook retry idempotency

## Manual Testing Required

Для полного security audit необходимо провести следующие ручные тесты:

### 1. Forged Webhook Test
```bash
curl -X POST http://localhost:3000/api/v1/payments/webhooks/finik \
  -H "Content-Type: application/json" \
  -d '{"event_type":"payment.succeeded","payment_id":"fake","order_number":"ORD-123","amount":9999,"currency":"KGS"}'
```
**Ожидается:** 401 Unauthorized (signature verification failed)

### 2. Replay Webhook Test
1. Capture valid webhook request
2. Send same request twice within 1 second
3. **Ожидается:** Second request returns `{"success":true,"duplicate":true}`

### 3. Concurrent Webhook Test
```bash
# Terminal 1
curl -X POST http://localhost:3000/api/v1/payments/webhooks/finik \
  -H "X-Finik-Signature: VALID_SIG" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"payment.succeeded",...}' &

# Terminal 2 (immediately)
curl -X POST http://localhost:3000/api/v1/payments/webhooks/finik \
  -H "X-Finik-Signature: VALID_SIG" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"payment.succeeded",...}' &
```
**Ожидается:** One returns `processed:true`, другой `duplicate:true`. Только ОДИН ticket issued.

### 4. Replay Check-in Test
1. Generate valid QR code
2. POST /api/v1/check-in/validate с валидным QR
3. POST /api/v1/check-in/validate с тем же QR
4. **Ожидается:** Second request returns 400 "ALREADY_CHECKED_IN"

### 5. Tampered QR Test
1. GET /api/v1/tickets/{id} to получить qrData
2. Изменить ticketNumber в qrData
3. POST /api/v1/check-in/validate с изменённым QR
4. **Ожидается:** 404 "TICKET_NOT_FOUND" (hash не совпадает)

## Security Notes

⚠️ **WARNING:** Следующие уязвимости все еще присутствуют:

1. **Development Signature Bypass**
   - Location: `app/api/v1/payments/webhooks/finik/route.ts:47`
   - Issue: `ALLOW_UNSIGNED_WEBHOOKS=true` bypasses signature verification
   - **MUST REMOVE BEFORE PRODUCTION**

2. **Finik API Documentation Missing**
   - Signature algorithm not confirmed (assumed HMAC-SHA256)
   - Header name not confirmed (assumed X-Finik-Signature)
   - **BLOCKED until official Finik docs received**

3. **QR Data Exposure in API**
   - Location: `app/api/v1/tickets/[ticketId]/route.ts:128`
   - Issue: Returns plaintext qrData in JSON response
   - **Recommendation:** Return QR image URL only, not raw token

## Test Coverage Summary

| Category | Total | Passed | Status |
|----------|-------|--------|--------|
| Unit Tests (crypto) | 8 | 8 | ✅ 100% |
| Integration Tests (database) | - | - | ⏸️ Skipped |
| E2E Tests (API) | - | - | ⏸️ Manual |

**Overall Status:** ✅ Core crypto functions verified, integration tests require manual execution.
