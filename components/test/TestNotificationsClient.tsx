'use client'

import { useState, useEffect } from 'react'
import { Bell, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react'

export function TestNotificationsClient({ locale }: { locale: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [diagnostics, setDiagnostics] = useState<any>(null)

  useEffect(() => {
    // Check browser support and permissions
    const checkSupport = async () => {
      const diag: any = {
        hasNotifications: 'Notification' in window,
        hasServiceWorker: 'serviceWorker' in navigator,
        hasPushManager: 'serviceWorker' in navigator && 'pushManager' in ServiceWorkerRegistration.prototype,
        permission: 'Notification' in window ? Notification.permission : 'unsupported',
        isHTTPS: window.location.protocol === 'https:' || window.location.hostname === 'localhost',
        swRegistered: false,
        pushSubscription: null,
      }

      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration()
          diag.swRegistered = !!reg
          if (reg) {
            const sub = await reg.pushManager.getSubscription()
            diag.pushSubscription = !!sub
            if (sub) {
              diag.endpoint = sub.endpoint.substring(0, 50) + '...'
            }
          }
        } catch (e) {
          diag.swError = String(e)
        }
      }

      setDiagnostics(diag)
    }

    checkSupport()
  }, [])

  const testNotification = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/v1/push/test', {
        credentials: 'include',
      })

      const data = await response.json()

      if (response.ok) {
        setResult({
          type: 'success',
          message: 'Уведомление отправлено! Проверьте телефон/компьютер через 2-3 секунды.',
        })
      } else {
        setResult({
          type: 'error',
          message: data.error || data.details || 'Не удалось отправить уведомление',
        })
      }
    } catch (error) {
      setResult({
        type: 'error',
        message: 'Ошибка сети: ' + (error instanceof Error ? error.message : 'Unknown'),
      })
    } finally {
      setLoading(false)
    }
  }

  const testBrowserNotification = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🧪 Тест браузера', {
        body: 'Это тест через browser API (не через сервер)',
        icon: '/icons/icon-192.png',
      })
      setResult({
        type: 'success',
        message: 'Локальное уведомление отправлено. Если видите его - браузер работает нормально.'
      })
    } else {
      setResult({
        type: 'error',
        message: 'Разрешение не предоставлено или браузер не поддерживает уведомления'
      })
    }
  }

  const testServiceWorkerNotification = async () => {
    setLoading(true)
    setResult(null)
    
    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker не поддерживается')
      }

      const registration = await navigator.serviceWorker.ready
      
      await registration.showNotification('🔧 Тест Service Worker', {
        body: 'Это тест через Service Worker (не через сервер)',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'sw-test',
        requireInteraction: false,
      })

      setResult({
        type: 'success',
        message: 'Service Worker уведомление отправлено. Если видите его - SW работает нормально.'
      })
    } catch (error) {
      setResult({
        type: 'error',
        message: 'Ошибка SW: ' + (error instanceof Error ? error.message : 'Unknown')
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Diagnostics */}
      {diagnostics && (
        <div className="rounded-2xl bg-slate-50 p-6">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <Info className="h-5 w-5" />
            Диагностика системы
          </h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Поддержка уведомлений:</span>
              <span className={diagnostics.hasNotifications ? 'text-green-600 font-semibold' : 'text-red-600'}>
                {diagnostics.hasNotifications ? '✅ Да' : '❌ Нет'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Service Worker:</span>
              <span className={diagnostics.hasServiceWorker ? 'text-green-600 font-semibold' : 'text-red-600'}>
                {diagnostics.hasServiceWorker ? '✅ Да' : '❌ Нет'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Push Manager:</span>
              <span className={diagnostics.hasPushManager ? 'text-green-600 font-semibold' : 'text-red-600'}>
                {diagnostics.hasPushManager ? '✅ Да' : '❌ Нет'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Разрешение:</span>
              <span className={diagnostics.permission === 'granted' ? 'text-green-600 font-semibold' : 'text-amber-600'}>
                {diagnostics.permission === 'granted' ? '✅ Разрешено' : 
                 diagnostics.permission === 'denied' ? '❌ Запрещено' : 
                 '⏳ Не запрошено'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>HTTPS:</span>
              <span className={diagnostics.isHTTPS ? 'text-green-600 font-semibold' : 'text-red-600'}>
                {diagnostics.isHTTPS ? '✅ Да' : '❌ Нет'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>SW зарегистрирован:</span>
              <span className={diagnostics.swRegistered ? 'text-green-600 font-semibold' : 'text-amber-600'}>
                {diagnostics.swRegistered ? '✅ Да' : '❌ Нет'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Push подписка:</span>
              <span className={diagnostics.pushSubscription ? 'text-green-600 font-semibold' : 'text-amber-600'}>
                {diagnostics.pushSubscription ? '✅ Есть' : '❌ Нет'}
              </span>
            </div>
            {diagnostics.endpoint && (
              <div className="mt-2 text-xs text-slate-500">
                <strong>Endpoint:</strong> {diagnostics.endpoint}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="rounded-2xl bg-blue-50 p-6">
        <h2 className="font-bold text-blue-900">📋 Как протестировать:</h2>
        <ol className="mt-3 space-y-2 text-sm text-blue-800">
          <li className="flex gap-2">
            <span className="font-bold">1.</span>
            <span>Перейдите в <a href={`/${locale}/account`} className="font-semibold underline">Аккаунт → Уведомления</a></span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold">2.</span>
            <span>Нажмите <strong>"Включить"</strong> и разрешите уведомления в браузере</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold">3.</span>
            <span>Вернитесь сюда и нажмите кнопку ниже</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold">4.</span>
            <span>Уведомление должно прийти на ваше устройство!</span>
          </li>
        </ol>
      </div>

      {/* Test buttons */}
      <div className="rounded-2xl bg-surface p-6 text-center space-y-4">
        <button
          onClick={testNotification}
          disabled={loading}
          className="inline-flex h-14 items-center gap-3 rounded-full bg-primary px-8 text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Отправляем...
            </>
          ) : (
            <>
              <Bell className="h-5 w-5" />
              Отправить через сервер (Push API)
            </>
          )}
        </button>

        <button
          onClick={testBrowserNotification}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-blue-500 px-6 text-sm font-bold text-white transition hover:bg-blue-600"
        >
          <Bell className="h-4 w-4" />
          Тест: Browser API
        </button>

        <button
          onClick={testServiceWorkerNotification}
          disabled={loading}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-purple-500 px-6 text-sm font-bold text-white transition hover:bg-purple-600 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          Тест: Service Worker
        </button>

        <div className="text-xs text-slate-500 space-y-1">
          <p><strong>Push API:</strong> настоящий тест через сервер + web-push</p>
          <p><strong>Browser API:</strong> локальный тест браузера</p>
          <p><strong>Service Worker:</strong> тест через SW (без сервера)</p>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`rounded-2xl p-6 ${
            result.type === 'success'
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          <div className="flex items-start gap-3">
            {result.type === 'success' ? (
              <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-6 w-6 shrink-0 text-red-600" />
            )}
            <div>
              <p className="font-bold">
                {result.type === 'success' ? '✅ Успех!' : '❌ Ошибка'}
              </p>
              <p className="mt-1 text-sm">{result.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Additional info */}
      <div className="rounded-2xl bg-slate-50 p-6">
        <h3 className="font-bold text-slate-900">ℹ️ Важная информация:</h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li>• <strong>Android:</strong> Уведомления работают в Chrome, Firefox, Edge</li>
          <li>• <strong>iPhone:</strong> Только Safari 16.4+ (iOS 16.4+)</li>
          <li>• <strong>Desktop:</strong> Работает во всех браузерах</li>
          <li>• Если уведомление не пришло — проверьте что разрешили их в браузере</li>
          <li>• Уведомления приходят даже когда браузер закрыт!</li>
          <li>• <strong>Локальный тест:</strong> Вторая кнопка тестирует браузер напрямую</li>
        </ul>
      </div>

      {/* Types of notifications */}
      <div className="rounded-2xl bg-surface p-6">
        <h3 className="font-bold text-ink">📱 Типы автоматических уведомлений:</h3>
        <div className="mt-4 space-y-3">
          <div className="flex gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="font-semibold text-ink">Приветствие</p>
              <p className="text-xs text-slate-600">Сразу после включения уведомлений</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-2xl">🎫</span>
            <div>
              <p className="font-semibold text-ink">Покупка билета</p>
              <p className="text-xs text-slate-600">Сразу после успешной оплаты</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-2xl">⏰</span>
            <div>
              <p className="font-semibold text-ink">Напоминание о форуме</p>
              <p className="text-xs text-slate-600">За день до начала (каждый день в 9:00)</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-2xl">🆕</span>
            <div>
              <p className="font-semibold text-ink">Новый форум</p>
              <p className="text-xs text-slate-600">При публикации нового форума</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
