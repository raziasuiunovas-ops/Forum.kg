import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendNewForumAnnouncement } from '@/lib/notifications/telegram-notifications'
import { ForumStatus } from '@prisma/client'

/**
 * Send announcement about published forum to all subscribers
 * This should be called after forum status changes to PUBLISHED
 * 
 * POST /api/v1/forums/:slug/announce
 * Authorization: Requires staff role
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // TODO: Add authentication check for staff roles
  // For now, using internal-only approach

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

    console.log(`[Forum Announcement] Sending announcement for forum ${slug}`)
    const sentCount = await sendNewForumAnnouncement(forum.id)
    console.log(`[Forum Announcement] Successfully sent to ${sentCount} users`)

    return NextResponse.json({
      success: true,
      sentCount,
      forumId: forum.id,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Forum Announcement] Failed:', error)
    return NextResponse.json(
      { error: 'Failed to send announcement' },
      { status: 500 }
    )
  }
}
