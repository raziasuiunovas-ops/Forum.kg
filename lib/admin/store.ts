'use client'

/**
 * Demo store for the admin panel. Until the backend exposes /api/v1/admin/* endpoints
 * (they are described in docs/openapi.yaml), data lives in the browser (localStorage).
 * Replace the functions in `actions` with fetch() calls - the UI does not need to change.
 */
import { useSyncExternalStore } from 'react'
import type {
  AdminForum, AdminState, AuditEntry, CancellationRequest, ForumStatus, OfflineAdmission,
  SiteSettingsData, StaffMember, StaffRole, TicketStatus,
} from './types'
import { INITIAL_STATE } from './mock'

const KEY = 'forumkg_admin_demo_v1'
let state: AdminState = INITIAL_STATE
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) state = { ...INITIAL_STATE, ...JSON.parse(raw) }
  } catch {
    /* storage unavailable: keep in-memory demo data */
  }
}

function set(next: AdminState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`

export function resetDemoData() {
  set(INITIAL_STATE)
}

export const actions = {
  audit(actor: string, action: string, targetType: string, target: string) {
    const e: AuditEntry = { id: uid('a'), at: new Date().toISOString(), actor, action, targetType, target }
    set({ ...state, audit: [e, ...state.audit] })
  },
  saveForum(f: AdminForum, actor: string) {
    const exists = state.forums.some((x) => x.id === f.id)
    set({ ...state, forums: exists ? state.forums.map((x) => (x.id === f.id ? f : x)) : [f, ...state.forums] })
    actions.audit(actor, exists ? 'FORUM_UPDATED' : 'FORUM_CREATED', 'Forum', f.title.ru)
  },
  setForumStatus(id: string, status: ForumStatus, actor: string) {
    const f = state.forums.find((x) => x.id === id)
    if (!f) return
    set({ ...state, forums: state.forums.map((x) => (x.id === id ? { ...x, status } : x)) })
    actions.audit(actor, status === 'PUBLISHED' ? 'FORUM_PUBLISHED' : status === 'CANCELLED' ? 'FORUM_CANCELLED' : 'FORUM_STATUS_CHANGED', 'Forum', f.title.ru)
  },
  decideCancellation(id: string, status: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW', note: string, actor: string) {
    const c = state.cancellations.find((x) => x.id === id)
    if (!c) return
    set({ ...state, cancellations: state.cancellations.map((x) => (x.id === id ? { ...x, status, adminNote: note } : x)) })
    actions.audit(actor, `CANCELLATION_${status}`, 'CancellationRequest', c.orderNumber)
  },
  /** Step 2: invalidate the tickets. Frees the per-account allowance. Does NOT refund money. */
  invalidateCancellationTickets(id: string, actor: string) {
    const c = state.cancellations.find((x) => x.id === id)
    if (!c || c.status !== 'APPROVED') return
    set({
      ...state,
      cancellations: state.cancellations.map((x) => (x.id === id ? { ...x, ticketsInvalidated: true, status: 'COMPLETED', refund: 'PENDING' } : x)),
      orders: state.orders.map((o) => (o.number === c.orderNumber ? { ...o, status: 'CANCELLED' } : o)),
      tickets: state.tickets.map((t) => (t.buyerName === c.userName && t.forumId === c.forumId && t.status === 'ACTIVE' ? { ...t, status: 'CANCELLED' } : t)),
    })
    actions.audit(actor, 'TICKETS_INVALIDATED', 'CancellationRequest', c.orderNumber)
  },
  /** Step 3 (separate): record refund progress. */
  setRefund(id: string, refund: CancellationRequest['refund'], actor: string) {
    const c = state.cancellations.find((x) => x.id === id)
    if (!c) return
    set({ ...state, cancellations: state.cancellations.map((x) => (x.id === id ? { ...x, refund } : x)) })
    actions.audit(actor, `REFUND_${refund}`, 'CancellationRequest', c.orderNumber)
  },
  setTicketStatus(id: string, status: TicketStatus, reason: string, actor: string) {
    const t = state.tickets.find((x) => x.id === id)
    if (!t) return
    set({ ...state, tickets: state.tickets.map((x) => (x.id === id ? { ...x, status } : x)) })
    actions.audit(actor, 'TICKET_INVALIDATED_MANUALLY', 'Ticket', `${t.number} — ${reason}`)
  },
  setUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', actor: string) {
    const u = state.users.find((x) => x.id === id)
    if (!u) return
    set({ ...state, users: state.users.map((x) => (x.id === id ? { ...x, status } : x)) })
    actions.audit(actor, status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_ACTIVATED', 'User', u.name)
  },
  setStaffRole(id: string, role: StaffRole, actor: string) {
    const s = state.staff.find((x) => x.id === id)
    if (!s) return
    set({ ...state, staff: state.staff.map((x) => (x.id === id ? { ...x, role } : x)) })
    actions.audit(actor, 'ROLE_CHANGED', 'Staff', `${s.name} → ${role}`)
  },
  addStaff(m: Omit<StaffMember, 'id'>, actor: string) {
    set({ ...state, staff: [...state.staff, { ...m, id: uid('s') }] })
    actions.audit(actor, 'STAFF_ADDED', 'Staff', `${m.name} (${m.role})`)
  },
  toggleStaff(id: string, actor: string) {
    const s = state.staff.find((x) => x.id === id)
    if (!s) return
    set({ ...state, staff: state.staff.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) })
    actions.audit(actor, s.active ? 'STAFF_DISABLED' : 'STAFF_ENABLED', 'Staff', s.name)
  },
  saveSettings(s: SiteSettingsData, actor: string) {
    set({ ...state, settings: s })
    actions.audit(actor, 'SITE_SETTINGS_UPDATED', 'SiteSettings', s.displayName)
  },
  addOffline(o: Omit<OfflineAdmission, 'id' | 'status'>, actor: string) {
    set({ ...state, offline: [{ ...o, id: uid('oa'), status: 'PROVISIONAL' }, ...state.offline] })
    actions.audit(actor, 'OFFLINE_ADMISSION_RECORDED', 'OfflineAdmission', `${o.participant} — ${o.receipt}`)
  },
  setOfflineStatus(id: string, status: OfflineAdmission['status'], actor: string) {
    const o = state.offline.find((x) => x.id === id)
    if (!o) return
    set({ ...state, offline: state.offline.map((x) => (x.id === id ? { ...x, status } : x)) })
    actions.audit(actor, `OFFLINE_ADMISSION_${status}`, 'OfflineAdmission', o.participant)
  },
  addNotification(n: { title: string; audience: string; type: string }, actor: string) {
    set({
      ...state,
      notifications: [{ id: uid('n'), at: new Date().toISOString(), sent: 0, failed: 0, ...n }, ...state.notifications],
    })
    actions.audit(actor, 'NOTIFICATION_QUEUED', 'Notification', n.title)
  },
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useAdminState(): AdminState {
  load()
  return useSyncExternalStore(subscribe, () => state, () => INITIAL_STATE)
}
