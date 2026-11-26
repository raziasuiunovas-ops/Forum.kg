import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'
import { createHash } from 'node:crypto'
import { sendWelcomePush } from '@/lib/push/notifications'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('headers' in authResult) return authResult
  const { userId } = authResult.user

  const body = await request.json()
  const { endpoint, keys } = body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  const endpointHash = createHash('sha256').update(endpoint).digest('hex').slice(0, 64)

  const isNewSubscription = !(await prisma.pushSubscription.findUnique({
    where: { endpointHash },
  }))

  await prisma.pushSubscription.upsert({
    where: { endpointHash },
    create: {
      userId,
      endpoint,
      endpointHash,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  })

  // Send welcome notification for new subscriptions
  if (isNewSubscription) {
    // Небольшая задержка чтобы подписка успела сохраниться
    setTimeout(() => {
      sendWelcomePush(userId).catch((error) => {
        console.error('[Push Subscribe] Failed to send welcome notification:', error)
      })
    }, 1000)
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('headers' in authResult) return authResult
  const { userId } = authResult.user

  const body = await request.json()
  const { endpoint } = body
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  const endpointHash = createHash('sha256').update(endpoint).digest('hex').slice(0, 64)

  await prisma.pushSubscription.deleteMany({
    where: { userId, endpointHash },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
