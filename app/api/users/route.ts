/**
 * GET /api/users
 * Get users list (authenticated endpoint)
 * TODO: Implement actual users listing after ТЗ
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'

export async function GET(request: NextRequest) {
  // Require authentication
  const authResult = await requireAuth(request)
  
  if (authResult instanceof NextResponse) {
    return authResult
  }

  const { user } = authResult

  // TODO: Implement users listing after ТЗ
  return NextResponse.json({ 
    message: 'Users endpoint ready',
    authenticatedAs: user.userId,
    role: user.role,
  })
}
