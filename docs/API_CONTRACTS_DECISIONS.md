# FORUM.KG - Backend API Contracts: Architectural Decisions

**Version:** 1.0  
**Date:** November 19, 2026  
**Status:** Draft for Review  
**Architecture:** Next.js 15 Full-Stack MVP → NestJS Migration (Post-MVP)

---

## 1. Architecture Overview

### 1.1 Confirmed Architecture (MVP)

Based on `docs/ARCHITECTURE_DECISION.md`:

- **Backend:** Next.js 15 API Routes (`app/api/v1/`)
- **Database:** PostgreSQL (Neon Serverless) via Prisma 5.22
- **Worker:** Separate Node.js process with BullMQ
- **Cache/Queue:** Redis + BullMQ
- **Frontend:** Next.js App Router (separate developer)

**Prisma Schema Statistics:**
- Models: 25
- Enums: 21
- Business Rules: BR-01 through BR-20

### 1.2 API URL Structure

✅ **CONFIRMED:** Use `/api/v1/` prefix as specified in Technical Specification Section 19.

**Implementation in Next.js:**
```
app/api/v1/
  ├── auth/
  ├── profile/
  ├── forums/
  ├── orders/
  ├── payments/
  ├── tickets/
  ├── check-in/
  ├── cancellations/
  ├── notifications/
  ├── telegram/
  ├── admin/
  ├── settings/
  └── integrations/
```

### 1.3 Post-MVP Migration

After MVP stabilization:
- Migrate to NestJS monorepo structure
- Separate `apps/web/` and `apps/api/`
- Preserve API contracts for backward compatibility

---

## 2. Data Formats & Standards

### 2.1 UUID Format

- **Prisma:** `@db.Uuid` type
- **API JSON:** String representation
- **Example:** `"550e8400-e29b-41d4-a716-446655440000"`
- **Validation:** UUID v4 format

### 2.2 DateTime Format

✅ **CONFIRMED:** ISO 8601 UTC timestamps

- **Format:** `YYYY-MM-DDTHH:mm:ss.sssZ`
- **Example:** `"2026-11-19T15:30:00.000Z"`
- **Storage:** Prisma `DateTime` (UTC)
- **Display:** Frontend converts to user timezone (Asia/Bishkek for events)
- **Forum-specific times:** Use `forum.timeZone` field for event display

### 2.3 Money/Currency Format

✅ **CONFIRMED:** Integer minor units (tyiyn) in database, explicit units in API

**Prisma Schema:**
```prisma
priceMinor    Int       // KGS tyiyn (100 tyiyn = 1 KGS)
currency      String    @default("KGS")
```

**API Response Format:**
```json
{
  "priceMinor": 50000,
  "currency": "KGS",
  "priceDisplay": "500.00 KGS"
}
```

**Calculation:** `1 KGS = 100 tyiyn`

**Why minor units:**
- Avoid floating-point arithmetic errors
- Precise financial calculations
- Standard practice for payment systems

### 2.4 Locale/Language Format

✅ **CONFIRMED:** Uppercase enum values per Prisma Schema

**Prisma Enum:**
```prisma
enum Locale {
  RU
  KY
  EN
}
```

**API Format:**
- Request: `"RU"`, `"KY"`, or `"EN"` (uppercase)
- Response: Same format
- Default: `"RU"` (Russian)
- HTTP Header: Optional `Accept-Language: ru-KG, ky-KG, en`

### 2.5 Enum Values

✅ **CONFIRMED:** Use Prisma enum values as-is in API

**Mapping:**
- Prisma: `PENDING_PAYMENT`, `PAID`, `CANCELLED`
- API JSON: Same (e.g., `"status": "PENDING_PAYMENT"`)
- No transformation between API and database

**All Enums:** See Prisma Schema for complete list (21 enums)

---

## 3. API Response Formats

### 3.1 Success Response Format

**Single Resource:**
```json
{
  "id": "uuid",
  "field1": "value",
  "field2": 123,
  "createdAt": "2026-11-19T15:30:00.000Z"
}
```

**Collection (with pagination):**
```json
{
  "data": [
    { "id": "uuid1", ... },
    { "id": "uuid2", ... }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**No wrapper for single resources** (simpler for Frontend)

### 3.2 Error Response Format

✅ **CONFIRMED:** Consistent error structure

```json
{
  "error": {
    "code": "CAPACITY_EXCEEDED",
    "message": "Недостаточно билетов",
    "details": {
      "requested": 2,
      "available": 1,
      "forumId": "uuid"
    }
  }
}
```

**Fields:**
- `code` (required): Machine-readable error code (UPPER_SNAKE_CASE)
- `message` (required): Human-readable, localized error message
- `details` (optional): Additional context for debugging

**Localization:**
- `message` localized based on user's `preferredLocale`
- `code` always English for Frontend error handling

### 3.3 Validation Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Ошибка валидации данных",
    "details": {
      "fields": {
        "participantFirstName": "Обязательное поле",
        "items": "Должно содержать минимум 1 элемент"
      }
    }
  }
}
```

---

## 4. HTTP Status Codes

### 4.1 Success Codes

| Code | Usage |
|------|-------|
| `200 OK` | Successful GET, PATCH, DELETE |
| `201 Created` | Successful POST (resource created) |
| `204 No Content` | Successful DELETE (no response body) |

### 4.2 Client Error Codes

| Code | Usage | Error Code Examples |
|------|-------|---------------------|
| `400 Bad Request` | Malformed request | `INVALID_REQUEST` |
| `401 Unauthorized` | Missing/invalid auth | `INVALID_TOKEN`, `SESSION_EXPIRED` |
| `403 Forbidden` | Insufficient permissions | `INSUFFICIENT_PERMISSIONS`, `ROLE_REQUIRED` |
| `404 Not Found` | Resource not found | `FORUM_NOT_FOUND`, `ORDER_NOT_FOUND` |
| `409 Conflict` | Business logic conflict | `CAPACITY_EXCEEDED`, `TICKET_ALREADY_USED` |
| `422 Unprocessable Entity` | Validation failed | `VALIDATION_ERROR` |
| `429 Too Many Requests` | Rate limit exceeded | `RATE_LIMIT_EXCEEDED` |

### 4.3 Server Error Codes

| Code | Usage |
|------|-------|
| `500 Internal Server Error` | Unexpected server error |
| `502 Bad Gateway` | External service error (e.g., Finik) |
| `503 Service Unavailable` | Temporary unavailability |

---

## 5. Pagination

### 5.1 Format

✅ **CONFIRMED:** Offset-based pagination for MVP

**Query Parameters:**
```
?page=1&limit=20
```

**Defaults:**
- `page`: 1 (first page)
- `limit`: 20 items
- `maxLimit`: 100 items

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 5.2 Future Enhancement

**Post-MVP:** Consider cursor-based pagination for large datasets (orders, notifications)

---

## 6. Authentication & Sessions

### 6.1 Authentication Methods

✅ **CONFIRMED per Technical Specification Section 6.2:**

1. **Google OAuth:** OpenID Connect
2. **Phone OTP:** SMS verification

### 6.2 Session Management

⚠️ **NEEDS DECISION:** Session storage mechanism not explicitly defined in TS Spec.

**Requirements from TS Spec Section 6.3:**
- Secure sessions (HttpOnly and Secure cookies)
- CSRF protection where applicable
- Session expiration

**Options:**

**Option A: JWT + Redis (Recommended)**
- Access token: JWT (15 min expiry)
- Refresh token: Stored in Redis (7 days)
- HttpOnly, Secure cookies
- CSRF protection via SameSite=Strict

**Option B: Server-side sessions**
- Session ID in HttpOnly cookie
- Session data in Redis
- More secure, revokable
- Requires Redis for every request

**Option C: Pure JWT**
- Stateless
- No Redis dependency
- Cannot revoke before expiry

**Recommendation:** Option A (JWT + Redis refresh tokens)

**Requires:** Client decision

### 6.3 Session Cookie Format

```
Set-Cookie: session=<jwt_token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900
Set-Cookie: refresh=<refresh_token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=604800
```

### 6.4 Authentication Header

**For API calls from mobile/external clients:**
```
Authorization: Bearer <jwt_token>
```

**Cookie-based (web):**
- Automatic from browser

---

## 7. Authorization (RBAC)

### 7.1 User Roles

✅ **CONFIRMED per Prisma Schema:**

```prisma
enum UserRole {
  USER
  SCANNER
  MANAGER
  SUPER_ADMIN
}
```

### 7.2 Role Permissions

| Role | Permissions |
|------|-------------|
| `USER` | Browse forums, purchase tickets, view own orders/tickets, submit cancellation requests, manage profile |
| `SCANNER` | Validate QR codes for assigned forums, view check-in stats for assigned forums |
| `MANAGER` | Manage forums, view/manage orders, approve/reject cancellations, view analytics (no user management, no system settings) |
| `SUPER_ADMIN` | Full system access including user management, role assignment, system settings, integration configuration |

### 7.3 Endpoint Protection

**Public:**
- `GET /api/v1/forums` (published forums)
- `GET /api/v1/forums/{slug}`
- `GET /api/v1/settings` (public site settings)

**Authenticated (any role):**
- `GET /api/v1/profile`
- `POST /api/v1/orders`
- `GET /api/v1/tickets`

**Role-specific:**
- `POST /api/v1/admin/forums` → `MANAGER` or `SUPER_ADMIN`
- `POST /api/v1/check-in/validate` → `SCANNER`, `MANAGER`, or `SUPER_ADMIN`
- `PATCH /api/v1/admin/users/{id}/role` → `SUPER_ADMIN` only

### 7.4 Ownership Checks

Beyond role checks, verify resource ownership:
- Orders: `order.userId === currentUser.id`
- Tickets: `ticket.buyerId === currentUser.id`
- Cancellations: `cancellation.requesterId === currentUser.id`

---

## 8. Idempotency

### 8.1 Critical Endpoints Requiring Idempotency

✅ **CONFIRMED per Technical Specification Section 11.1:**

1. **Payment Webhook:** `POST /api/v1/webhooks/finik`
   - Use `dedupeKey` from webhook
   - Store in `PaymentWebhookEvent` table

2. **Order Creation:** `POST /api/v1/orders`
   - Optional `Idempotency-Key` header
   - Prevent duplicate orders within 24 hours

3. **Check-in:** `POST /api/v1/check-in/validate`
   - Database-level UNIQUE constraint on `ticketId`
   - Atomic operation

### 8.2 Idempotency-Key Header

**Format:**
```
Idempotency-Key: <uuid>
```

**Behavior:**
- If key seen within 24h → return cached response (200 or 201)
- If key not seen → process request, cache response
- Storage: Redis (24h TTL)

---

## 9. Validation

### 9.1 Validation Library

✅ **CONFIRMED:** Zod (already in package.json)

### 9.2 Common Validation Rules

**UUID:**
```typescript
z.string().uuid()
```

**Phone (E.164 format):**
```typescript
z.string().regex(/^\+996\d{9}$/) // Kyrgyzstan
```

**Email:**
```typescript
z.string().email().max(255).optional()
```

**Name fields:**
```typescript
z.string().min(1).max(100)
```

**Locale:**
```typescript
z.enum(["RU", "KY", "EN"])
```

### 9.3 Business Rule Validations

See OpenAPI spec for specific endpoint validations.

---

## 10. Rate Limiting

### 10.1 Requirements

✅ **CONFIRMED per Technical Specification Section 6.3:**

- OTP expiration
- OTP resend limits
- OTP attempt limits
- General API rate limits

### 10.2 Rate Limit Rules

⚠️ **NEEDS SPECIFIC NUMBERS:** Exact limits not defined in TS Spec.

**Proposed:**

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/v1/auth/phone/request-otp` | 3 requests | 10 minutes per phone |
| `POST /api/v1/auth/phone/verify-otp` | 5 attempts | Per OTP challenge |
| `POST /api/v1/orders` | 10 requests | 1 minute per user |
| Global API | 100 requests | 1 minute per IP |

**Storage:** Redis

**Response when exceeded:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Слишком много запросов. Попробуйте позже.",
    "details": {
      "retryAfter": 120
    }
  }
}
```

**HTTP Header:**
```
Retry-After: 120
```

**Requires:** Client approval of specific limits

---

## 11. Security Requirements

### 11.1 Authentication Security

✅ **CONFIRMED per TS Spec Section 6.3:**

- One verified phone per active account
- OTP expiration (5 minutes recommended)
- OTP attempt limits
- Secure password hashing (bcrypt, 10 rounds)
- HTTPS only in production

### 11.2 Session Security

✅ **CONFIRMED:**

- HttpOnly cookies (prevent XSS)
- Secure flag (HTTPS only)
- SameSite=Strict (CSRF protection)
- Session expiration

### 11.3 Payment Security

🔴 **CRITICAL per TS Spec Section 11.1:**

- Server-side payment creation only
- Never expose Finik credentials to client
- Verify webhook signature
- Validate amount, currency, orderId
- Idempotent webhook processing
- No tickets until payment verified

### 11.4 QR Security

✅ **CONFIRMED per TS Spec Section 12.1:**

- QR token must NOT contain plain personal data
- Use unpredictable token (crypto random)
- Store hash for verification (`qrTokenHash`)
- Store encrypted token for re-delivery (`qrTokenEncrypted`)
- One-time use enforcement (database constraint)

### 11.5 Input Validation

- Validate all inputs with Zod
- Sanitize user-generated content
- Maximum length enforcement
- SQL injection prevention (Prisma parameterized queries)

### 11.6 Data Privacy

**Never expose in API responses:**
- `qrTokenEncrypted` field
- Raw OTP codes (`OtpChallenge.codeHash` only)
- Other users' phone numbers
- Other users' email addresses
- Payment provider credentials
- Internal system tokens

---

## 12. Business Rules Coverage

### 12.1 Implemented Business Rules

| BR | Rule | Endpoints |
|----|------|-----------|
| BR-01 | One account → multiple forums | `POST /api/v1/orders` validation |
| BR-02 | Default 1 ticket per forum per account | `POST /api/v1/orders` validation |
| BR-03 | Admin sets custom limit per forum | `POST /api/v1/admin/forums`, `PATCH /api/v1/admin/forums/{id}` |
| BR-04 | Participant names for each ticket | `POST /api/v1/orders` request validation |
| BR-05 | Multiple categories (Standard/VIP) | `POST /api/v1/admin/forums/.../categories` |
| BR-06 | No ticket upgrades after purchase | No upgrade endpoint |
| BR-07 | Tickets only after verified payment | Internal: Webhook → Ticket generation |
| BR-08 | Unique QR per ticket | Internal: Ticket generation with unique token |
| BR-09 | One-time QR check-in | `POST /api/v1/check-in/validate` (atomic) |
| BR-10 | QR sufficient for admission | `POST /api/v1/check-in/validate` logic |
| BR-11 | Admin sets QR expiration | `POST /api/v1/admin/forums` (qrExpiresAt field) |
| BR-12 | Expired QR → error response | `GET /api/v1/tickets/{id}` returns expiration status |
| BR-13 | Cancellation requests → Admin | `POST /api/v1/cancellations` |
| BR-14 | Approved cancellation → slot available | Internal: Update logic |
| BR-15 | Publish forum → notify all users | Internal: Background job |
| BR-16 | Google users → verify phone | `POST /api/v1/auth/phone/verify-required` |
| BR-17 | RU/KY/EN support | All endpoints accept `Locale` enum |
| BR-18 | Editable branding | `PATCH /api/v1/admin/settings` |
| BR-19 | Neon PostgreSQL | Architecture |
| BR-20 | Tickets in dashboard if Telegram fails | `GET /api/v1/profile/tickets` always available |

### 12.2 Business Rules Requiring Internal Logic

Not exposed as public endpoints:
- BR-07: Ticket generation (internal after webhook)
- BR-08: QR generation (internal)
- BR-14: Slot release (internal update)
- BR-15: Notification creation (internal background job)

---

## 13. Open Decisions

### 13.1 Refund Policy

**Status:** ⚠️ NOT FINALIZED per TS Spec Section 11.3

**Question:** Manual refunds or automatic Finik API refunds?

**Affected Endpoints:**
- `POST /api/v1/admin/cancellations/{id}/approve`
- `GET /api/v1/admin/refunds` (if exists)

**Options:**
A. Manual refunds (tracked in system, executed outside)
B. Automatic Finik API refunds (requires Finik refund API)

**Can implement without decision:**
- ✅ Cancellation request/approval workflow
- ✅ `Refund` table tracking
- ❌ Automatic refund execution

**Recommendation:** Start with Option A (manual), add Option B when Finik API confirmed.

---

### 13.2 Cancellation Granularity

**Status:** ⚠️ OPEN DECISION per TS Spec Section 23.2

**Question:** Cancel entire order or individual tickets?

**Affected Endpoints:**
- `POST /api/v1/cancellations`

**Prisma Schema supports both:**
```prisma
ticketId  String?  @db.Uuid  // NULL = whole order
```

**Options:**
A. Order-level only (simpler)
B. Ticket-level (more flexible)
C. Both

**Can implement without decision:**
- ✅ Start with Option A (order-level)
- ✅ Prisma schema ready for Option C

**Recommendation:** Option A for MVP, Option C post-MVP.

---

### 13.3 SMS Provider Selection

**Status:** ⚠️ NOT SELECTED per TS Spec Section 6.3, 23.3

**Question:** Which SMS provider for Kyrgyzstan?

**Affected Endpoints:**
- `POST /api/v1/auth/phone/request-otp`

**Options:**
- Twilio
- Vonage
- Local Kyrgyzstan provider
- Other

**Can implement without decision:**
- ✅ Mock SMS provider interface
- ✅ Log OTP to console in development
- ❌ Production OTP sending

**Blocks:** Production deployment

---

### 13.5 Admin Refund Management Endpoints

**Status:** ⚠️ OPEN DECISION

**Question:** Should MVP include admin endpoints for viewing refund history?

**Context:**
- Refund policy not finalized (manual vs automatic)
- `Refund` model exists in Prisma Schema
- Current API has `POST /api/v1/payments/{paymentId}/refund` for initiating refunds
- Missing: endpoints for viewing refund list and details

**Proposed Endpoints:**
- `GET /api/v1/admin/refunds` → List all refunds (filtered, paginated)
- `GET /api/v1/admin/refunds/{refundId}` → Refund details

**Options:**
A. Add refund viewing endpoints in MVP
B. Defer to post-MVP (refunds tracked in DB, viewed via admin panel UI or direct DB queries)

**Can implement without decision:**
- ✅ Refund tracking in database
- ✅ Refund initiation endpoint
- ❌ Admin refund list/details API endpoints

**Recommendation:** Option B (defer to post-MVP). Refunds are rare events, can be managed through direct DB access initially.

---

### 13.6 Finik Integration Details

**Status:** 🔴 BLOCKED_BY_PROVIDER_DOCUMENTATION

**Unknown:**
1. Payment creation API endpoint
2. Payment creation request payload
3. Webhook payload structure
4. Webhook signature algorithm (HMAC-SHA256? RSA?)
5. Webhook event types
6. Refund API (if exists)
7. Test/sandbox environment

**Affected Endpoints:**
- `POST /api/v1/payments/create`
- `POST /api/v1/webhooks/finik`

**Can implement without documentation:**
- ✅ Mock Finik client interface
- ✅ Assumed webhook payload structure
- ✅ Assumed signature verification
- ❌ Real payment processing

**Blocks:** Production payments

**Marked in OpenAPI as:** `BLOCKED_BY_PROVIDER_DOCUMENTATION`

---

### 13.7 Google OAuth Credentials

**Status:** ⚠️ NOT PROVIDED

**Affected Endpoints:**
- `GET /api/v1/auth/google`
- `POST /api/v1/auth/google/callback`

**Required:**
- Google Cloud Project Client ID
- Client Secret
- Authorized redirect URIs

**Can implement without credentials:**
- ✅ OAuth flow code
- ❌ Testing Google login

**Blocks:** Google authentication testing

---

### 13.8 Session Implementation

**Status:** ⚠️ NEEDS DECISION

**Question:** JWT + Redis or pure server-side sessions?

**Affected:** All authenticated endpoints

**Recommendation:** JWT + Redis refresh tokens (see Section 6.2)

**Requires:** Client approval

---

### 13.9 Participant Name Correction

**Status:** ⚠️ OPEN DECISION per TS Spec Section 23.7

**Question:** Allow editing participant names after purchase?

**Affected Endpoints:**
- `PATCH /api/v1/tickets/{id}` (if exists)

**Options:**
A. No edits (simplest, prevent fraud)
B. Allow edits before check-in
C. Allow edits with admin approval

**Recommendation:** Option A for MVP

---

### 13.8 Sales Window Closure

**Status:** ⚠️ OPEN DECISION per TS Spec Section 23.9

**Question:** When does ticket sales close?

**Affected Endpoints:**
- `POST /api/v1/orders` validation

**Options:**
A. At `forum.startsAt`
B. At custom `forum.salesCloseAt`
C. At `forum.endsAt`

**Can implement without decision:**
- ✅ Use Option A (startsAt) as default

---

### 13.9 Offline Admission Authorization

**Status:** ⚠️ OPEN DECISION per TS Spec Section 12.6, 23.6

**Question:** Who can authorize offline admissions?

**Affected Endpoints:**
- `POST /api/v1/admin/offline-admissions`

**Options:**
A. MANAGER + SUPER_ADMIN only
B. SCANNER + MANAGER + SUPER_ADMIN
C. SUPER_ADMIN only

**Recommendation:** Option A

---

## 14. Provider Dependencies

### 14.1 Finik (Payment Gateway)

**Status:** 🔴 BLOCKED_BY_PROVIDER_DOCUMENTATION

**What we have:**
- ✅ Credentials in `.env`:
  - `FINIK_ENV=prod`
  - `FINIK_API_KEY`
  - `FINIK_ACCOUNT_ID`
  - `FINIK_PRIVATE_KEY`

**What we need:**
- ❌ API documentation
- ❌ Webhook payload specification
- ❌ Signature verification algorithm
- ❌ SDK (if exists)
- ❌ Sandbox/test environment access

**Workaround:** Mock Finik client for MVP development

**Blocks:** Production payments

---

### 14.2 SMS Provider

**Status:** ⚠️ NOT SELECTED

**What we need:**
- ❌ Provider selection
- ❌ API credentials
- ❌ API documentation
- ❌ Kyrgyzstan coverage confirmation
- ❌ Cost per SMS

**Workaround:** Mock SMS (console.log OTP) for MVP development

**Blocks:** Production OTP verification

---

### 14.3 Google OAuth

**Status:** ⚠️ CREDENTIALS NOT PROVIDED

**What we have:**
- ✅ Official Google OAuth documentation

**What we need:**
- ❌ Client ID
- ❌ Client Secret
- ❌ Authorized redirect URIs configuration

**Workaround:** Can implement OAuth flow, cannot test

**Blocks:** Google authentication

---

### 14.4 Telegram Bot

**Status:** ✅ READY

**What we have:**
- ✅ Bot created: @Forum_kg_bot
- ✅ Credentials in `.env`:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_BOT_ID`
  - `TELEGRAM_BOT_USERNAME`
- ✅ Official Telegram Bot API documentation

**Can implement:** Full Telegram integration

---

### 14.5 Redis

**Status:** ⚠️ NOT CONFIGURED

**Required for:**
- Session storage (refresh tokens)
- Rate limiting
- BullMQ queues
- Cache

**What we need:**
- ❌ Redis instance (local or cloud)
- ❌ Connection URL

**Workaround:** In-memory storage for development

**Blocks:** Production rate limiting, sessions, background jobs

---

### 14.6 Neon Object Storage

**Status:** ✅ READY

**What we have:**
- ✅ Credentials in `.env`:
  - `AWS_ENDPOINT_URL_S3`
  - `AWS_ACCESS_KEY_ID` (Neon format)
  - `AWS_SECRET_ACCESS_KEY` (Neon format)
  - `AWS_REGION`
- ✅ SDK installed: `@aws-sdk/client-s3`

**Can implement:** File uploads (banners, logos)

---

## 15. Implementation Readiness Summary

| Module | Endpoints | Status | Blocker |
|--------|-----------|--------|---------|
| Authentication | 7 | READY_WITH_MOCK | SMS provider |
| Profile | 8 | READY | None |
| Users (Admin) | 5 | READY | None |
| Forums | 10 | READY | None |
| Ticket Categories | 6 | READY | None |
| Orders | 8 | READY | Complex logic |
| Payments | 6 | BLOCKED_BY_PROVIDER | Finik docs |
| Tickets | 6 | READY | Depends on payments |
| Check-in | 5 | READY | None |
| Cancellations | 6 | READY_WITH_MOCK | Refund policy |
| Notifications | 5 | READY | None |
| Telegram | 4 | READY | None |
| Admin Dashboard | 10 | READY | None |
| Site Settings | 8 | READY | None |
| Integrations | 5 | READY | None |

**Total Endpoints (estimate):** ~100

**Development can start for:** All modules except real payment processing

**Production blockers:** Finik docs, SMS provider, Google OAuth credentials, Redis setup

---

## 16. Next Steps

1. ✅ Review this decisions document
2. ✅ Review OpenAPI specification (`docs/openapi.yaml`)
3. ⚠️ Decide on open questions (Sections 13.1-13.9)
4. ⚠️ Obtain provider documentation/credentials (Section 14)
5. ✅ Begin implementation with mocks for blocked providers
6. ⚠️ Replace mocks with real integrations when unblocked

---

**Document Status:** Ready for review  
**Next Review:** After client decisions on open questions
