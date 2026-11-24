/** Admin panel data model (mirrors prisma/schema.prisma; money in tyiyn). */
export type Loc = 'ru' | 'ky' | 'en'
export type L10n = Record<Loc, string>

export type ForumStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED'

export interface AdminCategory {
  code: string
  priceMinor: number
  capacity: number | null
}

export interface AdminForum {
  id: string
  slug: string
  status: ForumStatus
  title: L10n
  shortDescription: L10n
  description: L10n
  program: L10n
  bannerUrl: string
  startsAt: string
  endsAt: string | null
  venueName: string
  venueAddress: string
  capacity: number
  maxTicketsPerAccount: number
  qrExpiresAt: string
  publishAt: string | null
  categories: AdminCategory[]
  sold: number
  checkedIn: number
}

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PAYMENT_FAILED'
  | 'EXPIRED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED'

export interface AdminOrder {
  id: string
  number: string
  userName: string
  forumId: string
  items: { participant: string; category: string; priceMinor: number }[]
  totalMinor: number
  status: OrderStatus
  createdAt: string
}

export type PaymentStatus = 'PAID' | 'PENDING' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED'

export interface AdminPayment {
  id: string
  orderNumber: string
  userName: string
  forumId: string
  amountMinor: number
  status: PaymentStatus
  providerRef: string
  paidAt: string
}

export type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED'

export interface AdminTicket {
  id: string
  number: string
  forumId: string
  participant: string
  buyerName: string
  category: string
  status: TicketStatus
  issuedAt: string
  checkedInAt: string | null
}

export interface AdminUser {
  id: string
  name: string
  phone: string
  email: string | null
  registeredAt: string
  status: 'ACTIVE' | 'SUSPENDED'
  orders: number
  tickets: number
  spentMinor: number
}

export type CancellationStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
export type RefundStatus = 'NONE' | 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

/** Cancellation approval, ticket invalidation and refund are separate operations (spec section 2). */
export interface CancellationRequest {
  id: string
  orderNumber: string
  userName: string
  forumId: string
  ticketCount: number
  amountMinor: number
  reason: string
  createdAt: string
  status: CancellationStatus
  ticketsInvalidated: boolean
  refund: RefundStatus
  adminNote?: string
}

export type StaffRole = 'SUPER_ADMIN' | 'MANAGER' | 'SCANNER'
export interface StaffMember {
  id: string
  name: string
  contact: string
  role: StaffRole
  forumIds: string[]
  active: boolean
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  action: string
  targetType: string
  target: string
}

export interface AdminNotification {
  id: string
  at: string
  type: string
  title: string
  audience: string
  sent: number
  failed: number
}

export interface OfflineAdmission {
  id: string
  forumId: string
  participant: string
  receipt: string
  app: string
  operator: string
  observedAt: string
  status: 'PROVISIONAL' | 'VERIFIED' | 'REJECTED' | 'DUPLICATE'
  note: string
}

export interface SiteSettingsData {
  displayName: string
  logoUrl: string
  heroImageUrl: string
  primaryColorHex: string
  accentColorHex: string
  footerColorHex: string
  heroSlogan: L10n
  organizerInfo: L10n
  contactEmail: string
  contactPhone: string
  socialLinks: { platform: string; url: string }[]
}

export interface AdminState {
  forums: AdminForum[]
  orders: AdminOrder[]
  payments: AdminPayment[]
  tickets: AdminTicket[]
  users: AdminUser[]
  cancellations: CancellationRequest[]
  staff: StaffMember[]
  audit: AuditEntry[]
  notifications: AdminNotification[]
  offline: OfflineAdmission[]
  settings: SiteSettingsData
}
