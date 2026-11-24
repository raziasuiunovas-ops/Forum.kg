/**
 * GET /api/v1/auth/status
 * Quiet "am I signed in?" probe for the UI: always 200, never logs a 401 in the browser console.
 * `canRefresh` tells the client a refresh cookie exists (it is HttpOnly and scoped to /api/v1/auth).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return NextResponse.json({ authenticated: false, canRefresh: Boolean(request.cookies.get('refresh')?.value) })
  }
  return NextResponse.json({ authenticated: true, role: auth.user.role })
}
