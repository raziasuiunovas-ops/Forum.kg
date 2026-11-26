import { NextResponse } from 'next/server'

/**
 * GET /api/v1/push/vapid
 * Returns the public VAPID key for push notifications
 */
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  
  if (!publicKey) {
    return NextResponse.json(
      { error: 'VAPID key not configured' },
      { status: 503 }
    )
  }

  return NextResponse.json({ publicKey })
}
