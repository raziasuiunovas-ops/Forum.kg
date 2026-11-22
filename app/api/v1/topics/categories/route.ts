import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { validateBody, withErrorHandler } from '@/lib/api'
import { createTopicCategorySchema } from '@/lib/api/schemas/post'
import { requireManager } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

export const GET = withErrorHandler(async () => {
  const categories = await prisma.topicCategory.findMany({
    where: { isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      sortOrder: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
  })

  return NextResponse.json({ categories }, { status: 200 })
})

export const POST = withErrorHandler(async (request: NextRequest) => {
  const authResult = await requireManager(request)
  if (authResult instanceof NextResponse) return authResult

  const input = await validateBody(request, createTopicCategorySchema)
  const category = await prisma.topicCategory.create({
    data: {
      slug: input.slug,
      name: input.name as Prisma.InputJsonValue,
      description: input.description as Prisma.InputJsonValue | undefined,
      sortOrder: input.sortOrder,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      sortOrder: true,
    },
  })

  writeSecurityAuditEvent({
    eventType: 'TOPIC_CATEGORY_CREATED',
    result: 'success',
    request,
    userId: authResult.user.userId,
    reason: 'topic_category_created',
    statusCode: 201,
  })

  return NextResponse.json({ category }, { status: 201 })
})
