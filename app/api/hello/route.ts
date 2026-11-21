import { NextResponse } from 'next/server'

/**
 * GET /api/hello
 * Legacy health check endpoint
 * 
 * @deprecated Use /api/v1/health instead
 * This endpoint is kept for backward compatibility
 */
export async function GET() {
  return NextResponse.json({ 
    status: 'OK',
    message: 'API is running',
    timestamp: new Date().toISOString(),
    healthCheck: '/api/v1/health',
    endpoints: {
      hello: '/api/hello',
      auth: '/api/v1/auth',
      users: '/api/users',
      health: '/api/v1/health'
    }
  })
}
