'use client'

import { useState } from 'react'
import { Bell, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export function TestNotificationsClient({ locale }: { locale: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

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
          message: 'Уведомление отправлено! Проверьте телефон/компьютер.',
        })
      } else {
        setResult({
          type: 'error',
          message: data.error || 'Не удалось отправить уведомление',
        })
      }
    } catch (error) {
      setResult({
        type: 'error',
        message: 'Ошибка сети. Проверьте подключение.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-8 space-y-6">
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

      {/* Test button */}
      <div className="rounded-2xl bg-surface p-6 text-center">
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
              Отправить тестовое уведомление
            </>
          )}
        </button>

        <p className="mt-3 text-xs text-slate-500">
          Уведомление придёт на все ваши устройства где включены уведомления
        </p>
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
