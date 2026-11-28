import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { sendPushToUser } from '@/lib/push/send'

/**
 * Test endpoint to send a push notification to current user
 * GET /api/v1/push/test
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if ('headers' in authResult) return authResult
  const { userId } = authResult.user

  try {
    await sendPushToUser(userId, {
      title: '🧪 Тестовое уведомление',
      body: 'Если вы видите это уведомление — всё работает! 🎉',
      url: '/ru/account',
      icon: '/icon-512.png',
    })

    return NextResponse.json({
      success: true,
      message: 'Тестовое уведомление отправлено!',
      userId,
    })
  } catch (error) {
    console.error('[Push Test] Failed:', error)
    return NextResponse.json(
      { 
        error: 'Failed to send test notification',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
