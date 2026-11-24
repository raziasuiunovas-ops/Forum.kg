import type { StaffRole } from './types'

/** Navigation per spec section 8.1. `roles` = who may see the section. */
export const NAV: { id: string; label: string; roles: StaffRole[] }[] = [
  { id: '', label: 'Панель управления', roles: ['SUPER_ADMIN', 'MANAGER'] },
  { id: 'forums', label: 'Форумы', roles: ['SUPER_ADMIN', 'MANAGER'] },
  { id: 'orders', label: 'Заказы и отмены', roles: ['SUPER_ADMIN', 'MANAGER'] },
  { id: 'payments', label: 'Платежи', roles: ['SUPER_ADMIN', 'MANAGER'] },
  { id: 'tickets', label: 'Билеты', roles: ['SUPER_ADMIN', 'MANAGER'] },
  { id: 'users', label: 'Пользователи', roles: ['SUPER_ADMIN', 'MANAGER'] },
  { id: 'scanner', label: 'Вход / QR-сканер', roles: ['SUPER_ADMIN', 'MANAGER', 'SCANNER'] },
  { id: 'notifications', label: 'Уведомления', roles: ['SUPER_ADMIN', 'MANAGER'] },
  { id: 'analytics', label: 'Аналитика и экспорт', roles: ['SUPER_ADMIN', 'MANAGER'] },
  { id: 'staff', label: 'Сотрудники и роли', roles: ['SUPER_ADMIN'] },
  { id: 'settings', label: 'Настройки сайта', roles: ['SUPER_ADMIN'] },
  { id: 'integrations', label: 'Интеграции', roles: ['SUPER_ADMIN'] },
  { id: 'audit', label: 'Журнал аудита', roles: ['SUPER_ADMIN'] },
]
