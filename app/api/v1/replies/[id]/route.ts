import { NextRequest, NextResponse } from 'next/server'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { conflict, forbidden, notFound, validateBody, validationError, withErrorHandler } from '@/lib/api'
import { updateReplySchema } from '@/lib/api/schemas/post'
import { uuidSchema } from '@/lib/api/schemas/common'
import { requireAuth } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

type ReplyRouteContext = { params: Promise<{ id: string }> }

const publicSelect = {
  id: true,
  topicId: true,
  parentId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PostSelect

const isModerator = (role: UserRole) =>
  role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN

async function getId(context: ReplyRouteContext): Promise<string | NextResponse> {
  const { id } = await context.params
  const result = uuidSchema.safeParse(id)
  return result.success ? result.data : validationError('Неверный формат идентификатора сообщения')
}

function auditDenied(request: NextRequest, userId: string) {
  writeSecurityAuditEvent({
    eventType: 'ACCESS_DENIED',
    result: 'denied',
    request,
    userId,
    reason: 'post_owner_or_moderator_required',
    statusCode: 403,
  })
}

export const PATCH = withErrorHandler(async (request: NextRequest, context: ReplyRouteContext) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const id = await getId(context)
  if (id instanceof NextResponse) return id
  const input = await validateBody(request, updateReplySchema)

  const moderator = isModerator(authResult.user.role)
  const current = await prisma.post.findFirst({
    where: { id, deletedAt: null, topic: { is: { deletedAt: null } } },
    select: { id: true, authorId: true },
  })
  if (!current) return notFound('Сообщение', 'POST_NOT_FOUND')
  if (!moderator && current.authorId !== authResult.user.userId) {
    auditDenied(request, authResult.user.userId)
    return forbidden()
  }

  const updated = await prisma.post.updateMany({
    where: {
      id,
      deletedAt: null,
      topic: { is: { deletedAt: null } },
      ...(moderator ? {} : { authorId: authResult.user.userId }),
    },
    data: { content: input.content as Prisma.InputJsonValue },
  })
  if (updated.count === 0) return notFound('Сообщение', 'POST_NOT_FOUND')

  const reply = await prisma.post.findFirst({
    where: { id, deletedAt: null },
    select: publicSelect,
  })
  if (!reply) return notFound('Сообщение', 'POST_NOT_FOUND')

  writeSecurityAuditEvent({
    eventType: 'POST_UPDATED',
    result: 'success',
    request,
    userId: authResult.user.userId,
    reason: 'reply_updated',
    statusCode: 200,
  })
  return NextResponse.json({ reply }, { status: 200 })
})

class ReplyCountInvariantError extends Error {}

export const DELETE = withErrorHandler(async (request: NextRequest, context: ReplyRouteContext) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const id = await getId(context)
  if (id instanceof NextResponse) return id

  const current = await prisma.post.findFirst({
    where: { id, deletedAt: null, topic: { is: { deletedAt: null } } },
    select: { authorId: true, topicId: true },
  })
  if (!current) return notFound('Сообщение', 'POST_NOT_FOUND')

  const moderator = isModerator(authResult.user.role)
  if (!moderator && current.authorId !== authResult.user.userId) {
    auditDenied(request, authResult.user.userId)
    return forbidden()
  }

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const result = await tx.post.updateMany({
        where: {
          id,
          deletedAt: null,
          ...(moderator ? {} : { authorId: authResult.user.userId }),
        },
        data: { deletedAt: new Date() },
      })
      if (result.count === 0) return false

      const counter = await tx.topic.updateMany({
        where: { id: current.topicId, replyCount: { gt: 0 } },
        data: { replyCount: { decrement: 1 } },
      })
      if (counter.count === 0) throw new ReplyCountInvariantError()
      return true
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (!deleted) return notFound('Сообщение', 'POST_NOT_FOUND')
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2034') {
      return conflict('Сообщение изменилось одновременно с запросом. Повторите попытку', 'CONCURRENT_MODIFICATION')
    }
    if (cause instanceof ReplyCountInvariantError) {
      return conflict('Счётчик сообщений темы не согласован. Обратитесь к модератору', 'REPLY_COUNT_INVARIANT')
    }
    throw cause
  }

  writeSecurityAuditEvent({
    eventType: 'POST_DELETED',
    result: 'success',
    request,
    userId: authResult.user.userId,
    reason: 'reply_soft_deleted',
    statusCode: 200,
  })
  return NextResponse.json({ success: true }, { status: 200 })
})
