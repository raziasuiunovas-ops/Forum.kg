'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, LogOut, Menu, X } from 'lucide-react'
import { api, resetCsrf } from '@/lib/client/api'
import { NAV } from '@/lib/admin/nav'
import type { StaffRole } from '@/lib/admin/types'
import { LogoMark } from '@/components/layout/Logo'

export interface AdminUser {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  role: StaffRole | 'USER'
}

const Ctx = createContext<{ user: AdminUser; actor: string } | null>(null)
export const useAdminUser = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAdminUser outside AdminShell')
  return v
}

const STAFF_ROLES: string[] = ['SUPER_ADMIN', 'MANAGER', 'SCANNER']
const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Главный администратор', MANAGER: 'Менеджер', SCANNER: 'Оператор входа' }

/** Admin layout. The backend enforces permissions too; this only hides what the role cannot use. */
export function AdminShell({ locale, children }: { locale: string; children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  // /ru/admin/forums -> "forums" ("" for the dashboard)
  const section = pathname.split('/')[3] ?? ''
  const [user, setUser] = useState<AdminUser | null>(null)
  const [open, setOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  useEffect(() => {
    let alive = true
    api<{ user: AdminUser }>('/api/v1/users/me').then((res) => {
      if (!alive) return
      const u = res.data?.user
      if (res.ok && u && STAFF_ROLES.includes(u.role)) setUser(u)
      else router.replace(`/${locale}/admin/login`)
    })
    return () => {
      alive = false
    }
  }, [router, locale])

  useEffect(() => setOpen(false), [pathname])

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-surface text-sm text-slate-500" role="status">
        <Loader2 className="h-5 w-5 animate-spin" /> Проверяем доступ...
      </div>
    )
  }

  const role = user.role as StaffRole
  const items = NAV.filter((n) => n.roles.includes(role))
  const allowed = items.some((n) => n.id === section)
  const actor = user.email ?? [user.firstName, user.lastName].filter(Boolean).join(' ') ?? 'admin'

  async function logout() {
    await api('/api/v1/auth/logout', { method: 'POST', csrf: true })
    resetCsrf()
    router.push(`/${locale}/admin/login`)
  }

  function confirmLogout() {
    setShowLogoutConfirm(false)
    logout()
  }

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Админ-панель">
      <div className="flex items-center gap-2 px-5 py-5 text-white">
        <LogoMark className="h-6 w-6 text-primary" />
        <span className="text-lg font-extrabold tracking-tight">FORUM<span className="text-primary">.KG</span></span>
        <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70">admin</span>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((n) => {
          const active = n.id === section
          return (
            <li key={n.id || 'home'}>
              <Link href={`/${locale}/admin${n.id ? `/${n.id}` : ''}`} aria-current={active ? 'page' : undefined} className={`block rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-primary text-white' : 'text-white/65 hover:bg-white/8 hover:text-white'}`}>
                {n.label}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-xs font-bold text-white">{actor}</p>
        <p className="text-[11px] text-white/50">{ROLE_LABEL[role]}</p>
        <button type="button" onClick={() => setShowLogoutConfirm(true)} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-white/70 transition hover:text-white">
          <LogOut className="h-4 w-4" /> Выйти
        </button>
      </div>
    </nav>
  )

  return (
    <Ctx.Provider value={{ user, actor }}>
      <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[16rem_1fr]">
        <aside className="hidden bg-footer lg:block">{sidebar}</aside>

        <div className="flex items-center justify-between bg-footer px-4 py-3 text-white lg:hidden">
          <div className="flex items-center gap-2">
            <LogoMark className="h-5 w-5 text-primary" />
            <span className="font-extrabold">FORUM<span className="text-primary">.KG</span> admin</span>
          </div>
          <button type="button" onClick={() => setOpen(true)} aria-label="Меню" className="rounded-lg p-2 hover:bg-white/10 transition-colors">
            <Menu className="h-5 w-5" />
          </button>
        </div>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 right-0 w-64 bg-footer shadow-2xl animate-slide-in-right">
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" className="absolute left-3 top-4 rounded-lg p-1.5 text-white/70 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
              {sidebar}
            </div>
          </div>
        )}

        <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
          {allowed ? (
            children
          ) : (
            <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200/70">
              <p className="text-lg font-black text-ink">Нет доступа</p>
              <p className="mt-2 text-sm text-slate-500">Ваша роль не позволяет открыть этот раздел.</p>
              <Link href={`/${locale}/admin${items[0]?.id ? `/${items[0].id}` : ''}`} className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-bold text-white">
                Перейти в доступный раздел
              </Link>
            </div>
          )}
        </main>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black tracking-tight text-ink">Подтвердите действие</h2>
            <p className="mt-3 text-sm text-slate-600">Аккаунтан чыгууну каалайсызбы?</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-700"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
