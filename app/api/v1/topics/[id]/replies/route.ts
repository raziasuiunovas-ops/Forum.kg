import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { calculatePagination, conflict, error, notFound, validateBody, withErrorHandler } from '@/lib/api'
import { createReplySchema } from '@/lib/api/schemas/post'
import { parsePaginationParams, uuidSchema } from '@/lib/api/schemas/common'
import { requireAuth } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'

type RepliesRouteContext = {
  params: Promise<{ id: string }>
}

const replyPublicSelect = {
  id: true,
  topicId: true,
  parentId: true,
  content: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.PostSelect

export const GET = withErrorHandler(async (request: NextRequest, context: RepliesRouteContext) => {
  const { id } = await context.params
  const parsedTopicId = uuidSchema.safeParse(id)

  if (!parsedTopicId.success) {
    return error('INVALID_PARAMETER', 'Неверный идентификатор темы', 400)
  }

  const topic = await prisma.topic.findFirst({
    where: { id: parsedTopicId.data, deletedAt: null },
    select: { id: true },
  })

  if (!topic) return notFound('Тема', 'TOPIC_NOT_FOUND')

  const pagination = parsePaginationParams(new URL(request.url).searchParams)
  const where = { topicId: parsedTopicId.data }

  const [replies, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: replyPublicSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    }),
    prisma.post.count({ where }),
  ])

  const visibleReplies = replies.map((reply) =>
    reply.deletedAt
      ? {
          id: reply.id,
          topicId: reply.topicId,
          parentId: reply.parentId,
          content: null,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
          author: null,
          isDeleted: true,
        }
      : { ...reply, deletedAt: undefined, isDeleted: false },
  )

  return NextResponse.json({
    replies: visibleReplies,
    pagination: calculatePagination(pagination.page, pagination.limit, total),
  }, { status: 200 })
})

export const POST = withErrorHandler(async (request: NextRequest, context: RepliesRouteContext) => {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { id } = await context.params
  const parsedTopicId = uuidSchema.safeParse(id)

  if (!parsedTopicId.success) {
    return error('INVALID_PARAMETER', 'Неверный идентификатор темы', 400)
  }

  const input = await validateBody(request, createReplySchema)

  type Outcome =
    | { kind: 'topic_missing' }
    | { kind: 'topic_locked' }
    | { kind: 'parent_invalid' }
    | { kind: 'created'; reply: unknown }

  class TopicBecameUnavailableError extends Error {}

  let outcome: Outcome

  try {
    outcome = await prisma.$transaction(async (tx) => {
      const topic = await tx.topic.findFirst({
        where: { id: parsedTopicId.data, deletedAt: null },
        select: { id: true, isLocked: true },
      })

      if (!topic) return { kind: 'topic_missing' }
      if (topic.isLocked) return { kind: 'topic_locked' }

      if (input.parentId) {
        const parent = await tx.post.findFirst({
          where: {
            id: input.parentId,
            topicId: topic.id,
            deletedAt: null,
          },
          select: { id: true },
        })

        if (!parent) return { kind: 'parent_invalid' }
      }

      const reply = await tx.post.create({
        data: {
          id: randomUUID(),
          topicId: topic.id,
          authorId: authResult.user.userId,
          parentId: input.parentId,
          content: input.content as Prisma.InputJsonValue,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        select: replyPublicSelect,
      })

      const updated = await tx.topic.updateMany({
        where: { id: topic.id, deletedAt: null },
        data: { replyCount: { increment: 1 } },
      })

      if (updated.count === 0) throw new TopicBecameUnavailableError()

      return { kind: 'created', reply }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (cause) {
    if (cause instanceof TopicBecameUnavailableError) {
      return notFound('Тема', 'TOPIC_NOT_FOUND')
    }

    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2034') {
      return conflict('Тема изменилась одновременно с запросом. Повторите попытку', 'CONCURRENT_MODIFICATION')
    }

    throw cause
  }

  if (outcome.kind === 'topic_missing') return notFound('Тема', 'TOPIC_NOT_FOUND')
  if (outcome.kind === 'topic_locked') return conflict('Тема закрыта для новых сообщений', 'TOPIC_LOCKED')
  if (outcome.kind === 'parent_invalid') {
    return error('INVALID_PARENT', 'Ответ должен ссылаться на сообщение этой темы', 422)
  }

  writeSecurityAuditEvent({
    eventType: 'POST_CREATED',
    result: 'success',
    request,
    userId: authResult.user.userId,
    reason: 'reply_created',
    statusCode: 201,
  })

  return NextResponse.json({ reply: outcome.reply }, { status: 201 })
})