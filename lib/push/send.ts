import * as webpush from 'web-push'
import { prisma } from '@/lib/db'

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL || 'mailto:admin@forum.kg'
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, email }
}

export interface PushPayload {
  title: string
  body: string
  icon?: string
  url?: string
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  console.log('[sendPushToUser] Starting for user:', userId)
  
  const vapid = getVapidConfig()
  if (!vapid) {
    console.warn('[Push] VAPID not configured — skipping push notification')
    return { sent: 0, failed: 0 }
  }

  console.log('[sendPushToUser] VAPID configured:', { 
    hasPublicKey: !!vapid.publicKey,
    hasPrivateKey: !!vapid.privateKey,
    email: vapid.email 
  })

  webpush.setVapidDetails(vapid.email, vapid.publicKey, vapid.privateKey)

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  })

  console.log('[sendPushToUser] Found subscriptions:', subscriptions.length)

  if (subscriptions.length === 0) {
    console.log('[sendPushToUser] No subscriptions found')
    return { sent: 0, failed: 0 }
  }

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icon.svg',
    url: payload.url || '/',
  })

  console.log('[sendPushToUser] Payload:', data)

  const results = await Promise.allSettled(
    subscriptions.map((sub, index) => {
      console.log(`[sendPushToUser] Sending to subscription ${index + 1}/${subscriptions.length}:`, {
        endpoint: sub.endpoint.substring(0, 50) + '...',
      })
      return webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        data
      )
    })
  )

  let sent = 0
  let failed = 0

  // Remove expired/invalid subscriptions
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      sent++
      console.log(`[sendPushToUser] Subscription ${i + 1} sent successfully`)
    } else {
      failed++
      const err = result.reason as { statusCode?: number; message?: string }
      console.error(`[sendPushToUser] Subscription ${i + 1} failed:`, {
        statusCode: err?.statusCode,
        message: err?.message,
      })
      
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        console.log(`[sendPushToUser] Removing invalid subscription ${i + 1}`)
        await prisma.pushSubscription.delete({ where: { id: subscriptions[i].id } }).catch((e) => {
          console.error('[sendPushToUser] Failed to delete subscription:', e)
        })
      }
    }
  }

  console.log('[sendPushToUser] Results:', { sent, failed, total: subscriptions.length })
  return { sent, failed }
}
