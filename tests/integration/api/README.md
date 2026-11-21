# API Integration Tests

## Overview
This directory contains integration tests for API endpoints.

## Test Types

### 1. Direct Route Handler Tests (Recommended)
**Files:** `hello.test.ts`, `response.test.ts`, health tests

**Approach:**
- Import route handlers directly
- Call them with mock NextRequest objects
- No HTTP server required
- Fast and reliable

**Example:**
```typescript
import { GET } from '../../../app/api/hello/route'

const response = await GET()
const body = await response.json()
assert.equal(response.status, 200)
```

**Advantages:**
- ✅ No server startup required
- ✅ Fast execution (~100-200ms per test)
- ✅ Reliable in CI/CD
- ✅ Easy to debug

### 2. HTTP Fetch Tests (Legacy, Requires Running Server)
**Files:** `validation.test.ts`

**Approach:**
- Uses `fetch()` to make real HTTP requests
- Requires server running on `http://localhost:3000`
- Tests full request/response cycle

**Example:**
```typescript
const response = await fetch('http://localhost:3000/api/v1/health')
assert.equal(response.status, 200)
```

**Limitations:**
- ❌ Requires `npm run dev` in separate terminal
- ❌ Slow execution (~500-2000ms per test)
- ❌ Flaky in CI/CD (port conflicts, timing issues)
- ❌ Cannot run in parallel with other tests

## Running Tests

### Quick Tests (Direct Imports Only)
```bash
npm run test:integration
```

This runs:
- ✅ `hello.test.ts`
- ✅ `response.test.ts`
- ✅ Health Check tests (`app/api/v1/health/__tests__/health.test.ts`)
- ⚠️ `validation.test.ts` (will FAIL without running server)

**Expected output:**
- Most tests pass
- `validation.test.ts` tests fail with HTTP 500 errors

### Full Tests (With Running Server)
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run tests
npm run test:integration
```

All tests should pass when server is running.

## Recommended Approach

**For new tests, use Direct Route Handler approach:**

1. Import the route handler:
```typescript
import { GET, POST } from '../../../app/api/your-endpoint/route'
```

2. Create mock NextRequest if needed:
```typescript
function request(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(url, options)
}
```

3. Call handler directly:
```typescript
const response = await POST(request('http://localhost/api/endpoint', {
  method: 'POST',
  body: JSON.stringify({ data: 'test' })
}))
```

4. Assert on response:
```typescript
assert.equal(response.status, 200)
const body = await response.json()
assert.equal(body.success, true)
```

## Migration Plan

`validation.test.ts` should be migrated to use direct route imports instead of HTTP fetch. However, this requires:
1. Understanding how to mock Prisma for database-dependent endpoints
2. Handling transaction isolation levels
3. Mocking rate limiters

For now, these tests serve as **smoke tests** that can be run manually before deployment.

## Alternative: Unit Tests for Validation Schemas

Instead of testing full HTTP endpoints, consider testing Zod schemas directly:

**File:** `tests/unit/validation.test.ts`

```typescript
import { requestOtpSchema } from '../../lib/auth/validation'

const result = requestOtpSchema.safeParse({
  phone: '+996700123456',
  purpose: 'LOGIN'
})

assert.ok(result.success)
```

**Advantages:**
- ✅ No server, no database, no mocks required
- ✅ Tests pure validation logic
- ✅ Very fast (<10ms per test)
- ✅ Perfect for CI/CD

## Current Status

| Test File | Type | Server Required | Status |
|-----------|------|----------------|--------|
| `hello.test.ts` | Direct import | ❌ No | ✅ PASS |
| `response.test.ts` | Direct import | ❌ No | ✅ PASS |
| `validation.test.ts` | HTTP fetch | ✅ Yes | ⚠️ SKIP (server not running) |
| `tests/unit/validation.test.ts` | Unit (schemas) | ❌ No | ✅ PASS |
| `app/api/v1/health/__tests__/health.test.ts` | Direct import | ❌ No | ✅ PASS |

## Recommendations

1. **For CI/CD:** Use direct import tests and unit tests only
2. **For pre-deployment:** Run validation.test.ts manually with server
3. **For new features:** Write direct import tests, not HTTP fetch tests
4. **For validation:** Write unit tests for Zod schemas

## See Also
- Unit tests: `tests/unit/`
- Database tests: `tests/integration/database/` (requires TEST_DATABASE_URL)
- HTTP examples: `tests/*.http` (for manual testing with REST Client)
