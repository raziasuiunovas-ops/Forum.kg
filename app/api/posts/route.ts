import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET - получить все посты
export async function GET(request: NextRequest) {
  try {
    const posts = await prisma.post.findMany({
      include: {
        author: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        },
        category: true,
        _count: {
          select: {
            comments: true,
            likes: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    
    return NextResponse.json({ posts })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    )
  }
}

// POST - создать пост
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Здесь будет создание поста после ТЗ
    return NextResponse.json({ message: 'Create post endpoint ready', body })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    )
  }
}
