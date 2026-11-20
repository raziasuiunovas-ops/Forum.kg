import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ 
    status: 'OK',
    message: 'API is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      posts: '/api/posts',
      users: '/api/users',
      hello: '/api/hello'
    }
  })
}
