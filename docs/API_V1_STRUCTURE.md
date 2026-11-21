# API v1 Structure for FORUM.KG

**Статус:** Рекомендация для реализации  
**Базовый путь:** `/api/v1/`  
**Соответствие:** OpenAPI 3.0.3 spec (`docs/openapi.yaml`)

---

## Рекомендуемая структура Next.js App Router

```
app/api/v1/
├── auth/                     # Authentication endpoints
├── profile/                  # User profile management
├── forums/                   # Public forum endpoints
├── orders/                   # Order management
├── payments/                 # Payment webhooks
├── tickets/                  # Ticket management
├── check-in/                 # QR validation
├── cancellations/            # Cancellation requests
├── notifications/            # User notifications
├── telegram/                 # Telegram integration
├── admin/                    # Admin endpoints (RBAC protected)
├── settings/                 # Site settings
└── integrations/             # Integration health monitoring
```

---

## Соответствие OpenAPI

### Базовый путь

OpenAPI servers:
```yaml
servers:
  - url: http://localhost:3000/api/v1
  - url: https://forum.kg/api/v1
```

Next.js автоматически создаёт routes на основе файловой структуры `app/api/v1/`.

### Примеры соответствия

| OpenAPI Path | Next.js File | URL |
|--------------|--------------|-----|
| `POST /auth/phone/request-otp` | `app/api/v1/auth/phone/request-otp/route.ts` | `http://localhost:3000/api/v1/auth/phone/request-otp` |
| `GET /forums/{slug}` | `app/api/v1/forums/[slug]/route.ts` | `http://localhost:3000/api/v1/forums/it-forum-2026` |
| `POST /admin/forums` | `app/api/v1/admin/forums/route.ts` | `http://localhost:3000/api/v1/admin/forums` |

---

## Dynamic Routes (Path Parameters)

**OpenAPI:** `/forums/{slug}`  
**Next.js:** `app/api/v1/forums/[slug]/route.ts`

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params
  // Get forum by slug
}
```

---

## HTTP Methods

```typescript
// app/api/v1/profile/route.ts

export async function GET(request: NextRequest) {
  // GET /api/v1/profile - Get user profile
}

export async function PATCH(request: NextRequest) {
  // PATCH /api/v1/profile - Update profile
}
```

---

## Query Parameters

```typescript
import { parsePaginationParams } from '@/lib/api/schemas/common'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // Manual parsing
  const status = searchParams.get('status')
  
  // Or use Zod helper
  const { page, limit } = parsePaginationParams(searchParams)
}
```

---

## Request Body Validation

```typescript
import { safeJsonParse, withErrorHandler } from '@/lib/api/errorHandler'
import { createOrderSchema } from '@/lib/api/schemas/orders'

export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = await safeJsonParse(request)
  const validatedData = createOrderSchema.parse(body) // Auto throws ValidationError
  
  // Process order
})
```

---

## Authentication

### Cookie-based (Web)

```typescript
import { requireSession } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  const session = await requireSession() // Throws UnauthorizedError if missing
  const userId = session.userId
  
  // Fetch user data
}
```

### Bearer Token (Mobile/API)

```typescript
import { verifyAccessToken } from '@/lib/auth/session'
import { UnauthorizedError } from '@/lib/api/errors'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError()
  }
  
  const token = authHeader.slice(7)
  const session = verifyAccessToken(token)
  
  // Use session.userId
}
```

---

## RBAC Protection

```typescript
import { requireSession } from '@/lib/auth/session'
import { ForbiddenError } from '@/lib/api/errors'
import { UserRole } from '@prisma/client'

export async function POST(request: NextRequest) {
  const session = await requireSession()
  
  // Check required role (from OpenAPI RBAC descriptions)
  const allowedRoles = [UserRole.MANAGER, UserRole.SUPER_ADMIN]
  
  if (!allowedRoles.includes(session.role)) {
    throw new ForbiddenError('Требуется роль MANAGER или SUPER_ADMIN')
  }
  
  // Business logic
}
```

---

## Error Handling

### Using withErrorHandler wrapper

```typescript
import { withErrorHandler } from '@/lib/api/errorHandler'
import { success, notFound } from '@/lib/api/response'
import { NotFoundError } from '@/lib/api/errors'

export const GET = withErrorHandler(async (request: NextRequest) => {
  const forum = await prisma.forum.findUnique({ where: { slug } })
  
  if (!forum) {
    throw new NotFoundError('Forum')
  }
  
  return success(forum)
})
```

### Manual error handling

```typescript
export async function GET(request: NextRequest) {
  try {
    // Business logic
    return success(data)
  } catch (error) {
    return handleApiError(error)
  }
}
```

---

## Response Formatting

```typescript
import { 
  success, 
  created, 
  paginated, 
  noContent 
} from '@/lib/api/response'

// GET - Single resource
return success({ id: '...', name: '...' })

// POST - Created resource
return created({ id: '...', name: '...' })

// GET - Paginated list
return paginated(
  items,
  { page: 1, limit: 20, total: 150, totalPages: 8 }
)

// DELETE - No content
return noContent()
```

---

## Webhook Security

```typescript
// app/api/v1/payments/webhook/finik/route.ts

export async function POST(request: NextRequest) {
  const signature = request.headers.get('X-Finik-Signature')
  const rawBody = await request.text()
  
  // Verify signature (algorithm from Finik API docs)
  const isValid = verifyFinikSignature(rawBody, signature)
  
  if (!isValid) {
    throw new UnauthorizedError('Invalid signature', 'INVALID_SIGNATURE')
  }
  
  const payload = JSON.parse(rawBody)
  
  // Process webhook idempotently
  await processPaymentWebhook(payload)
  
  return success({ received: true })
}
```

---

## Idempotency Keys

```typescript
// app/api/v1/orders/route.ts

export async function POST(request: NextRequest) {
  const idempotencyKey = request.headers.get('Idempotency-Key')
  
  if (idempotencyKey) {
    // Check cache (Redis recommended)
    const cached = await getCachedResponse(idempotencyKey)
    if (cached) {
      return NextResponse.json(cached)
    }
  }
  
  // Create order
  const order = await createOrder(data)
  
  if (idempotencyKey) {
    // Cache for 24 hours
    await cacheResponse(idempotencyKey, order, 86400)
  }
  
  return created(order)
}
```

---

## Не создавать сейчас

На текущем этапе (подготовка инфраструктуры) **НЕ СОЗДАВАТЬ**:

- ❌ Директории `app/api/v1/*` (будут созданы при реализации модулей)
- ❌ Конкретные route handlers
- ❌ Бизнес-логику сервисов
- ❌ Интеграции с внешними API
- ❌ Миграцию существующих endpoints

---

## Следующие шаги

После завершения инфраструктуры:

1. **Модуль Auth** — создать `app/api/v1/auth/` с endpoints:
   - Google OAuth flow
   - Phone OTP flow
   - Refresh token
   - Logout

2. **Модуль Profile** — создать `app/api/v1/profile/`

3. **Модуль Forums** — создать `app/api/v1/forums/`

4. И так далее...

---

## Пример полного endpoint

```typescript
// app/api/v1/forums/[slug]/route.ts

import { NextRequest } from 'next/server'
import { withErrorHandler } from '@/lib/api/errorHandler'
import { success } from '@/lib/api/response'
import { NotFoundError } from '@/lib/api/errors'
import { prisma } from '@/lib/db'
import { ForumStatus } from '@prisma/client'

/**
 * GET /api/v1/forums/{slug}
 * Get published forum by slug
 * Public endpoint (no auth required)
 */
export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: { slug: string } }
) => {
  const { slug } = params
  
  const forum = await prisma.forum.findFirst({
    where: {
      slug,
      status: ForumStatus.PUBLISHED,
    },
    include: {
      translations: true,
      categories: {
        include: {
          translations: true,
        },
      },
    },
  })
  
  if (!forum) {
    throw new NotFoundError('Forum')
  }
  
  return success(forum)
})
```

---

## Заключение

Эта структура обеспечивает:

✅ Соответствие OpenAPI 3.0.3 specification  
✅ Поддержку всех 77 операций  
✅ Централизованную обработку ошибок  
✅ Типобезопасность с TypeScript  
✅ RBAC protection для admin endpoints  
✅ Консистентный формат ответов  
✅ Простоту расширения и поддержки

