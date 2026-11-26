import { NextRequest, NextResponse } from 'next/server'
import { sendForumReminders } from '@/lib/push/notifications'

/**
 * Cron endpoint to send forum reminders via Web Push to users' phones
 * Schedule: Run daily at 9:00 AM Bishkek time (3:00 AM UTC)
 * 
 * Sends browser notifications to all users with:
 * - Active tickets for upcoming forums
 * - Push notifications enabled
 * 
 * @example
 * GET /api/cron/send-push-reminders?days=1&secret=YOUR_SECRET
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret = request.nextUrl.searchParams.get('secret')
  const expectedSecret = process.env.CRON_SECRET
  
  if (!expectedSecret) {
    console.error('[Cron Push Reminders] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Service not configured' }, { status: 503 })
  }

  if (secret !== expectedSecret) {
    console.error('[Cron Push Reminders] Invalid secret')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get days parameter (default: 1 day before)
  const daysParam = request.nextUrl.searchParams.get('days')
  const days = daysParam ? parseInt(daysParam, 10) : 1

  if (isNaN(days) || days < 0 || days > 30) {
    return NextResponse.json({ error: 'Invalid days parameter' }, { status: 400 })
  }

  try {
    console.log(`[Cron Push Reminders] Starting Web Push reminders for forums in ${days} days`)
    const sentCount = await sendForumReminders(days)
    console.log(`[Cron Push Reminders] Successfully sent ${sentCount} push notifications to users' devices`)

    return NextResponse.json({
      success: true,
      sentCount,
      days,
      type: 'web_push',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron Push Reminders] Failed:', error)
    return NextResponse.json(
      { error: 'Failed to send push reminders' },
      { status: 500 }
    )
  }
}
