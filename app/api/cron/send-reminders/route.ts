import { NextRequest, NextResponse } from 'next/server'
import { sendForumReminders } from '@/lib/notifications/telegram-notifications'

/**
 * Cron endpoint to send forum reminders
 * Schedule: Run daily at 9:00 AM Bishkek time
 * 
 * @example
 * GET /api/cron/send-reminders?days=1&secret=YOUR_SECRET
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret = request.nextUrl.searchParams.get('secret')
  const expectedSecret = process.env.CRON_SECRET
  
  if (!expectedSecret) {
    console.error('[Cron Reminders] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Service not configured' }, { status: 503 })
  }

  if (secret !== expectedSecret) {
    console.error('[Cron Reminders] Invalid secret')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get days parameter (default: 1 day before)
  const daysParam = request.nextUrl.searchParams.get('days')
  const days = daysParam ? parseInt(daysParam, 10) : 1

  if (isNaN(days) || days < 0 || days > 30) {
    return NextResponse.json({ error: 'Invalid days parameter' }, { status: 400 })
  }

  try {
    console.log(`[Cron Reminders] Starting reminder send for forums in ${days} days`)
    const sentCount = await sendForumReminders(days)
    console.log(`[Cron Reminders] Successfully sent ${sentCount} reminders`)

    return NextResponse.json({
      success: true,
      sentCount,
      days,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron Reminders] Failed:', error)
    return NextResponse.json(
      { error: 'Failed to send reminders' },
      { status: 500 }
    )
  }
}
