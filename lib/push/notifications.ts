/**
 * Automated Web Push Notifications Service
 * Sends browser notifications to users' phones/devices
 */

import { prisma } from '@/lib/db'
import { sendPushToUser } from './send'
import { ForumStatus, TicketStatus } from '@prisma/client'

/**
 * Send forum reminders to users with tickets
 * @param daysBeforeEvent - How many days before the event (1, 3, 7, etc.)
 */
export async function sendForumReminders(daysBeforeEvent: number = 1): Promise<number> {
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + daysBeforeEvent)
  targetDate.setHours(0, 0, 0, 0)
  
  const nextDay = new Date(targetDate)
  nextDay.setDate(nextDay.getDate() + 1)

  // Find all tickets for forums starting in X days
  const tickets = await prisma.ticket.findMany({
    where: {
      status: TicketStatus.ACTIVE,
      forum: {
        status: ForumStatus.PUBLISHED,
        startsAt: {
          gte: targetDate,
          lt: nextDay,
        },
      },
    },
    include: {
      buyer: {
        select: {
          id: true,
          firstName: true,
        },
      },
      forum: {
        include: {
          translations: {
            where: { locale: 'RU' },
          },
        },
      },
    },
  })

  // Group tickets by user
  const ticketsByUser = new Map<string, typeof tickets>()
  for (const ticket of tickets) {
    const userId = ticket.buyer.id
    if (!ticketsByUser.has(userId)) {
      ticketsByUser.set(userId, [])
    }
    ticketsByUser.get(userId)!.push(ticket)
  }

  let sentCount = 0

  // Send reminders
  for (const [userId, userTickets] of ticketsByUser.entries()) {
    const forum = userTickets[0].forum
    const title = forum.translations[0]?.title || 'Форум'
    
    const forumDate = forum.startsAt
      ? new Intl.DateTimeFormat('ru-RU', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: forum.timeZone || 'Asia/Bishkek',
        }).format(new Date(forum.startsAt))
      : ''

    const ticketWord = userTickets.length === 1 ? 'билет' : userTickets.length < 5 ? 'билета' : 'билетов'

    const reminderText = daysBeforeEvent === 0
      ? `🔥 Сегодня! ${forumDate}`
      : daysBeforeEvent === 1
      ? `⏰ Завтра, ${forumDate}`
      : `⏰ Через ${daysBeforeEvent} ${daysBeforeEvent < 5 ? 'дня' : 'дней'}, ${forumDate}`

    try {
      await sendPushToUser(userId, {
        title: `${title}`,
        body: `${reminderText}. У вас ${userTickets.length} ${ticketWord}. Не забудьте QR-код!`,
        url: '/ru/account',
        icon: '/icon-512.png',
      })
      sentCount++
    } catch (error) {
      console.error(`[Push Reminder] Failed to send to user ${userId}:`, error)
    }
  }

  return sentCount
}

/**
 * Send notification about new published forum to all subscribers
 */
export async function sendNewForumAnnouncement(forumId: string): Promise<number> {
  const forum = await prisma.forum.findUnique({
    where: { id: forumId },
    include: {
      translations: {
        where: { locale: 'RU' },
      },
      categories: {
        include: {
          translations: {
            where: { locale: 'RU' },
          },
        },
      },
    },
  })

  if (!forum || forum.status !== ForumStatus.PUBLISHED) {
    return 0
  }

  const title = forum.translations[0]?.title || 'Новый форум'
  const description = forum.translations[0]?.shortDescription || ''
  
  const forumDate = forum.startsAt 
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: forum.timeZone || 'Asia/Bishkek',
      }).format(new Date(forum.startsAt))
    : 'Дата уточняется'

  // Get all users with push enabled
  const users = await prisma.user.findMany({
    where: {
      announcementsPushEnabled: true,
      pushSubscriptions: {
        some: {},
      },
    },
    select: {
      id: true,
    },
  })

  let sentCount = 0

  for (const user of users) {
    try {
      await sendPushToUser(user.id, {
        title: `🆕 ${title}`,
        body: `${description || forumDate} 🎟 Билеты уже в продаже!`,
        url: `/ru/forums/${forum.slug}`,
        icon: '/icon-512.png',
      })
      sentCount++
      
      // Rate limiting: небольшая пауза между уведомлениями
      await new Promise(resolve => setTimeout(resolve, 50))
    } catch (error) {
      console.error(`[Push Announcement] Failed to send to user ${user.id}:`, error)
    }
  }

  return sentCount
}

/**
 * Send bulk notification to all subscribers
 */
export async function sendBulkPushNotification(
  title: string,
  message: string,
  url: string = '/ru/account',
  onlyWithTickets: boolean = false
): Promise<number> {
  let users

  if (onlyWithTickets) {
    // Send only to users who have active tickets
    users = await prisma.user.findMany({
      where: {
        pushSubscriptions: {
          some: {},
        },
        orders: {
          some: {
            items: {
              some: {
                ticket: {
                  status: TicketStatus.ACTIVE,
                },
              },
            },
          },
        },
      },
      select: { id: true },
    })
  } else {
    // Send to all subscribers with announcements enabled
    users = await prisma.user.findMany({
      where: {
        announcementsPushEnabled: true,
        pushSubscriptions: {
          some: {},
        },
      },
      select: { id: true },
    })
  }

  let sentCount = 0

  for (const user of users) {
    try {
      await sendPushToUser(user.id, {
        title,
        body: message,
        url,
        icon: '/icon-512.png',
      })
      sentCount++
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 50))
    } catch (error) {
      console.error(`[Push Bulk] Failed to send to user ${user.id}:`, error)
    }
  }

  return sentCount
}

/**
 * Send welcome push notification after user enables notifications
 */
export async function sendWelcomePush(userId: string): Promise<void> {
  try {
    await sendPushToUser(userId, {
      title: '🎉 Уведомления включены!',
      body: 'Теперь вы не пропустите новые форумы и важные события. Следите за анонсами!',
      url: '/ru/forums',
      icon: '/icon-512.png',
    })
  } catch (error) {
    console.error('[Push Welcome] Failed:', error)
  }
}
