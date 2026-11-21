# Test Scripts

## Overview
This directory contains manual test scripts for verifying complex transaction behavior and edge cases.

## Scripts

### `test-transaction-rollback.ts`
**Purpose:** Verify OTP Transactional Consistency

Tests that OTP consumption, user creation, and session creation are wrapped in an atomic transaction that rolls back on error.

**Test Scenarios:**
1. ✅ Normal flow: OTP consumed, user created, session created
2. ✅ User creation error: transaction rolls back, OTP NOT consumed
3. ✅ Session creation error: transaction rolls back, OTP NOT consumed
4. ✅ Concurrent requests: only 1 succeeds, OTP consumed atomically

**Requirements:**
- Running dev server on `http://localhost:3000`
- PostgreSQL database (TEST_DATABASE_URL or DATABASE_URL)
- Prisma Client generated

**How to Run:**
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run test script
npx tsx scripts/test-transaction-rollback.ts
```

**Expected Output:**
```
🧪 Testing OTP Transaction Rollback Behavior
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test 1: Normal Flow
✅ SUCCESS: OTP consumed ✅, user created ✅, session created ✅

Test 2: User Creation Error (Duplicate Phone)
✅ SUCCESS: Transaction rolled back, OTP NOT consumed ✅

Test 3: Session Creation Error (Invalid User ID)
✅ SUCCESS: Transaction rolled back, OTP NOT consumed ✅

Test 4: Concurrent OTP Verification
✅ SUCCESS: Only 1 request succeeded, OTP consumed atomically ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All tests passed (4/4)
```

**Why This Is Not an Automated Test:**
This script uses HTTP `fetch()` to test the full request/response cycle including:
- Next.js request handling
- Middleware execution
- Database transactions
- Error handling
- Response serialization

For automated testing, use:
- `tests/integration/database/session-management.test.ts` - Direct Prisma tests
- `tests/unit/validation.test.ts` - Schema validation tests

**Debugging Failed Tests:**

If Test 1 fails:
```bash
# Check if server is running
curl http://localhost:3000/api/v1/health

# Check if database is accessible
psql $DATABASE_URL -c "SELECT 1"

# Check Prisma schema is up to date
npx prisma db push
```

If Test 2 fails:
```
# Verify OTP reuse detection works
# Check consumedAt timestamp in database
psql $DATABASE_URL -c "SELECT id, consumedAt FROM OtpChallenge WHERE phone='+996700000002'"
```

If Test 3 fails:
```
# Verify transaction rollback works
# Check that failed transactions don't leave partial data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM User WHERE phone='+996700000003'"
```

If Test 4 fails:
```
# Verify Serializable isolation prevents race conditions
# Check that only one session was created
psql $DATABASE_URL -c "SELECT COUNT(*) FROM Session WHERE userId IN (SELECT id FROM User WHERE phone='+996700000004')"
```

## Why Manual Test Scripts?

### Advantages
- ✅ Test full HTTP request/response cycle
- ✅ Test Next.js middleware and error handling
- ✅ Test actual production code paths
- ✅ Easy to debug with console.log
- ✅ Can test timing-sensitive race conditions

### Disadvantages
- ❌ Requires running dev server
- ❌ Slow execution (HTTP round-trips)
- ❌ Cannot run in CI/CD without additional setup
- ❌ Flaky (port conflicts, timing issues)
- ❌ Hard to parallelize

## Best Practices

### For Automated Testing
Use direct imports and mocks:
```typescript
// ✅ Good: Direct import
import { POST } from '../app/api/v1/auth/phone/verify-otp/route'
import { NextRequest } from 'next/server'

const request = new NextRequest('http://localhost/api', {
  method: 'POST',
  body: JSON.stringify({ challengeId: '...', code: '123456' })
})

const response = await POST(request)
assert.equal(response.status, 200)
```

### For Manual Testing
Use HTTP fetch with running server:
```typescript
// ✅ Good: For manual smoke tests
const response = await fetch('http://localhost:3000/api/v1/auth/phone/verify-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ challengeId: '...', code: '123456' })
})
```

## Migration Plan

**Short term:** Keep manual scripts for smoke testing before deployment

**Long term:** Convert to proper integration tests:
1. Create test helper for mock NextRequest objects
2. Import route handlers directly
3. Mock Prisma for transaction tests
4. Add to `npm run test:integration`

## Alternative: HTTP Test Files

For manual testing without running scripts, use `.http` files with REST Client:

**Files:**
- `tests/auth-endpoints.http` - Auth flow examples
- `tests/auth-otp-lifecycle.http` - OTP verification flow
- `tests/auth-rbac-fresh-role.http` - RBAC tests

**VS Code Extension:**
Install "REST Client" extension and click "Send Request" above each request.

## See Also
- Integration Tests: `tests/integration/`
- Unit Tests: `tests/unit/`
- Database Tests: `tests/integration/database/README.md`
- API Tests: `tests/integration/api/README.md`
