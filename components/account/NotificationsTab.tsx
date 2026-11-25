'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2, CheckCircle2 } from 'lucide-react'

export function NotificationsTab({ locale }: { locale: string }) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission)

    // Check if already subscribed
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
    }).catch(() => {})
  }, [])

  const subscribe = async () => {
    setLoading(true)
    setStatus('idle')
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setStatus('error')
        setMsg('Вы запретили уведомления. Разрешите их в настройках браузера.')
        return
      }

      // Register SW
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
      })

      const json = sub.toJSON()
      await fetch('/api/v1/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      })

      setSubscribed(true)
      setStatus('success')
      setMsg('Уведомления включены! Вы будете получать их о своих билетах и форумах.')
    } catch (e) {
      setStatus('error')
      setMsg('Не удалось включить уведомления. Попробуйте позже.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const unsubscribe = async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/v1/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setSubscribed(false)
      setStatus('idle')
      setMsg('')
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (permission === 'unsupported') {
    return (
      <div className="rounded-2xl bg-amber-50 p-6 text-center">
        <BellOff className="mx-auto h-10 w-10 text-amber-400" />
        <h3 className="mt-3 font-bold text-amber-800">Уведомления недоступны</h3>
        <p className="mt-1 text-sm text-amber-700">Ваш браузер не поддерживает push-уведомления. Попробуйте Chrome или Safari.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-black tracking-tight text-ink">Уведомления</h2>
      <p className="mt-2 text-sm text-slate-500">Получайте уведомления о своих билетах, форумах и новостях прямо в браузере.</p>

      {/* Main card */}
      <div className="mt-6 rounded-2xl bg-surface p-6 ring-1 ring-slate-200/70">
        <div className="flex items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full ${subscribed ? 'bg-emerald-100' : 'bg-slate-100'}`}>
            {subscribed
              ? <Bell className="h-7 w-7 text-emerald-600" />
              : <BellOff className="h-7 w-7 text-slate-400" />
            }
          </div>
          <div className="flex-1">
            <p className="font-bold text-ink">{subscribed ? 'Уведомления включены' : 'Уведомления отключены'}</p>
            <p className="text-sm text-slate-500">
              {subscribed
                ? 'Вы будете получать важные уведомления'
                : 'Включите чтобы не пропустить ничего важного'
              }
            </p>
          </div>
          {subscribed
            ? (
              <button
                onClick={unsubscribe}
                disabled={loading}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Отключить'}
              </button>
            )
            : (
              <button
                onClick={subscribe}
                disabled={loading || permission === 'denied'}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Включить'}
              </button>
            )
          }
        </div>

        {permission === 'denied' && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">
            Уведомления заблокированы в браузере. Нажмите на замок рядом с адресом сайта и разрешите уведомления.
          </p>
        )}

        {status === 'success' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {msg}
          </div>
        )}

        {status === 'error' && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">{msg}</p>
        )}
      </div>

      {/* What you'll receive */}
      <div className="mt-6 rounded-2xl bg-surface p-6 ring-1 ring-slate-200/70">
        <h3 className="font-bold text-ink">Какие уведомления вы получите</h3>
        <ul className="mt-4 space-y-3">
          {[
            { icon: '🎫', text: 'Билет оплачен — сразу после успешной оплаты' },
            { icon: '📅', text: 'Напоминание о форуме — за день до начала' },
            { icon: '📢', text: 'Новые форумы — когда открывается регистрация' },
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
              <span className="text-lg">{item.icon}</span>
              {item.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}
