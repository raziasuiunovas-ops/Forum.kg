# Session Management Security Tests

## Setup

These tests require Jest and test database setup.

### 1. Install dependencies

```bash
npm install --save-dev jest @jest/globals @types/jest ts-jest
```

### 2. Create Jest config

Create `jest.config.js` in project root:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
}
```

### 3. Create test setup file

Create `tests/setup.ts`:

```typescript
// Setup for all tests
process.env.NODE_ENV = 'test'
```

### 4. Setup test database

Add to `.env.test`:

```
TEST_DATABASE_URL="postgresql://user:password@localhost:5432/forum_kg_test"
```

**IMPORTANT**: Use isolated test database, never production or development!

### 5. Add test script to package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

### 6. Run migrations on test database

```bash
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
```

## Running Tests

```bash
# Run all tests
npm test

# Run session security tests only
npm test tests/session/session-security.test.ts

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Test Coverage

### Critical Scenarios Covered:

1. **Concurrent Refresh Prevention**
   - Two simultaneous refresh requests
   - Three-way concurrent refresh
   - Verifies only one child per parent

2. **Token Reuse Detection**
   - After single rotation
   - After multiple rotations
   - Family revocation on reuse

3. **Family Revocation Race Condition**
   - Concurrent refresh during family revocation
   - Verifies no active sessions after revocation

4. **Logout Functionality**
   - Single session logout
   - Logout all devices
   - User isolation (other users unaffected)

5. **Access Token Validation**
   - SessionId in JWT payload
   - Rejection after session revoked

6. **Cleanup Safety**
   - Reuse detection after cleanup
   - Bottom-up deletion respecting FK constraints

7. **Fake Token Protection**
   - Invalid tokens don't revoke families
   - User isolation in reuse detection

## Expected Results

All tests should pass with:
- ✅ Concurrent refresh: Exactly 1 success, others fail
- ✅ Reuse detection: Family revoked with SUSPICIOUS_ACTIVITY
- ✅ Logout: Correct number of sessions revoked
- ✅ Cleanup: No FK constraint errors
- ✅ Access token: Contains sessionId

## Troubleshooting

### Tests fail with "Cannot find module @/lib/..."

Add path mapping to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### Tests fail with database connection error

Verify `TEST_DATABASE_URL` is set and database is accessible.

### Tests fail with Prisma client not generated

Run:

```bash
npx prisma generate
```

### Serializable isolation level errors

If tests fail with serialization errors, it's expected behavior for concurrent scenarios. The retry logic should handle this.

## Manual Verification (Alternative to Automated Tests)

If automated tests cannot be run, verify manually:

### 1. Concurrent Refresh Test

```bash
# Terminal 1
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Cookie: refresh=<token>"

# Terminal 2 (immediately)
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Cookie: refresh=<token>"

# Check database
psql -d forum_kg -c "SELECT id, \"parentSessionId\", \"revokedAt\" FROM \"Session\" WHERE \"parentSessionId\" = '<parent_id>';"

# Expected: Only 1 active child
```

### 2. Reuse Detection Test

```bash
# 1. Login
curl -X POST http://localhost:3000/api/v1/auth/phone/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"...","code":"..."}'

# 2. Refresh (save old token)
OLD_TOKEN="<refresh_token_from_step_1>"
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Cookie: refresh=$OLD_TOKEN"

# 3. Try to use old token again
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Cookie: refresh=$OLD_TOKEN"

# Expected: Error with "token_reuse_detected"
# Check database: All family sessions revoked
```

### 3. Access Token Validation Test

```bash
# 1. Login
curl -X POST http://localhost:3000/api/v1/auth/phone/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"...","code":"..."}'

# 2. Logout
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Cookie: session=<access_token>; refresh=<refresh_token>"

# 3. Try to use old access token
curl -X GET http://localhost:3000/api/v1/auth/session \
  -H "Cookie: session=<old_access_token>"

# Expected: Error "SESSION_REVOKED"
```

## Notes

- Tests use transaction isolation and advisory locks
- Some tests may show timing-dependent behavior
- Run on isolated test database to avoid data corruption
- Tests clean up after themselves (delete test data)
