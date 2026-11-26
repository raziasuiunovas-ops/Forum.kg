/**
 * Telegram Notification Service
 * Handles automated notifications via Telegram bot
 */

import { prisma } from '@/lib/db'
import { sendTelegramMessage } from '@/lib/integrations/telegram'
import { ForumStatus, TicketStatus } from '@prisma/client'

/**
 * Send welcome message to new users who connected Telegram
 */
export async function sendWelcomeMessage(chatId: string, userName: string): Promise<void> {
  const text = `👋 Привет, ${userName}!

Добро пожаловать в FORUM.KG! 🎉

Теперь вы будете получать:
📢 Уведомления о новых форумах
🎫 Подтверждения покупки билетов
⏰ Напоминания о предстоящих событиях

Следите за анонсами — самые интересные события Кыргызстана ждут вас!

🌐 Сайт: forum.kg
📱 Билеты всегда в вашем телефоне!`

  await sendTelegramMessage({
    chatId,
    text,
    parseMode: 'HTML',
    disableWebPagePreview: true,
  })
}

/**
 * Send reminder about upcoming forum
 * @param daysBeforeEvent - How many days before the event to send reminder
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
        include: {
          telegramConnection: true,
        },
      },
      forum: {
        include: {
          translations: {
            where: { locale: 'RU' },
          },
        },
      },
      orderItem: {
        include: {
          ticketCategory: true,
        },
      },
    },
  })

  let sentCount = 0

  // Group tickets by user to send one message per user
  const ticketsByUser = new Map<string, typeof tickets>()
  for (const ticket of tickets) {
    if (!ticket.buyer.telegramConnection?.chatId) continue
    
    const userId = ticket.buyer.id
    if (!ticketsByUser.has(userId)) {
      ticketsByUser.set(userId, [])
    }
    ticketsByUser.get(userId)!.push(ticket)
  }

  // Send reminders
  for (const [userId, userTickets] of ticketsByUser.entries()) {
    const chatId = userTickets[0].buyer.telegramConnection!.chatId
    const forum = userTickets[0].forum
    const title = forum.translations[0]?.title || 'Форум'
    
    const forumDate = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: forum.timeZone || 'Asia/Bishkek',
    }).format(new Date(forum.startsAt!))

    const ticketWord = userTickets.length === 1 ? 'билет' : userTickets.length < 5 ? 'билета' : 'билетов'

    const text = `⏰ <b>Напоминание о форуме!</b>

🎯 <b>${title}</b>

📅 ${forumDate}
${forum.venueName ? `📍 ${forum.venueName}` : ''}

🎫 У вас ${userTickets.length} ${ticketWord}

${daysBeforeEvent === 0 ? '🔥 <b>Событие сегодня!</b>' : daysBeforeEvent === 1 ? '⏳ <b>Завтра</b> — не забудьте!' : `⏳ Осталось <b>${daysBeforeEvent} ${daysBeforeEvent < 5 ? 'дня' : 'дней'}</b>`}

📱 QR-коды билетов доступны в личном кабинете на forum.kg

До встречи на форуме! 🚀`

    try {
      await sendTelegramMessage({
        chatId,
        text,
        parseMode: 'HTML',
        disableWebPagePreview: true,
      })
      sentCount++
    } catch (error) {
      console.error(`[Telegram Reminder] Failed to send to user ${userId}:`, error)
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
          translation: {
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
  const description = forum.translations[0]?.shortDescription || forum.translations[0]?.description || ''
  
  const forumDate = forum.startsAt 
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: forum.timeZone || 'Asia/Bishkek',
      }).format(new Date(forum.startsAt))
    : 'Дата уточняется'

  // Get min price
  const minPrice = forum.categories.length > 0
    ? Math.min(...forum.categories.map(c => c.priceMinor))
    : null

  const priceText = minPrice 
    ? `💰 От ${(minPrice / 100).toFixed(0)} сом`
    : ''

  const text = `🆕 <b>Новый форум доступен для регистрации!</b>

🎯 <b>${title}</b>

${description ? `📝 ${description.substring(0, 200)}${description.length > 200 ? '...' : ''}\n\n` : ''}📅 ${forumDate}
${forum.venueName ? `📍 ${forum.venueName}` : ''}
${priceText}

🎟 Билеты уже в продаже!

🌐 Подробности и регистрация: forum.kg/${forum.slug}

Не упустите возможность! 🚀`

  // Get all users with Telegram connected and announcements enabled
  const users = await prisma.user.findMany({
    where: {
      announcementsPushEnabled: true,
      telegramConnection: {
        isNot: null,
        disconnectedAt: null,
      },
    },
    include: {
      telegramConnection: true,
    },
  })

  let sentCount = 0

  for (const user of users) {
    if (!user.telegramConnection?.chatId) continue

    try {
      await sendTelegramMessage({
        chatId: user.telegramConnection.chatId,
        text,
        parseMode: 'HTML',
        disableWebPagePreview: false,
      })
      sentCount++
      
      // Rate limiting: небольшая пауза между сообщениями
      await new Promise(resolve => setTimeout(resolve, 50))
    } catch (error) {
      console.error(`[Telegram Announcement] Failed to send to user ${user.id}:`, error)
    }
  }

  return sentCount
}

/**
 * Send custom notification to specific user
 */
export async function sendCustomNotification(
  userId: string,
  title: string,
  message: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { telegramConnection: true },
  })

  if (!user?.telegramConnection?.chatId) {
    throw new Error('User does not have Telegram connected')
  }

  const text = `🔔 <b>${title}</b>

${message}`

  await sendTelegramMessage({
    chatId: user.telegramConnection.chatId,
    text,
    parseMode: 'HTML',
    disableWebPagePreview: true,
  })
}

/**
 * Send bulk notification to all subscribers
 */
export async function sendBulkNotification(
  title: string,
  message: string,
  onlyWithTickets: boolean = false
): Promise<number> {
  let users

  if (onlyWithTickets) {
    // Send only to users who have active tickets
    users = await prisma.user.findMany({
      where: {
        telegramConnection: {
          isNot: null,
          disconnectedAt: null,
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
      include: {
        telegramConnection: true,
      },
    })
  } else {
    // Send to all subscribers
    users = await prisma.user.findMany({
      where: {
        announcementsPushEnabled: true,
        telegramConnection: {
          isNot: null,
          disconnectedAt: null,
        },
      },
      include: {
        telegramConnection: true,
      },
    })
  }

  const text = `📢 <b>${title}</b>

${message}

---
FORUM.KG — Ваш источник событий`

  let sentCount = 0

  for (const user of users) {
    if (!user.telegramConnection?.chatId) continue

    try {
      await sendTelegramMessage({
        chatId: user.telegramConnection.chatId,
        text,
        parseMode: 'HTML',
        disableWebPagePreview: true,
      })
      sentCount++
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 50))
    } catch (error) {
      console.error(`[Telegram Bulk] Failed to send to user ${user.id}:`, error)
    }
  }

  return sentCount
}
