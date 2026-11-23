import type { AdminState, AdminForum } from './types'

const l = (ru: string, ky = ru, en = ru) => ({ ru, ky, en })

const forums: AdminForum[] = [
  {
    id: 'f-1',
    slug: 'bishkek-digital-forum-2026',
    status: 'PUBLISHED',
    title: l('Bishkek Digital Forum 2026'),
    shortDescription: l('Крупнейший форум о технологиях в Кыргызстане.', 'Кыргызстандагы технологиялар боюнча эң чоң форум.', 'The largest technology forum in Kyrgyzstan.'),
    description: l('Доклады лидеров индустрии, панели, демо стартапов и нетворкинг.', 'Тармак лидерлеринин докладдары, панелдер, стартап-демолор.', 'Industry keynotes, panels, startup demos and networking.'),
    program: l('10:00 Открытие · 11:00 Keynote · 13:00 Панель · 15:00 Демо стартапов'),
    bannerUrl: '/images/forum-tech.webp',
    startsAt: '2027-01-24T10:00:00+06:00',
    endsAt: '2027-01-24T19:00:00+06:00',
    venueName: 'Sheraton',
    venueAddress: 'пр. Чуй 128, Бишкек',
    capacity: 500,
    maxTicketsPerAccount: 2,
    qrExpiresAt: '2027-01-24T20:00:00+06:00',
    publishAt: null,
    categories: [
      { code: 'STANDARD', priceMinor: 250000, capacity: 400 },
      { code: 'VIP', priceMinor: 600000, capacity: 100 },
    ],
    sold: 452,
    checkedIn: 0,
  },
  {
    id: 'f-2',
    slug: 'fintech-forum-central-asia',
    status: 'PUBLISHED',
    title: l('Fintech Forum Central Asia'),
    shortDescription: l('Региональный форум о платежах и финтехе.'),
    description: l('Банки, финтех-компании и регуляторы в одном зале.'),
    program: l(''),
    bannerUrl: '/images/forum-finance.webp',
    startsAt: '2027-02-05T09:30:00+06:00',
    endsAt: null,
    venueName: 'Novotel',
    venueAddress: 'ул. Тоголок Молдо 1, Бишкек',
    capacity: 300,
    maxTicketsPerAccount: 1,
    qrExpiresAt: '2027-02-05T21:00:00+06:00',
    publishAt: null,
    categories: [
      { code: 'STANDARD', priceMinor: 300000, capacity: 250 },
      { code: 'VIP', priceMinor: 700000, capacity: 50 },
    ],
    sold: 188,
    checkedIn: 0,
  },
  {
    id: 'f-3',
    slug: 'education-innovation-summit',
    status: 'SCHEDULED',
    title: l('Education & Innovation Summit'),
    shortDescription: l('Форум об образовании и EdTech.'),
    description: l('Практические сессии, кейсы школ и университетов.'),
    program: l(''),
    bannerUrl: '/images/forum-edu.svg',
    startsAt: '2027-02-18T11:00:00+06:00',
    endsAt: null,
    venueName: 'Jannat Resort',
    venueAddress: 'Ош',
    capacity: 200,
    maxTicketsPerAccount: 1,
    qrExpiresAt: '2027-02-18T20:00:00+06:00',
    publishAt: '2027-01-10T09:00:00+06:00',
    categories: [{ code: 'STANDARD', priceMinor: 180000, capacity: null }],
    sold: 0,
    checkedIn: 0,
  },
]

const names = ['Айгуль Токтогулова', 'Бакыт Осмонов', 'Нурзат Жумабекова', 'Эрлан Сыдыков', 'Алина Касымова', 'Тимур Абдыкадыров', 'Мээрим Турдубаева', 'Данияр Исаков']

const orders = names.map((n, i) => ({
  id: `o-${i + 1}`,
  number: `FRM-2611-${String(1001 + i)}`,
  userName: n,
  forumId: i % 3 === 2 ? 'f-2' : 'f-1',
  items: [{ participant: n, category: i % 4 === 0 ? 'VIP' : 'Standard', priceMinor: i % 4 === 0 ? 600000 : 250000 }],
  totalMinor: i % 4 === 0 ? 600000 : 250000,
  status: (['PAID', 'PAID', 'PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'PAID', 'CANCELLATION_REQUESTED', 'EXPIRED'] as const)[i],
  createdAt: `2026-11-${String(20 + (i % 3)).padStart(2, '0')}T${String(9 + i).padStart(2, '0')}:1${i}:00+06:00`,
}))

const payments = orders
  .filter((o) => o.status === 'PAID' || o.status === 'CANCELLATION_REQUESTED')
  .map((o, i) => ({
    id: `p-${i + 1}`,
    orderNumber: o.number,
    userName: o.userName,
    forumId: o.forumId,
    amountMinor: o.totalMinor,
    status: (o.status === 'CANCELLATION_REQUESTED' ? 'REFUND_PENDING' : 'PAID') as 'PAID' | 'REFUND_PENDING',
    providerRef: `FNK-${700100 + i * 17}`,
    paidAt: o.createdAt.replace(/:00\+06:00$/, `:${String(10 + i * 7).padStart(2, '0')}+06:00`),
  }))

const tickets = orders
  .filter((o) => o.status === 'PAID' || o.status === 'CANCELLATION_REQUESTED')
  .map((o, i) => ({
    id: `t-${i + 1}`,
    number: `TIX-20261121-${String(482100 + i * 31)}`,
    forumId: o.forumId,
    participant: o.items[0].participant,
    buyerName: o.userName,
    category: o.items[0].category,
    status: 'ACTIVE' as const,
    issuedAt: o.createdAt,
    checkedInAt: null,
  }))

const users = names.map((n, i) => ({
  id: `u-${i + 1}`,
  name: n,
  phone: `+99670${String(1234560 + i * 111).slice(0, 7)}`,
  email: i % 2 === 0 ? `user${i + 1}@mail.kg` : null,
  registeredAt: `2026-11-${String(15 + i).padStart(2, '0')}T12:00:00+06:00`,
  status: 'ACTIVE' as const,
  orders: 1 + (i % 2),
  tickets: 1 + (i % 2),
  spentMinor: 250000 * (1 + (i % 2)),
}))

export const INITIAL_STATE: AdminState = {
  forums,
  orders,
  payments,
  tickets,
  users,
  cancellations: [
    {
      id: 'c-1',
      orderNumber: 'FRM-2611-1007',
      userName: 'Мээрим Турдубаева',
      forumId: 'f-1',
      ticketCount: 1,
      amountMinor: 250000,
      reason: 'Не смогу приехать, изменились планы.',
      createdAt: '2026-11-22T10:15:00+06:00',
      status: 'SUBMITTED',
      ticketsInvalidated: false,
      refund: 'NONE',
    },
    {
      id: 'c-2',
      orderNumber: 'FRM-2611-1002',
      userName: 'Бакыт Осмонов',
      forumId: 'f-1',
      ticketCount: 1,
      amountMinor: 250000,
      reason: 'Заказал дважды по ошибке.',
      createdAt: '2026-11-21T17:40:00+06:00',
      status: 'UNDER_REVIEW',
      ticketsInvalidated: false,
      refund: 'NONE',
    },
  ],
  staff: [
    { id: 's-1', name: 'Главный администратор', contact: 'admin', role: 'SUPER_ADMIN', forumIds: [], active: true },
    { id: 's-2', name: 'Менеджер событий', contact: 'manager@forum.kg', role: 'MANAGER', forumIds: [], active: true },
    { id: 's-3', name: 'Оператор входа 1', contact: '+996700111222', role: 'SCANNER', forumIds: ['f-1'], active: true },
  ],
  audit: [
    { id: 'a-1', at: '2026-11-22T09:00:00+06:00', actor: 'admin', action: 'FORUM_PUBLISHED', targetType: 'Forum', target: 'Bishkek Digital Forum 2026' },
    { id: 'a-2', at: '2026-11-22T09:20:00+06:00', actor: 'admin', action: 'PRICE_CHANGED', targetType: 'TicketCategory', target: 'VIP · Bishkek Digital Forum 2026' },
    { id: 'a-3', at: '2026-11-21T16:05:00+06:00', actor: 'manager@forum.kg', action: 'SITE_SETTINGS_UPDATED', targetType: 'SiteSettings', target: 'Цвета и логотип' },
  ],
  notifications: [
    { id: 'n-1', at: '2026-11-22T09:01:00+06:00', type: 'FORUM_PUBLISHED', title: 'Новый форум: Bishkek Digital Forum 2026', audience: 'Все пользователи', sent: 1284, failed: 12 },
    { id: 'n-2', at: '2026-11-21T12:00:00+06:00', type: 'FORUM_UPDATED', title: 'Изменено место проведения', audience: 'Владельцы билетов', sent: 452, failed: 3 },
  ],
  offline: [],
  settings: {
    displayName: 'FORUM.KG',
    logoUrl: '',
    heroImageUrl: '/images/hero-forum.webp',
    primaryColorHex: '#3B5BFF',
    accentColorHex: '#7C5CFF',
    footerColorHex: '#070B24',
    heroSlogan: l('Люди. Идеи. Будущее.', 'Адамдар. Идеялар. Келечек.', 'People. Ideas. Future.'),
    organizerInfo: l('FORUM.KG — платформа для форумов и продажи билетов в Кыргызстане.'),
    contactEmail: 'info@forum.kg',
    contactPhone: '+996 700 123 456',
    socialLinks: [
      { platform: 'instagram', url: 'https://instagram.com/' },
      { platform: 'telegram', url: 'https://t.me/' },
    ],
  },
}

/** Sales per day (demo) for charts. */
export const SALES_SERIES = [12, 18, 15, 28, 35, 31, 46, 52, 49, 63, 71, 68, 84, 92]
