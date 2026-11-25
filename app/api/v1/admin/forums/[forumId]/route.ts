/**
 * GET /api/v1/admin/forums/[forumId]
 * Get forum details (Manager+)
 * 
 * PATCH /api/v1/admin/forums/[forumId]
 * Update forum (Manager+)
 * 
 * DELETE /api/v1/admin/forums/[forumId]
 * Cancel/delete forum (Manager+)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireManager } from '@/lib/auth/middleware'
import { forumUpdateSchema } from '@/lib/api/schemas/forum'
import { ForumStatus, NotificationType, Prisma } from '@prisma/client'
import { error as jsonError } from '@/lib/api/response'
import { revalidatePublicForums } from '@/lib/forums/revalidate'

type RouteContext = { params: Promise<{ forumId: string }> }

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/**
 * GET - Get forum details with all relations and stats
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = await requireManager(request)
  if ('headers' in authResult) return authResult

  const { forumId } = await context.params

  if (!validUuid(forumId)) {
    return jsonError('INVALID_FORUM_ID', 'Неверный формат ID мероприятия', 400)
  }

  try {
    const forum = await prisma.forum.findUnique({
      where: { id: forumId },
      include: {
        translations: {
          orderBy: { locale: 'asc' },
        },
        categories: {
          include: {
            translations: {
              orderBy: { locale: 'asc' },
            },
            _count: {
              select: {
                orderItems: {
                  where: {
                    order: {
                      status: { in: ['PAID', 'PENDING_PAYMENT'] },
                    },
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        _count: {
          select: {
            tickets: {
              where: { status: 'ACTIVE' },
            },
            orders: {
              where: { status: { in: ['PAID', 'PARTIALLY_CANCELLED'] } },
            },
            checkIns: true,
          },
        },
      },
    })

    if (!forum) {
      return jsonError('FORUM_NOT_FOUND', 'Мероприятие не найдено', 404)
    }

    // Calculate revenue
    const revenueResult = await prisma.payment.aggregate({
      where: {
        order: {
          forumId,
          status: { in: ['PAID', 'PARTIALLY_CANCELLED'] },
        },
        status: 'SUCCEEDED',
      },
      _sum: {
        amountMinor: true,
      },
    })

    // Count pending cancellations
    const pendingCancellations = await prisma.cancellationRequest.count({
      where: {
        order: {
          forumId,
        },
        status: 'SUBMITTED',
      },
    })

    return NextResponse.json({
      forum: {
        id: forum.id,
        slug: forum.slug,
        status: forum.status,
        bannerUrl: forum.bannerUrl,
        venueName: forum.venueName,
        venueAddress: forum.venueAddress,
        locationCoordinates: forum.locationCoordinates,
        timeZone: forum.timeZone,
        startsAt: forum.startsAt.toISOString(),
        endsAt: forum.endsAt?.toISOString() || null,
        registrationDeadline: forum.registrationDeadline?.toISOString() || null,
        qrExpiresAt: forum.qrExpiresAt.toISOString(),
        capacity: forum.capacity,
        maxTicketsPerAccount: forum.maxTicketsPerAccount,
        tags: forum.tags,
        publishAt: forum.publishAt?.toISOString() || null,
        publishedAt: forum.publishedAt?.toISOString() || null,
        createdById: forum.createdById,
        createdBy: forum.createdBy,
        createdAt: forum.createdAt.toISOString(),
        updatedAt: forum.updatedAt.toISOString(),
        translations: forum.translations,
        categories: forum.categories.map((cat) => ({
          ...cat,
          soldCount: cat._count.orderItems,
        })),
        stats: {
          activeTickets: forum._count.tickets,
          paidOrders: forum._count.orders,
          checkIns: forum._count.checkIns,
          pendingCancellations,
          availableCapacity: forum.capacity - forum._count.tickets,
          totalRevenueMinor: revenueResult._sum.amountMinor || 0,
        },
      },
    })
  } catch (error) {
    console.error('Error fetching forum:', error)
    return jsonError('INTERNAL_SERVER_ERROR', 'Не удалось получить данные мероприятия', 500)
  }
}

/**
 * PATCH - Update forum
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const authResult = await requireManager(request)
  if ('headers' in authResult) return authResult

  const { forumId } = await context.params

  if (!validUuid(forumId)) {
    return jsonError('INVALID_FORUM_ID', 'Неверный формат ID мероприятия', 400)
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return jsonError('VALIDATION_ERROR', 'Некорректный JSON запроса', 422)
  }

  const validation = forumUpdateSchema.safeParse(rawBody)
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Ошибка валидации данных форума',
          details: validation.error.format(),
        },
      },
      { status: 422 }
    )
  }

  const data = validation.data

  try {
    // Fetch existing forum first
    const existingForum = await prisma.forum.findUnique({
      where: { id: forumId },
      include: {
        _count: {
          select: {
            tickets: {
              where: { status: { in: ['ACTIVE', 'USED'] } },
            },
          },
        },
      },
    })

    if (!existingForum) {
      return jsonError('FORUM_NOT_FOUND', 'Мероприятие не найдено', 404)
    }

    // Check if capacity decrease is allowed
    if (data.capacity !== undefined && data.capacity < existingForum._count.tickets) {
      return jsonError(
        'CAPACITY_TOO_LOW',
        `Невозможно уменьшить вместимость ниже ${existingForum._count.tickets} (количество проданных билетов)`,
        409
      )
    }

    // Detect if critical info changed (notify users)
    const criticalFieldsChanged = 
      (data.startsAt && new Date(data.startsAt).getTime() !== existingForum.startsAt.getTime()) ||
      (data.endsAt && new Date(data.endsAt).getTime() !== existingForum.endsAt?.getTime()) ||
      (data.venueName && data.venueName !== existingForum.venueName) ||
      (data.venueAddress && data.venueAddress !== existingForum.venueAddress)

    // Update forum in transaction
    const updatedForum = await prisma.$transaction(async (tx) => {
      // Update main forum data
      const forum = await tx.forum.update({
        where: { id: forumId },
        data: {
          ...(data.status !== undefined && { status: data.status }),
          ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
          ...(data.venueName !== undefined && { venueName: data.venueName }),
          ...(data.venueAddress !== undefined && { venueAddress: data.venueAddress }),
          ...(data.locationCoordinates !== undefined && { 
            locationCoordinates: data.locationCoordinates === null ? Prisma.DbNull : data.locationCoordinates 
          }),
          ...(data.timeZone !== undefined && { timeZone: data.timeZone }),
          ...(data.startsAt !== undefined && { startsAt: new Date(data.startsAt) }),
          ...(data.endsAt !== undefined && { endsAt: data.endsAt ? new Date(data.endsAt) : null }),
          ...(data.registrationDeadline !== undefined && { 
            registrationDeadline: data.registrationDeadline ? new Date(data.registrationDeadline) : null 
          }),
          ...(data.qrExpiresAt !== undefined && { qrExpiresAt: new Date(data.qrExpiresAt) }),
          ...(data.capacity !== undefined && { capacity: data.capacity }),
          ...(data.maxTicketsPerAccount !== undefined && { maxTicketsPerAccount: data.maxTicketsPerAccount }),
          ...(data.tags !== undefined && { tags: data.tags }),
          ...(data.publishAt !== undefined && { publishAt: data.publishAt ? new Date(data.publishAt) : null }),
        },
      })

      // Update translations if provided
      if (data.translations && data.translations.length > 0) {
        // Delete existing translations
        await tx.forumTranslation.deleteMany({
          where: { forumId },
        })

        // Create new translations
        await tx.forumTranslation.createMany({
          data: data.translations.map((t) => ({
            forumId,
            locale: t.locale,
            title: t.title,
            shortDescription: t.shortDescription || null,
            description: t.description || null,
            program: t.program || null,
            venueName: t.venueName || null,
            venueAddress: t.venueAddress || null,
          })),
        })
      }

      // Update categories if provided
      if (data.categories && data.categories.length > 0) {
        // Get existing categories
        const existingCategories = await tx.ticketCategory.findMany({
          where: { forumId },
          select: { id: true, code: true },
        })

        const incomingCodes = data.categories.map((c) => c.code)

        // Deactivate categories that were removed (don't delete — OrderItem references them)
        const removedCategories = existingCategories.filter((ec) => !incomingCodes.includes(ec.code))
        if (removedCategories.length > 0) {
          await tx.ticketCategory.updateMany({
            where: { id: { in: removedCategories.map((c) => c.id) } },
            data: { isActive: false },
          })
        }

        // Upsert each incoming category
        for (const category of data.categories) {
          const existing = existingCategories.find((ec) => ec.code === category.code)

          if (existing) {
            // Update existing category
            await tx.ticketCategory.update({
              where: { id: existing.id },
              data: {
                priceMinor: category.priceMinor,
                currency: category.currency,
                capacity: category.capacity || null,
                isActive: category.isActive ?? true,
                sortOrder: category.sortOrder,
              },
            })

            // Upsert translations
            for (const t of category.translations) {
              await tx.ticketCategoryTranslation.upsert({
                where: { categoryId_locale: { categoryId: existing.id, locale: t.locale } },
                update: { name: t.name, description: t.description || null },
                create: { categoryId: existing.id, locale: t.locale, name: t.name, description: t.description || null },
              })
            }
          } else {
            // Create new category
            const newCategory = await tx.ticketCategory.create({
              data: {
                forumId,
                code: category.code,
                priceMinor: category.priceMinor,
                currency: category.currency,
                capacity: category.capacity || null,
                isActive: category.isActive ?? true,
                sortOrder: category.sortOrder,
              },
            })

            await tx.ticketCategoryTranslation.createMany({
              data: category.translations.map((t) => ({
                categoryId: newCategory.id,
                locale: t.locale,
                name: t.name,
                description: t.description || null,
              })),
            })
          }
        }
      }

      // If status changed to PUBLISHED and publishedAt is null, set it now
      if (data.status === ForumStatus.PUBLISHED && !existingForum.publishedAt) {
        await tx.forum.update({
          where: { id: forumId },
          data: { publishedAt: new Date() },
        })

        // Create notifications for all users about new forum
        const users = await tx.user.findMany({
          where: {
            status: 'ACTIVE',
            announcementsPushEnabled: true,
          },
          select: { id: true, preferredLocale: true },
        })

        const forumTitle = await tx.forumTranslation.findFirst({
          where: { forumId, locale: 'RU' },
          select: { title: true },
        })

        for (const user of users) {
          await tx.notification.create({
            data: {
              userId: user.id,
              forumId,
              type: NotificationType.FORUM_PUBLISHED,
              locale: user.preferredLocale,
              title: 'Новое мероприятие',
              body: `Опубликовано новое мероприятие: ${forumTitle?.title || 'Без названия'}`,
            },
          })
        }
      }

      // If critical fields changed, notify ticket holders
      if (criticalFieldsChanged && existingForum.status === ForumStatus.PUBLISHED) {
        const ticketHolders = await tx.user.findMany({
          where: {
            purchasedTickets: {
              some: {
                forumId,
                status: 'ACTIVE',
              },
            },
          },
          select: { id: true, preferredLocale: true },
          distinct: ['id'],
        })

        for (const user of ticketHolders) {
          await tx.notification.create({
            data: {
              userId: user.id,
              forumId,
              type: NotificationType.FORUM_UPDATED,
              locale: user.preferredLocale,
              title: 'Изменение в мероприятии',
              body: 'Важная информация о мероприятии была обновлена. Проверьте детали.',
            },
          })
        }
      }

      // Log audit event
      await tx.auditLog.create({
        data: {
          actorId: authResult.user.userId,
          action: 'FORUM_UPDATED',
          targetType: 'Forum',
          targetId: forumId,
          metadata: {
            updates: Object.keys(data),
            criticalFieldsChanged,
            statusChange: data.status !== existingForum.status ? {
              from: existingForum.status,
              to: data.status,
            } : undefined,
          },
        },
      })

      return forum
    })

    // Fetch complete updated forum
    const completeForum = await prisma.forum.findUnique({
      where: { id: forumId },
      include: {
        translations: true,
        categories: {
          include: {
            translations: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })

    revalidatePublicForums()
    return NextResponse.json({
      message: 'Мероприятие успешно обновлено',
      forum: completeForum,
      notificationsCreated: criticalFieldsChanged,
    })
  } catch (error) {
    console.error('Error updating forum:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return jsonError('FORUM_NOT_FOUND', 'Мероприятие не найдено', 404)
      }
    }

    return jsonError('INTERNAL_SERVER_ERROR', 'Не удалось обновить мероприятие', 500)
  }
}

/**
 * DELETE - Cancel/soft delete forum
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const authResult = await requireManager(request)
  if ('headers' in authResult) return authResult

  const { forumId } = await context.params

  if (!validUuid(forumId)) {
    return jsonError('INVALID_FORUM_ID', 'Неверный формат ID мероприятия', 400)
  }

  try {
    const forum = await prisma.forum.findUnique({
      where: { id: forumId },
      include: {
        _count: {
          select: {
            tickets: {
              where: { status: { in: ['ACTIVE', 'USED'] } },
            },
          },
        },
      },
    })

    if (!forum) {
      return jsonError('FORUM_NOT_FOUND', 'Мероприятие не найдено', 404)
    }

    // If tickets sold, change status to CANCELLED instead of deleting
    if (forum._count.tickets > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.forum.update({
          where: { id: forumId },
          data: { status: ForumStatus.CANCELLED },
        })

        // Notify ticket holders
        const ticketHolders = await tx.user.findMany({
          where: {
            purchasedTickets: {
              some: {
                forumId,
                status: { in: ['ACTIVE', 'USED'] },
              },
            },
          },
          select: { id: true, preferredLocale: true },
          distinct: ['id'],
        })

        for (const user of ticketHolders) {
          await tx.notification.create({
            data: {
              userId: user.id,
              forumId,
              type: NotificationType.FORUM_CANCELLED,
              locale: user.preferredLocale,
              title: 'Мероприятие отменено',
              body: 'Мероприятие было отменено. Вы можете подать запрос на возврат средств.',
            },
          })
        }

        // Log audit event
        await tx.auditLog.create({
          data: {
            actorId: authResult.user.userId,
            action: 'FORUM_CANCELLED',
            targetType: 'Forum',
            targetId: forumId,
            metadata: {
              reason: 'admin_cancellation',
              ticketsSold: forum._count.tickets,
            },
          },
        })
      })

      revalidatePublicForums()
      return NextResponse.json({
        message: 'Мероприятие отменено (есть проданные билеты)',
        status: ForumStatus.CANCELLED,
        ticketHoldersNotified: true,
      })
    } else {
      // No tickets sold, can safely delete
      await prisma.$transaction(async (tx) => {
        // Delete related data first
        await tx.forumTranslation.deleteMany({ where: { forumId } })
        await tx.ticketCategory.deleteMany({ where: { forumId } })
        
        // Delete forum
        await tx.forum.delete({ where: { id: forumId } })

        // Log audit event
        await tx.auditLog.create({
          data: {
            actorId: authResult.user.userId,
            action: 'FORUM_DELETED',
            targetType: 'Forum',
            targetId: forumId,
            metadata: {
              slug: forum.slug,
            },
          },
        })
      })

      revalidatePublicForums()
      return NextResponse.json({
        message: 'Мероприятие удалено',
        deleted: true,
      })
    }
  } catch (error) {
    console.error('Error deleting forum:', error)
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return jsonError('FORUM_NOT_FOUND', 'Мероприятие не найдено', 404)
      }
    }

    return jsonError('INTERNAL_SERVER_ERROR', 'Не удалось удалить мероприятие', 500)
  }
}
