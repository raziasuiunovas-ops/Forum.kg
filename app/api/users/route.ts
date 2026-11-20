import { NextRequest, NextResponse } from 'next/server'

// Здесь будут эндпоинты пользователей после ТЗ
export async function GET(request: NextRequest) {
  return NextResponse.json({ message: 'Users endpoint ready' })
}
