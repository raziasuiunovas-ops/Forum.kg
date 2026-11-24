'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { Card, PageHeader, btn } from '../ui'

export function Storage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ status: string; message: string; bucket?: string } | null>(null)
  const [error, setError] = useState('')

  async function initStorage() {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await fetch('/api/v1/admin/storage/init', {
        method: 'POST',
        credentials: 'include',
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error?.message || 'Ошибка при инициализации')
        return
      }

      setResult(data)
    } catch (err) {
      setError('Не удалось подключиться к API')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Хранилище файлов"
        text="Управление S3-совместимым хранилищем для загрузки изображений форумов"
      />

      <Card>
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-ink mb-2">Статус хранилища</h3>
            <p className="text-sm text-slate-600 mb-4">
              Перед загрузкой изображений необходимо инициализировать бакет в Neon Object Storage.
              Нажмите кнопку ниже, чтобы создать бакет или проверить его статус.
            </p>

            <button
              type="button"
              className={btn.primary}
              onClick={initStorage}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Проверка...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Проверить и инициализировать
                </>
              )}
            </button>
          </div>

          {result && (
            <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">{result.message}</p>
                  {result.bucket && (
                    <p className="text-xs text-emerald-700 mt-1">Бакет: {result.bucket}</p>
                  )}
                  <p className="text-xs text-emerald-700 mt-1">
                    Статус: {result.status === 'ready' ? 'Готов к использованию' : 'Создан'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-4 border border-red-200">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-900">Ошибка</p>
                  <p className="text-xs text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="border-t pt-6">
            <h3 className="text-sm font-bold text-ink mb-2">Настройки окружения</h3>
            <p className="text-sm text-slate-600 mb-3">
              Убедитесь, что следующие переменные окружения настроены в Vercel:
            </p>
            <div className="rounded-lg bg-slate-50 p-4 font-mono text-xs space-y-1">
              <div>AWS_ENDPOINT_URL_S3</div>
              <div>AWS_ACCESS_KEY_ID</div>
              <div>AWS_SECRET_ACCESS_KEY</div>
              <div>AWS_REGION</div>
              <div>AWS_S3_PRIVATE_BUCKET</div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-sm font-bold text-ink mb-2">Альтернативный способ</h3>
            <p className="text-sm text-slate-600">
              Вы также можете создать бакет вручную через{' '}
              <a
                href="https://console.neon.tech/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Neon Console
              </a>
              . Создайте бакет с именем <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">forum-uploads</code>{' '}
              в разделе Storage → Object Storage.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
