# FORUM.KG - Vercel Environment Variables

**Complete Configuration Guide for Production Deployment**

> ⚠️ **SECURITY NOTE:** This document does NOT contain actual secrets.  
> Real credentials must be obtained separately and configured in Vercel.

---

## 📊 QUICK REFERENCE

**Total Variables:** 44  
**Required for MVP:** 11  
**Recommended for Production:** 14  
**Optional Enhancements:** 30  

---

## 🚨 MINIMUM REQUIRED (11 variables)

These MUST be set before first deployment:

```bash
# Database
DATABASE_URL                  # Neon pooled connection
DIRECT_URL                    # Neon direct connection

# Authentication
JWT_SECRET                    # Min 32 chars (openssl rand -base64 32)
JWT_REFRESH_SECRET           # Min 32 chars (openssl rand -base64 32)

# Admin Access
ADMIN_LOGIN                   # Admin username (e.g., "admin")
ADMIN_PASSWORD_HASH          # Bcrypt hash of password
ADMIN_TELEGRAM_CHAT_ID       # Your Telegram chat ID for 2FA

# Telegram Bot
TELEGRAM_BOT_TOKEN           # From @BotFather

# Security
ENCRYPTION_KEY_BASE64        # 32 bytes base64 (openssl rand -base64 32)
CRON_SECRET                  # Random string (openssl rand -base64 32)

# Environment
NODE_ENV                     # Must be "production"
```

---

## ✅ RECOMMENDED FOR PRODUCTION (+3 variables)

```bash
# Application URL
NEXT_PUBLIC_APP_URL          # https://forum.kg

# Rate Limiting (highly recommended for multi-instance)
UPSTASH_REDIS_REST_URL       # From upstash.com
UPSTASH_REDIS_REST_TOKEN     # From upstash.com
```

---

## 💳 OPTIONAL - PAYMENTS (+8 variables)

Required only if Finik payment processing is needed:

```bash
FINIK_ENV                    # "beta" or "prod"
FINIK_API_KEY                # From Finik merchant dashboard
FINIK_ACCOUNT_ID             # From Finik merchant dashboard
FINIK_PRIVATE_KEY            # RSA private key (PEM format with \n)
FINIK_BETA_PUBLIC_KEY        # Webhook verification key (beta)
FINIK_PROD_PUBLIC_KEY        # Webhook verification key (prod)  
FINIK_REDIRECT_URL           # https://forum.kg/payment/return
FINIK_WEBHOOK_URL            # https://forum.kg/api/v1/payments/webhooks/finik
```

---

## 📁 OPTIONAL - FILE STORAGE (+5 variables)

Required only if file upload functionality is needed:

```bash
AWS_S3_PRIVATE_BUCKET         # Bucket name
AWS_ENDPOINT_URL_S3           # S3 endpoint URL
AWS_ACCESS_KEY_ID             # Access key
AWS_SECRET_ACCESS_KEY         # Secret key
AWS_REGION                    # us-east-2
```

---

## 🔐 OPTIONAL - GOOGLE OAUTH (+2 variables)

```bash
GOOGLE_CLIENT_ID              # From Google Cloud Console
GOOGLE_CLIENT_SECRET          # From Google Cloud Console
```

> ⚠️ Note: Google OAuth endpoints exist but return 501 (not fully implemented)

---

## 🔒 MARK AS SECRET IN VERCEL

These variables MUST be marked as "Secret" (encrypted):

```
JWT_SECRET
JWT_REFRESH_SECRET
ADMIN_PASSWORD_HASH
ADMIN_TELEGRAM_CHAT_ID
TELEGRAM_BOT_TOKEN
ENCRYPTION_KEY_BASE64
CRON_SECRET
UPSTASH_REDIS_REST_TOKEN
FINIK_API_KEY
FINIK_PRIVATE_KEY
FINIK_BETA_PUBLIC_KEY
FINIK_PROD_PUBLIC_KEY
GOOGLE_CLIENT_SECRET
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

---

## 📋 COPY-PASTE: EXACT VARIABLE NAMES

### Required (11):
```
DATABASE_URL
DIRECT_URL
JWT_SECRET
JWT_REFRESH_SECRET
ADMIN_LOGIN
ADMIN_PASSWORD_HASH
ADMIN_TELEGRAM_CHAT_ID
TELEGRAM_BOT_TOKEN
ENCRYPTION_KEY_BASE64
CRON_SECRET
NODE_ENV
```

### Recommended (3):
```
NEXT_PUBLIC_APP_URL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

### Payments (8):
```
FINIK_ENV
FINIK_API_KEY
FINIK_ACCOUNT_ID
FINIK_PRIVATE_KEY
FINIK_BETA_PUBLIC_KEY
FINIK_PROD_PUBLIC_KEY
FINIK_REDIRECT_URL
FINIK_WEBHOOK_URL
```

### Storage (5):
```
AWS_S3_PRIVATE_BUCKET
AWS_ENDPOINT_URL_S3
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
```

### OAuth (2):
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

---

## 🚦 STEP-BY-STEP SETUP

### 1. Database (Neon)

1. Create account at https://neon.tech
2. Create new project
3. Navigate to "Connection Details"
4. Copy **Pooler connection** → `DATABASE_URL`
5. Copy **Direct connection** → `DIRECT_URL`

**Example format:**
```
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 2. JWT Secrets

Generate two separate secrets:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Paste into Vercel:
```
JWT_SECRET=<first_output>
JWT_REFRESH_SECRET=<second_output>
```

### 3. Admin Account

**Generate password hash:**
```bash
# Option 1: Using Node.js
node -e "console.log(require('bcryptjs').hashSync('your-password-here', 10))"

# Option 2: Using script (if available)
npx tsx scripts/generate-admin-password.ts
```

**Set variables:**
```
ADMIN_LOGIN=admin
ADMIN_PASSWORD_HASH=$2a$10$xxx... (from above)
```

### 4. Telegram Bot

1. Message [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Follow instructions
4. Copy token → `TELEGRAM_BOT_TOKEN`
5. Send `/start` to your bot
6. Message [@userinfobot](https://t.me/userinfobot)
7. Copy your ID → `ADMIN_TELEGRAM_CHAT_ID`

```
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
ADMIN_TELEGRAM_CHAT_ID=123456789
```

### 5. Encryption & Security

```bash
# Generate encryption key
openssl rand -base64 32

# Generate cron secret
openssl rand -base64 32
```

```
ENCRYPTION_KEY_BASE64=<first_output>
CRON_SECRET=<second_output>
```

### 6. Environment Mode

```
NODE_ENV=production
```

### 7. Application URL

```
NEXT_PUBLIC_APP_URL=https://forum.kg
```

### 8. Redis (Optional but Recommended)

1. Create account at https://upstash.com
2. Create Redis database
3. Copy REST URL and Token

```
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxx...
```

---

## ⚠️ WHAT BREAKS WITHOUT EACH VARIABLE

| Missing Variable | Impact | Severity |
|-----------------|--------|----------|
| `DATABASE_URL` / `DIRECT_URL` | ❌ App crashes | CRITICAL |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ❌ All auth broken | CRITICAL |
| `ADMIN_*` / `TELEGRAM_BOT_TOKEN` | ❌ Admin access broken | CRITICAL |
| `ENCRYPTION_KEY_BASE64` | ❌ QR generation fails | CRITICAL |
| `CRON_SECRET` | ⚠️ 2FA cleanup disabled | HIGH |
| `NODE_ENV` | ⚠️ Wrong mode behavior | HIGH |
| `UPSTASH_*` | ⚠️ No distributed rate limiting | MEDIUM |
| `FINIK_*` | ⚠️ Payments disabled | MEDIUM |
| `AWS_*` | ⚠️ File uploads disabled | MEDIUM |
| `GOOGLE_*` | ⚠️ OAuth disabled (already 501) | LOW |

---

## 📌 VERCEL CONFIGURATION

### Production Environment:
- Set all 11 required variables
- Set 3 recommended variables  
- Mark 15 variables as Secret
- Set `NODE_ENV=production`

### Preview Environment:
- Can copy from Production
- Or use separate Preview database (Neon branch)

### Development:
- Use local `.env.local`
- Or copy from Production (careful!)

---

## 🔐 SECURITY CHECKLIST

- [ ] ✅ All secrets marked as "Secret" in Vercel
- [ ] ✅ No `.env` or `.env.local` committed to git
- [ ] ✅ Separate credentials for dev/staging/production
- [ ] ✅ JWT secrets are 32+ characters
- [ ] ✅ Admin password is strong (not "admin")
- [ ] ✅ Telegram bot token kept private
- [ ] ✅ Finik private key never exposed
- [ ] ✅ Neon database has backup enabled
- [ ] ✅ Upstash Redis has correct access controls

---

## 🚀 DEPLOYMENT SEQUENCE

1. **Configure Vercel:**
   - Add all required variables
   - Mark secrets
   - Deploy

2. **Run Migrations:**
   ```bash
   npx prisma migrate deploy
   ```

3. **Verify:**
   - Visit https://forum.kg
   - Should redirect to https://forum.kg/ru
   - Check landing page loads
   - Try admin login

4. **Monitor:**
   - Check Vercel logs
   - Check Neon database
   - Monitor rate limits

---

## ⚡ TROUBLESHOOTING

**App won't start:**
- Check all required variables are set
- Check no typos in variable names
- Check `NODE_ENV=production`

**Admin login fails:**
- Verify `ADMIN_PASSWORD_HASH` is correct
- Check `TELEGRAM_BOT_TOKEN` is valid
- Verify `ADMIN_TELEGRAM_CHAT_ID` is your ID

**Payments don't work:**
- Verify all `FINIK_*` variables set
- Check PEM format (use `\n` for newlines)
- Verify `FINIK_ENV` matches keys (beta vs prod)

**Rate limiting errors:**
- Add Redis variables
- Or accept in-memory fallback (single instance only)

---

## 📞 SUPPORT

- **Neon:** https://neon.tech/docs
- **Upstash:** https://docs.upstash.com
- **Vercel:** https://vercel.com/docs/environment-variables
- **Telegram Bots:** https://core.telegram.org/bots

---

**Document Version:** 1.0  
**Last Updated:** 23 November 2026  
**Audit Status:** Complete ✅
