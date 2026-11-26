import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendWelcomeMessage } from '@/lib/notifications/telegram-notifications'

/**
 * Connect user's Telegram account
 * 
 * POST /api/v1/telegram/connect
 * Body: { chatId: string, firstName?: string, lastName?: string }
 * 
 * This endpoint should be called by the Telegram bot when user sends /start
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { chatId, userId, firstName, lastName } = body

    if (!chatId || !userId) {
      return NextResponse.json(
        { error: 'Missing chatId or userId' },
        { status: 400 }
      )
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        firstName: true, 
        lastName: true,
        telegramConnection: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if already connected
    if (user.telegramConnection && !user.telegramConnection.disconnectedAt) {
      return NextResponse.json({
        success: true,
        alreadyConnected: true,
        message: 'Telegram already connected',
      })
    }

    // Create or reconnect Telegram connection
    const connection = await prisma.telegramConnection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        chatId: chatId.toString(),
      },
      update: {
        chatId: chatId.toString(),
        disconnectedAt: null,
        connectedAt: new Date(),
      },
    })

    // Send welcome message
    const userName = user.firstName || firstName || 'друг'
    try {
      await sendWelcomeMessage(chatId.toString(), userName)
    } catch (error) {
      console.error('[Telegram Connect] Failed to send welcome message:', error)
      // Don't fail the connection if welcome message fails
    }

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        connectedAt: connection.connectedAt,
      },
      message: 'Telegram connected successfully',
    })
  } catch (error) {
    console.error('[Telegram Connect] Error:', error)
    return NextResponse.json(
      { error: 'Failed to connect Telegram' },
      { status: 500 }
    )
  }
}

/**
 * Disconnect user's Telegram account
 * 
 * DELETE /api/v1/telegram/connect
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      )
    }

    await prisma.telegramConnection.updateMany({
      where: { 
        userId,
        disconnectedAt: null,
      },
      data: {
        disconnectedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Telegram disconnected successfully',
    })
  } catch (error) {
    console.error('[Telegram Disconnect] Error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect Telegram' },
      { status: 500 }
    )
  }
}
