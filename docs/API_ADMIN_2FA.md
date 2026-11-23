# Admin 2FA API Documentation

## Overview

Two-factor authentication (2FA) для администраторов FORUM.KG через Telegram Bot.

**Security Features:**
- ✅ 6-digit cryptographically secure codes
- ✅ 5-minute code expiry
- ✅ One-time use (codes deleted after verification)
- ✅ Rate limiting (3 login attempts per 15 minutes)
- ✅ Verification attempts limit (3 per code)
- ✅ HttpOnly cookies (CSRF protection)
- ✅ Bcrypt password hashing
- ✅ Security audit logging

---

## Authentication Flow

1. **Step 1:** POST `/api/v1/admin/login` with username + password
   - Backend verifies credentials
   - Generates 6-digit code
   - Sends code via Telegram
   - Returns `pendingToken`

2. **Step 2:** POST `/api/v1/admin/verify-2fa` with pendingToken + code
   - Backend verifies code
   - Creates admin session
   - Sets HttpOnly cookies
   - Returns user data

---

## Endpoints

### 1. POST /api/v1/admin/login

**Шаг 1: Проверка credentials и отправка 2FA кода**

#### Request

```typescript
interface LoginRequest {
  username: string  // Admin username (case-insensitive)
  password: string  // Admin password
}
```

```http
POST /api/v1/admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-secure-password"
}
```

#### Success Response (200 OK)

```typescript
interface LoginSuccessResponse {
  success: true
  message: string
  data: {
    pendingToken: string      // Token for verification step (valid 10 minutes)
    expiresInSeconds: number  // Code expiry in seconds (300 = 5 minutes)
  }
}
```

```json
{
  "success": true,
  "message": "Код подтверждения отправлен в Telegram",
  "data": {
    "pendingToken": "base64url-encoded-token",
    "expiresInSeconds": 300
  }
}
```

#### Error Responses

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | `INVALID_REQUEST` | Неверный формат запроса | Invalid JSON or missing fields |
| 401 | `INVALID_CREDENTIALS` | Неверный логин или пароль | Wrong username or password (generic) |
| 429 | `RATE_LIMIT_EXCEEDED` | Слишком много попыток входа. Попробуйте через 15 минут | 3 attempts exceeded |
| 500 | `SERVICE_UNAVAILABLE` | Аутентификация администратора не настроена | Missing env config |
| 500 | `SERVICE_ERROR` | Не удалось отправить код подтверждения | Telegram API failure |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка сервера | Unexpected error |

---

### 2. POST /api/v1/admin/verify-2fa

**Шаг 2: Проверка 2FA кода и создание сессии**

#### Request

```typescript
interface VerifyRequest {
  pendingToken: string  // Token received from /admin/login
  code: string          // 6-digit code from Telegram
}
```

```http
POST /api/v1/admin/verify-2fa
Content-Type: application/json

{
  "pendingToken": "token-from-step-1",
  "code": "123456"
}
```

#### Success Response (200 OK)

```typescript
interface VerifySuccessResponse {
  success: true
  message: string
  data: {
    user: {
      id: string
      email: string
      role: 'SUPER_ADMIN'
      firstName: string
      lastName: string
    }
    session: {
      expiresAt: string  // ISO 8601 timestamp
    }
  }
}
```

```json
{
  "success": true,
  "message": "Аутентификация успешна",
  "data": {
    "user": {
      "id": "uuid",
      "email": "admin@admin.forum.kg",
      "role": "SUPER_ADMIN",
      "firstName": "Admin",
      "lastName": "System"
    },
    "session": {
      "expiresAt": "2026-11-23T01:00:00.000Z"
    }
  }
}
```

**Cookies Set:**
- `session` - Access token (HttpOnly, Secure in prod, 15 minutes)
- `refresh` - Refresh token (HttpOnly, Secure in prod, 7 days, path: `/api/v1/auth`)

#### Error Responses

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | `INVALID_REQUEST` | Неверный формат запроса | Missing pendingToken or code |
| 401 | `INVALID_TOKEN` | Недействительный токен или сессия истекла | Invalid or expired pendingToken |
| 401 | `CODE_EXPIRED` | Код подтверждения истёк | Code expired (5 minutes) |
| 401 | `INVALID_CODE` | Неверный код подтверждения | Wrong code |
| 401 | `TOO_MANY_ATTEMPTS` | Слишком много неверных попыток | 3 verification attempts exceeded |
| 403 | `ACCOUNT_SUSPENDED` | Аккаунт администратора заблокирован | Admin user suspended |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка сервера | Unexpected error |

---

## Frontend Implementation Example

### React with fetch

```typescript
// Step 1: Login
async function adminLogin(username: string, password: string) {
  const response = await fetch('/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Important for cookies
    body: JSON.stringify({ username, password })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error.message)
  }

  const data = await response.json()
  return data.data.pendingToken
}

// Step 2: Verify 2FA
async function verify2FA(pendingToken: string, code: string) {
  const response = await fetch('/api/v1/admin/verify-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Important for cookies
    body: JSON.stringify({ pendingToken, code })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error.message)
  }

  const data = await response.json()
  return data.data.user
}

// Usage
try {
  const pendingToken = await adminLogin('admin', 'password')
  // Show code input UI
  const code = await getUserInput() // Get code from UI
  const user = await verify2FA(pendingToken, code)
  // Redirect to admin dashboard
  console.log('Logged in as:', user)
} catch (error) {
  console.error('Login failed:', error.message)
}
```

### Complete Flow with UI States

```typescript
type AuthState = 
  | { step: 'credentials' }
  | { step: 'waiting-code'; pendingToken: string; expiresAt: number }
  | { step: 'authenticated'; user: User }

function AdminLoginForm() {
  const [state, setState] = useState<AuthState>({ step: 'credentials' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Credentials form
  async function handleLoginSubmit(username: string, password: string) {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/v1/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error.message)
      }

      const data = await response.json()
      setState({
        step: 'waiting-code',
        pendingToken: data.data.pendingToken,
        expiresAt: Date.now() + data.data.expiresInSeconds * 1000
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Code verification
  async function handleCodeSubmit(code: string) {
    if (state.step !== 'waiting-code') return

    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/v1/admin/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pendingToken: state.pendingToken,
          code
        })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error.message)
      }

      const data = await response.json()
      setState({ step: 'authenticated', user: data.data.user })
      // Redirect to admin dashboard
      window.location.href = '/admin/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неверный код')
    } finally {
      setLoading(false)
    }
  }

  // Render based on state
  if (state.step === 'credentials') {
    return <CredentialsForm onSubmit={handleLoginSubmit} loading={loading} error={error} />
  }

  if (state.step === 'waiting-code') {
    return (
      <CodeVerificationForm
        onSubmit={handleCodeSubmit}
        expiresAt={state.expiresAt}
        loading={loading}
        error={error}
      />
    )
  }

  return <div>Redirecting...</div>
}
```

---

## Security Considerations

### Rate Limiting

**Login endpoint:** 3 attempts per 15 minutes per username
- После 3 попыток входа с неверными credentials - блокировка на 15 минут
- Счётчик сбрасывается после успешного входа

**Code verification:** 3 attempts per code
- Каждый код можно проверить максимум 3 раза
- После 3 неверных попыток код становится недействительным
- Нужно запросить новый код (повторный вход)

### Code Expiry

- **2FA code:** 5 minutes (300 seconds)
- **Pending token:** 10 minutes (600 seconds)

### Session Management

- **Access token:** 15 minutes (HttpOnly cookie)
- **Refresh token:** 7 days (HttpOnly cookie, path: `/api/v1/auth`)

### CSRF Protection

Все endpoints защищены CSRF middleware (требуется CSRF token в production).

### Credential Storage

**Never store in frontend:**
- ❌ Admin password
- ❌ 2FA codes
- ❌ Pending tokens (except in memory during login flow)

**Backend storage:**
- Admin password: Bcrypt hash in `.env` (ADMIN_PASSWORD_HASH)
- 2FA codes: In-memory with automatic cleanup
- Sessions: Database with revocation support

---

## Error Handling Best Practices

```typescript
async function safeAdminLogin(username: string, password: string) {
  try {
    const response = await fetch('/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    })

    const data = await response.json()

    if (!response.ok) {
      // Handle specific error codes
      switch (data.error.code) {
        case 'INVALID_CREDENTIALS':
          return { error: 'Неверный логин или пароль' }
        case 'RATE_LIMIT_EXCEEDED':
          return { error: 'Слишком много попыток. Попробуйте через 15 минут' }
        case 'SERVICE_ERROR':
          return { error: 'Сервис временно недоступен' }
        default:
          return { error: data.error.message }
      }
    }

    return { success: true, pendingToken: data.data.pendingToken }
  } catch (error) {
    // Network errors
    return { error: 'Ошибка сети. Проверьте подключение' }
  }
}
```

---

## Testing

### Manual Testing

1. **Setup:**
   ```bash
   # Add to .env
   ADMIN_LOGIN=admin
   ADMIN_PASSWORD_HASH=<bcrypt-hash>
   ADMIN_TELEGRAM_CHAT_ID=<your-chat-id>
   ```

2. **Get Chat ID:**
   - Message @Forum_kg_bot in Telegram
   - Send `/start`
   - Run: `npx tsx scripts/test-telegram-bot.ts`
   - Copy your chat ID from output

3. **Test Login Flow:**
   ```bash
   # Step 1: Login
   curl -X POST http://localhost:3000/api/v1/admin/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"your-password"}'
   
   # Check Telegram for 6-digit code
   
   # Step 2: Verify
   curl -X POST http://localhost:3000/api/v1/admin/verify-2fa \
     -H "Content-Type: application/json" \
     -c cookies.txt \
     -d '{"pendingToken":"<token>","code":"123456"}'
   ```

### Automated Testing

```bash
# Run security tests
npm run test:unit tests/security/admin-2fa.test.ts
```

---

## Troubleshooting

### "Telegram send failed"
- Check `TELEGRAM_BOT_TOKEN` in `.env`
- Verify bot is active (@Forum_kg_bot)
- Check `ADMIN_TELEGRAM_CHAT_ID` is correct
- Run: `npx tsx scripts/test-telegram-bot.ts`

### "Rate limit exceeded"
- Wait 15 minutes
- Or restart backend to clear in-memory rate limits

### "Code expired"
- Codes valid for 5 minutes only
- Request new code (repeat Step 1)

### "Invalid credentials"
- Check `ADMIN_LOGIN` matches (case-insensitive)
- Verify `ADMIN_PASSWORD_HASH` is correct bcrypt hash
- Generate new password: `npx tsx scripts/generate-admin-password.ts`

---

## Migration to Production

### Environment Setup

1. **Generate secure password:**
   ```bash
   npx tsx scripts/generate-admin-password.ts
   ```

2. **Set environment variables:**
   ```env
   ADMIN_LOGIN=admin
   ADMIN_PASSWORD_HASH=<bcrypt-hash-from-script>
   ADMIN_TELEGRAM_CHAT_ID=<admin-telegram-chat-id>
   TELEGRAM_BOT_TOKEN=<production-bot-token>
   ```

3. **Optional: Redis for scaling**
   - Current: In-memory storage (single instance)
   - Production: Replace with Redis for multi-instance support
   - See: `lib/services/admin-2fa.service.ts` TODO comments

### Security Checklist

- [ ] Use HTTPS in production
- [ ] Set `NODE_ENV=production`
- [ ] Rotate admin password regularly
- [ ] Monitor audit logs for suspicious activity
- [ ] Configure CSRF token validation
- [ ] Set up rate limiting at infrastructure level (Cloudflare, nginx)
- [ ] Enable security headers (CSP, HSTS, X-Frame-Options)
- [ ] Never commit `.env` to git

---

## Support

**Issues:** See `tests/security/admin-2fa.test.ts` for test coverage

**Password Generation:** `npx tsx scripts/generate-admin-password.ts`

**Telegram Test:** `npx tsx scripts/test-telegram-bot.ts`
