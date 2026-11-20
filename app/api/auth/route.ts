import { NextRequest, NextResponse } from 'next/server'

// Здесь будет авторизация после ТЗ
export async function POST(request: NextRequest) {
  return NextResponse.json({ message: 'Auth endpoint ready' })
}
