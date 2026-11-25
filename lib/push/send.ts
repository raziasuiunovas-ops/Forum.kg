import webpush from 'web-push'
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

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const vapid = getVapidConfig()
  if (!vapid) {
    console.warn('[Push] VAPID not configured — skipping push notification')
    return
  }

  webpush.setVapidDetails(vapid.email, vapid.publicKey, vapid.privateKey)

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  })

  if (subscriptions.length === 0) return

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icon.svg',
    url: payload.url || '/',
  })

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        data
      )
    )
  )

  // Remove expired/invalid subscriptions
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number }
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: subscriptions[i].id } }).catch(() => {})
      }
    }
  }
}
