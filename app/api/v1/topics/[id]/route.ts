import { NextRequest, NextResponse } from 'next/server'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { forbidden, notFound, validateBody, validationError, withErrorHandler } from '@/lib/api'
import { updateTopicSchema } from '@/lib/api/schemas/post'
import { uuidSchema } from '@/lib/api/schemas/common'
import { requireAuth } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

type TopicRouteContext = { params: Promise<{ id: string }> }

const publicSelect = {
  id: true,
  categoryId: true,
  title: true,
  content: true,
  tags: true,
  isPinned: true,
  isLocked: true,
  viewCount: true,
  replyCount: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, slug: true, name: true } },
  author: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TopicSelect

const isModerator = (role: UserRole) =>
  role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN

async function getId(context: TopicRouteContext): Promise<string | NextResponse> {
  const { id } = await context.params
  const result = uuidSchema.safeParse(id)
  return result.success ? result.data : validationError('Неверный формат идентификатора темы')
}

function auditDenied(request: NextRequest, userId: string) {
  writeSecurityAuditEvent({
    eventType: 'ACCESS_DENIED',
    result: 'denied',
    request,
    userId,
    reason: 'topic_owner_or_moderator_required',
    statusCode: 403,
  })
}

export const GET = withErrorHandler(async (_request: NextRequest, context: TopicRouteContext) => {
  const id = await getId(context)
  if (id instanceof NextResponse) return id

  const increment = await prisma.topic.updateMany({
    where: { id, deletedAt: null },
    data: { viewCount: { increment: 1 } },
  })
  if (increment.count === 0) return notFound('Тема', 'TOPIC_NOT_FOUND')

  const topic = await prisma.topic.findFirst({
    where: { id, deletedAt: null },
    select: publicSelect,
  })
  if (!topic) return notFound('Тема', 'TOPIC_NOT_FOUND')

  return NextResponse.json({ topic }, { status: 200 })
})

export const PATCH = withErrorHandler(async (request: NextRequest, context: TopicRouteContext) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const id = await getId(context)
  if (id instanceof NextResponse) return id

  const input = await validateBody(request, updateTopicSchema)
  const moderator = isModerator(authResult.user.role)
  const current = await prisma.topic.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, authorId: true },
  })
  if (!current) return notFound('Тема', 'TOPIC_NOT_FOUND')

  if (!moderator && current.authorId !== authResult.user.userId) {
    auditDenied(request, authResult.user.userId)
    return forbidden()
  }
  if (!moderator && (input.isPinned !== undefined || input.isLocked !== undefined)) {
    auditDenied(request, authResult.user.userId)
    return forbidden('Изменять закрепление и блокировку могут только модераторы')
  }

  const data: Prisma.TopicUpdateManyMutationInput = {
    ...(input.title !== undefined && { title: input.title as Prisma.InputJsonValue }),
    ...(input.content !== undefined && { content: input.content as Prisma.InputJsonValue }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(moderator && input.isPinned !== undefined && { isPinned: input.isPinned }),
    ...(moderator && input.isLocked !== undefined && { isLocked: input.isLocked }),
  }
  const updated = await prisma.topic.updateMany({
    where: {
      id,
      deletedAt: null,
      ...(moderator ? {} : { authorId: authResult.user.userId }),
    },
    data,
  })
  if (updated.count === 0) return notFound('Тема', 'TOPIC_NOT_FOUND')

  const topic = await prisma.topic.findFirst({
    where: { id, deletedAt: null },
    select: publicSelect,
  })
  if (!topic) return notFound('Тема', 'TOPIC_NOT_FOUND')

  writeSecurityAuditEvent({
    eventType: 'TOPIC_UPDATED',
    result: 'success',
    request,
    userId: authResult.user.userId,
    reason: 'topic_updated',
    statusCode: 200,
  })
  return NextResponse.json({ topic }, { status: 200 })
})

export const DELETE = withErrorHandler(async (request: NextRequest, context: TopicRouteContext) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const id = await getId(context)
  if (id instanceof NextResponse) return id

  const moderator = isModerator(authResult.user.role)
  const current = await prisma.topic.findFirst({
    where: { id, deletedAt: null },
    select: { authorId: true },
  })
  if (!current) return notFound('Тема', 'TOPIC_NOT_FOUND')
  if (!moderator && current.authorId !== authResult.user.userId) {
    auditDenied(request, authResult.user.userId)
    return forbidden()
  }

  const deleted = await prisma.topic.updateMany({
    where: {
      id,
      deletedAt: null,
      ...(moderator ? {} : { authorId: authResult.user.userId }),
    },
    data: { deletedAt: new Date() },
  })
  if (deleted.count === 0) return notFound('Тема', 'TOPIC_NOT_FOUND')

  writeSecurityAuditEvent({
    eventType: 'TOPIC_DELETED',
    result: 'success',
    request,
    userId: authResult.user.userId,
    reason: 'topic_soft_deleted',
    statusCode: 200,
  })
  return NextResponse.json({ success: true }, { status: 200 })
})
