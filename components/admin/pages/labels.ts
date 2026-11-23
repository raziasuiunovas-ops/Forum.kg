import type { CancellationStatus, ForumStatus, OrderStatus, PaymentStatus, RefundStatus, StaffRole, TicketStatus } from '@/lib/admin/types'

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'purple'

export const FORUM_LABEL: Record<ForumStatus, string> = { DRAFT: 'Черновик', SCHEDULED: 'Запланирован', PUBLISHED: 'Опубликован', COMPLETED: 'Завершён', CANCELLED: 'Отменён' }
export const FORUM_TONE: Record<ForumStatus, Tone> = { DRAFT: 'slate', SCHEDULED: 'blue', PUBLISHED: 'green', COMPLETED: 'purple', CANCELLED: 'red' }

export const ORDER_LABEL: Record<OrderStatus, string> = { PENDING_PAYMENT: 'Ожидает оплаты', PAID: 'Оплачен', PAYMENT_FAILED: 'Ошибка оплаты', EXPIRED: 'Бронь истекла', CANCELLATION_REQUESTED: 'Запрошена отмена', CANCELLED: 'Отменён' }
export const ORDER_TONE: Record<OrderStatus, Tone> = { PENDING_PAYMENT: 'amber', PAID: 'green', PAYMENT_FAILED: 'red', EXPIRED: 'slate', CANCELLATION_REQUESTED: 'amber', CANCELLED: 'red' }

export const PAY_LABEL: Record<PaymentStatus, string> = { PAID: 'Оплачен', PENDING: 'В обработке', FAILED: 'Ошибка', REFUND_PENDING: 'Ожидает возврата', REFUNDED: 'Возвращён' }
export const PAY_TONE: Record<PaymentStatus, Tone> = { PAID: 'green', PENDING: 'amber', FAILED: 'red', REFUND_PENDING: 'amber', REFUNDED: 'slate' }

export const TICKET_LABEL: Record<TicketStatus, string> = { ACTIVE: 'Действителен', USED: 'Использован', CANCELLED: 'Аннулирован' }
export const TICKET_TONE: Record<TicketStatus, Tone> = { ACTIVE: 'green', USED: 'slate', CANCELLED: 'red' }

export const CANCEL_LABEL: Record<CancellationStatus, string> = { SUBMITTED: 'Подана', UNDER_REVIEW: 'На рассмотрении', APPROVED: 'Одобрена', REJECTED: 'Отклонена', COMPLETED: 'Завершена' }
export const CANCEL_TONE: Record<CancellationStatus, Tone> = { SUBMITTED: 'amber', UNDER_REVIEW: 'blue', APPROVED: 'green', REJECTED: 'red', COMPLETED: 'slate' }

export const REFUND_LABEL: Record<RefundStatus, string> = { NONE: 'Не начат', PENDING: 'Ожидает', PROCESSING: 'В обработке', SUCCEEDED: 'Выполнен', FAILED: 'Ошибка' }

export const ROLE_LABEL: Record<StaffRole, string> = { SUPER_ADMIN: 'Главный администратор', MANAGER: 'Менеджер', SCANNER: 'Оператор входа' }
