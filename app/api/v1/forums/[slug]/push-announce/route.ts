import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendNewForumAnnouncement } from '@/lib/push/notifications'
import { ForumStatus } from '@prisma/client'

/**
 * Send Web Push announcement about published forum to all subscribers
 * Sends browser notifications to users' phones/devices
 * 
 * POST /api/v1/forums/:slug/push-announce
 * Authorization: Requires staff role (TODO)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // TODO: Add authentication check for staff roles

  try {
    const forum = await prisma.forum.findUnique({
      where: { slug },
      select: { id: true, status: true },
    })

    if (!forum) {
      return NextResponse.json(
        { error: 'Forum not found' },
        { status: 404 }
      )
    }

    if (forum.status !== ForumStatus.PUBLISHED) {
      return NextResponse.json(
        { error: 'Forum is not published' },
        { status: 400 }
      )
    }

    console.log(`[Forum Push Announcement] Sending Web Push notification for forum ${slug}`)
    const sentCount = await sendNewForumAnnouncement(forum.id)
    console.log(`[Forum Push Announcement] Successfully sent to ${sentCount} users' devices`)

    return NextResponse.json({
      success: true,
      sentCount,
      forumId: forum.id,
      type: 'web_push',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Forum Push Announcement] Failed:', error)
    return NextResponse.json(
      { error: 'Failed to send announcement' },
      { status: 500 }
    )
  }
}
