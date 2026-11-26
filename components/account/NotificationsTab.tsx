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
    // Detailed browser support check
    const hasNotifications = 'Notification' in window
    const hasServiceWorker = 'serviceWorker' in navigator
    const hasPushManager = hasServiceWorker && 'pushManager' in ServiceWorkerRegistration.prototype
    
    console.log('[Push Debug]', {
      hasNotifications,
      hasServiceWorker,
      hasPushManager,
      userAgent: navigator.userAgent,
      isSecureContext: window.isSecureContext
    })
    
    if (!hasNotifications || !hasServiceWorker || !hasPushManager) {
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

      // Get VAPID key from server
      const vapidRes = await fetch('/api/v1/push/vapid')
      if (!vapidRes.ok) {
        setStatus('error')
        setMsg('Уведомления пока не настроены на сервере.')
        return
      }
      const { publicKey: vapidKey } = await vapidRes.json()
      
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
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isHTTPS = window.location.protocol === 'https:'
    
    return (
      <div className="rounded-2xl bg-amber-50 p-6 max-w-full overflow-x-hidden">
        <BellOff className="mx-auto h-10 w-10 text-amber-400" />
        <h3 className="mt-3 text-center font-bold text-amber-800 break-words">Уведомления недоступны</h3>
        <p className="mt-2 text-center text-sm text-amber-700 break-words">
          {!isHTTPS && 'Уведомления работают только через HTTPS. '}
          {isIOS && 'На iOS уведомления работают только в Safari 16.4+ и выше. '}
          {!isIOS && !isHTTPS && 'Попробуйте открыть сайт через HTTPS или используйте Chrome/Safari.'}
        </p>
        
        {/* Debug info - remove in production */}
        <details className="mt-4 text-xs text-amber-600">
          <summary className="cursor-pointer">Техническая информация</summary>
          <pre className="mt-2 overflow-auto max-w-full rounded bg-amber-100 p-2 text-left text-[10px] break-all whitespace-pre-wrap">
            {JSON.stringify({
              hasNotifications: 'Notification' in window,
              hasServiceWorker: 'serviceWorker' in navigator,
              hasPushManager: 'serviceWorker' in navigator && 'pushManager' in ServiceWorkerRegistration.prototype,
              protocol: window.location.protocol,
              userAgent: navigator.userAgent.substring(0, 100)
            }, null, 2)}
          </pre>
        </details>
      </div>
    )
  }

  return (
    <div className="max-w-full overflow-x-hidden">
      <h2 className="text-2xl font-black tracking-tight text-ink">Уведомления</h2>
      <p className="mt-2 text-sm text-slate-500">Получайте уведомления о своих билетах, форумах и новостях прямо в браузере.</p>

      {/* Main card */}
      <div className="mt-6 rounded-2xl bg-surface p-6 ring-1 ring-slate-200/70 max-w-full">
        <div className="flex items-center gap-4 max-w-full">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${subscribed ? 'bg-emerald-100' : 'bg-slate-100'}`}>
            {subscribed
              ? <Bell className="h-7 w-7 text-emerald-600" />
              : <BellOff className="h-7 w-7 text-slate-400" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-ink break-words">{subscribed ? 'Уведомления включены' : 'Уведомления отключены'}</p>
            <p className="text-sm text-slate-500 break-words">
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
                className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Отключить'}
              </button>
            )
            : (
              <button
                onClick={subscribe}
                disabled={loading || permission === 'denied'}
                className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Включить'}
              </button>
            )
          }
        </div>

        {permission === 'denied' && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600 break-words overflow-wrap-anywhere">
            Уведомления заблокированы в браузере. Нажмите на замок рядом с адресом сайта и разрешите уведомления.
          </p>
        )}

        {status === 'success' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 break-words overflow-wrap-anywhere">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="break-words">{msg}</span>
          </div>
        )}

        {status === 'error' && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600 break-words overflow-wrap-anywhere">{msg}</p>
        )}
      </div>

      {/* What you'll receive */}
      <div className="mt-6 rounded-2xl bg-surface p-6 ring-1 ring-slate-200/70 max-w-full overflow-x-hidden">
        <h3 className="font-bold text-ink">Какие уведомления вы получите</h3>
        <ul className="mt-4 space-y-3">
          {[
            { text: 'Билет оплачен — сразу после успешной оплаты' },
            { text: 'Напоминание о форуме — за день до начала' },
            { text: 'Новые форумы — когда открывается регистрация' },
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-600 max-w-full">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <span className="break-words flex-1">{item.text}</span>
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
