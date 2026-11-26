import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { sendPushToUser } from '@/lib/push/send'

/**
 * Test endpoint to send a push notification to the current user
 * POST /api/v1/push/test
 * 
 * Body (optional):
 * {
 *   "title": "Test Title",
 *   "body": "Test message",
 *   "url": "/ru/account"
 * }
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('headers' in authResult) return authResult
  const { userId } = authResult.user

  try {
    const body = await request.json().catch(() => ({}))
    
    const payload = {
      title: body.title || 'Тестовое уведомление 🔔',
      body: body.body || 'Это тестовое push уведомление от FORUM.KG',
      url: body.url || '/ru/account',
      icon: '/icons/icon-192.png'
    }

    await sendPushToUser(userId, payload)

    return NextResponse.json({ 
      success: true, 
      message: 'Уведомление отправлено!',
      payload 
    })
  } catch (error) {
    console.error('[Push Test] Error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to send notification',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    )
  }
}
