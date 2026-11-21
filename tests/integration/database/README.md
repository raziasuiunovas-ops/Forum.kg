# Database Integration Tests

## Overview
These tests verify PostgreSQL-specific functionality:
- Transaction isolation levels
- Advisory locks
- Concurrent operations
- Session management
- Rollback behavior

## Prerequisites

### 1. PostgreSQL Test Database
Database integration tests require a **dedicated localhost PostgreSQL database** whose name ends in `_test`.

**Security Requirements:**
- ✅ Must be localhost (`127.0.0.1`, `localhost`, or `::1`)
- ✅ Database name must end with `_test`
- ❌ Cannot use production database
- ❌ Cannot use shared development database

### 2. Environment Variable
Set `TEST_DATABASE_URL` in your environment or `.env.test` file:

```bash
TEST_DATABASE_URL=postgresql://username:password@localhost:5432/forum_kg_test
```

**Format:**
```
postgresql://[user]:[password]@[host]:[port]/[database_name]_test
```

## Setup Instructions

### Option 1: Local PostgreSQL (Recommended for Development)

#### macOS (Homebrew)
```bash
# Install PostgreSQL
brew install postgresql@16
brew services start postgresql@16

# Create test database
createdb forum_kg_test

# Set environment variable
echo 'TEST_DATABASE_URL=postgresql://username@localhost:5432/forum_kg_test' >> .env.test
```

#### Windows
```powershell
# Install PostgreSQL (download from postgresql.org)
# Or use Chocolatey:
choco install postgresql

# Create test database using pgAdmin or command line:
psql -U postgres -c "CREATE DATABASE forum_kg_test;"

# Set environment variable
echo "TEST_DATABASE_URL=postgresql://postgres:password@localhost:5432/forum_kg_test" > .env.test
```

#### Linux (Ubuntu/Debian)
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create test database
sudo -u postgres createdb forum_kg_test

# Set environment variable
echo 'TEST_DATABASE_URL=postgresql://postgres@localhost:5432/forum_kg_test' >> .env.test
```

### Option 2: Docker (Recommended for CI/CD)

```bash
# Start PostgreSQL container
docker run -d \
  --name forum-kg-test-db \
  -e POSTGRES_PASSWORD=test_password \
  -e POSTGRES_DB=forum_kg_test \
  -p 5432:5432 \
  postgres:16-alpine

# Set environment variable
export TEST_DATABASE_URL=postgresql://postgres:test_password@localhost:5432/forum_kg_test

# Or add to .env.test:
echo 'TEST_DATABASE_URL=postgresql://postgres:test_password@localhost:5432/forum_kg_test' >> .env.test
```

**Stop and remove container when done:**
```bash
docker stop forum-kg-test-db
docker rm forum-kg-test-db
```

### Option 3: Neon Test Branch (Cloud)

⚠️ **Warning:** Not recommended because:
- Tests may fail due to network latency
- Cannot use localhost requirement
- Slower than local database

If you must use Neon:
```bash
# Create a separate test database branch in Neon dashboard
# Get the connection string
# Override localhost check temporarily (NOT RECOMMENDED)
```

## Running Database Migrations

Before running tests, ensure the database schema is up to date:

```bash
# Generate Prisma Client
npm run db:generate

# Apply schema to test database
DATABASE_URL=$TEST_DATABASE_URL npx prisma db push

# Verify schema
DATABASE_URL=$TEST_DATABASE_URL npx prisma db pull
```

## Running Tests

### All Integration Tests
```bash
npm run test:integration
```

If `TEST_DATABASE_URL` is not set:
```
✓ API tests pass
✓ Health check tests pass
ℹ Database integration tests skipped: set TEST_DATABASE_URL to a dedicated localhost database ending in _test.
```

If `TEST_DATABASE_URL` is set correctly:
```
✓ API tests pass
✓ Health check tests pass  
✓ Database tests pass
```

### Database Tests Only
```bash
# Compile tests
npx tsc --project tsconfig.test.json

# Run database tests directly
TEST_DATABASE_URL=postgresql://localhost/forum_kg_test node --test .test-dist/tests/integration/database/*.test.js
```

## Test Files

### `session-management.test.ts`
**Purpose:** Verify Session Management security properties

**Tests:**
1. ✅ Reusing rotated refresh token revokes entire family
2. ✅ Two simultaneous refreshes cannot both succeed
3. ✅ Logout racing with refresh leaves no active session
4. ✅ Logout-all racing with refresh revokes all sessions
5. ✅ Creating, refreshing, and logging out 20 sessions works
6. ✅ Advisory lock prevents family lookup + refresh race
7. ✅ Transaction rollback on refresh token collision works

**Requirements:**
- PostgreSQL with Serializable isolation support
- Advisory lock support
- Test database must be empty or contain only test data

**Duration:** ~2-5 seconds per test

### `prisma-readonly.test.ts`
**Purpose:** Verify read-only Prisma Client configuration

**Tests:**
1. ✅ Read operations succeed
2. ✅ Write operations fail with descriptive error

**Requirements:**
- Prisma Client with `driverAdapters` preview feature

**Duration:** <1 second per test

## Troubleshooting

### Error: "TEST_DATABASE_URL is required"
**Solution:** Set the environment variable as described above.

### Error: "Database integration tests are restricted to localhost"
**Cause:** `TEST_DATABASE_URL` points to a remote host or database name doesn't end with `_test`

**Solution:** 
- Use localhost database: `127.0.0.1`, `localhost`, or `::1`
- Ensure database name ends with `_test`

### Error: "connection refused" or "ECONNREFUSED"
**Cause:** PostgreSQL is not running

**Solution:**
```bash
# macOS
brew services start postgresql@16

# Linux
sudo systemctl start postgresql

# Docker
docker start forum-kg-test-db
```

### Error: "relation does not exist"
**Cause:** Database schema not migrated

**Solution:**
```bash
DATABASE_URL=$TEST_DATABASE_URL npx prisma db push
```

### Error: "database does not exist"
**Cause:** Test database not created

**Solution:**
```bash
# Create database
createdb forum_kg_test

# Or with Docker
docker exec -it forum-kg-test-db psql -U postgres -c "CREATE DATABASE forum_kg_test;"
```

### Tests hang or timeout
**Cause:** Database locks or transactions not cleaned up

**Solution:**
```bash
# Kill all connections to test database
psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='forum_kg_test';"

# Drop and recreate database
dropdb forum_kg_test
createdb forum_kg_test
DATABASE_URL=$TEST_DATABASE_URL npx prisma db push
```

## CI/CD Configuration

### GitHub Actions Example
```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: forum_kg_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Generate Prisma Client
        run: npm run db:generate
      
      - name: Apply schema to test database
        run: npx prisma db push
        env:
          DATABASE_URL: postgresql://postgres:test_password@localhost:5432/forum_kg_test
      
      - name: Run tests
        run: npm run test
        env:
          TEST_DATABASE_URL: postgresql://postgres:test_password@localhost:5432/forum_kg_test
```

## Best Practices

### 1. Isolate Test Data
Each test should:
- Create its own test data in `beforeEach`
- Clean up test data in `afterEach`
- Not depend on data from other tests

**Example:**
```typescript
let userId = ''

beforeEach(async () => {
  const user = await prisma.user.create({
    data: { email: `test-${randomUUID()}@example.test` }
  })
  userId = user.id
})

afterEach(async () => {
  await prisma.session.deleteMany({ where: { userId } })
  await prisma.user.delete({ where: { id: userId } })
})
```

### 2. Use Transactions for Cleanup
```typescript
afterEach(async () => {
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } })
  ])
})
```

### 3. Handle Concurrent Tests
If running tests in parallel:
- Use unique identifiers (UUID) for test data
- Avoid global state
- Clean up advisory locks

### 4. Disconnect After Tests
```typescript
after(async () => {
  await prisma.$disconnect()
})
```

## Security Considerations

### Why Localhost Only?
Database integration tests can:
- Create and delete data
- Test transaction rollbacks
- Use advisory locks
- Simulate race conditions

Running these tests against a remote or production database could:
- ❌ Corrupt production data
- ❌ Cause performance issues
- ❌ Expose sensitive information
- ❌ Create security vulnerabilities

### Why Name Must End with `_test`?
Prevents accidental execution against:
- Production databases
- Development databases
- Staging databases

This is a safety mechanism to ensure tests only run against dedicated test databases.

## Alternative: In-Memory Testing

For faster tests without PostgreSQL:
- Consider SQLite in-memory mode (limited Postgres features)
- Use mocks for Prisma Client
- Focus on unit tests for business logic

However, **PostgreSQL-specific features cannot be tested** without real PostgreSQL:
- Serializable isolation
- Advisory locks
- LISTEN/NOTIFY
- Full-text search
- JSON operators

## See Also
- API Integration Tests: `tests/integration/api/README.md`
- Unit Tests: `tests/unit/`
- Transaction Rollback Script: `scripts/test-transaction-rollback.ts`
- Session Management Spec: `CODEX_AUDIT_FIXES.md`
