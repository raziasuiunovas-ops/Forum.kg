'use client'

import { useRef, useState } from 'react'
import { Upload, X, Loader2, AlertCircle } from 'lucide-react'
import { api } from '@/lib/client/api'
import { btn } from './ui'

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  label?: string
  hint?: string
  aspectRatio?: 'video' | 'square' | 'wide' | 'auto'
  maxSizeMB?: number
}

/**
 * Компонент для загрузки изображений с устройства (вместо ввода URL).
 * Поддерживает drag & drop, предпросмотр и загрузку в высоком качестве (до 5 МБ).
 * Загруженные файлы сохраняются через API /api/v1/uploads и возвращают защищенный URL.
 */
export function ImageUpload({
  value,
  onChange,
  label,
  hint,
  aspectRatio = 'auto',
  maxSizeMB = 5,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const aspectClasses = {
    video: 'aspect-video',
    square: 'aspect-square',
    wide: 'aspect-[21/9]',
    auto: 'aspect-auto',
  }

  async function handleFile(file: File | null) {
    if (!file) return

    setError('')

    // Проверка типа файла
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError('Разрешены только PNG, JPEG и WebP изображения')
      return
    }

    // Проверка размера
    const maxBytes = maxSizeMB * 1024 * 1024
    if (file.size > maxBytes) {
      setError(`Размер файла не должен превышать ${maxSizeMB} МБ`)
      return
    }

    setUploading(true)

    try {
      // Создаем FormData для загрузки
      const formData = new FormData()
      formData.append('file', file)

      // Загружаем файл через API
      const response = await api('/api/v1/uploads', {
        method: 'POST',
        body: formData,
        csrf: true,
        // Не устанавливаем Content-Type - браузер сам установит multipart/form-data с boundary
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData?.error?.message || 'Ошибка при загрузке файла')
      }

      const data = await response.json()
      
      // Обновляем значение с полученным URL
      if (data.url) {
        onChange(data.url)
      } else {
        throw new Error('Не получен URL загруженного файла')
      }
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файл')
    } finally {
      setUploading(false)
    }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      void handleFile(files[0])
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files[0]) {
      void handleFile(files[0])
    }
  }

  function handleRemove() {
    onChange('')
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-bold text-ink">
          {label}
          {hint && <span className="ml-2 font-normal text-slate-400">({hint})</span>}
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          {/* Upload area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              relative overflow-hidden rounded-lg border-2 border-dashed transition-all
              ${dragActive ? 'border-primary bg-primary/5' : 'border-slate-200 bg-slate-50'}
              ${uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer hover:border-primary hover:bg-primary/5'}
            `}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleChange}
              className="hidden"
              disabled={uploading}
            />

            <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 p-6 text-center">
              {uploading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs font-semibold text-slate-600">Загрузка...</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-slate-400" />
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      Нажмите для выбора или перетащите файл
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      PNG, JPEG, WebP до {maxSizeMB} МБ
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Preview */}
        {value && (
          <div className="relative sm:w-32">
            <div
              className={`overflow-hidden rounded-lg ring-1 ring-slate-200 ${aspectClasses[aspectRatio]}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt="Предпросмотр"
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-lg transition hover:bg-red-600"
              aria-label="Удалить изображение"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Alternative: manual URL input */}
      {!value && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-slate-500 hover:text-slate-700">
            Или введите URL вручную
          </summary>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://... или /images/..."
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </details>
      )}
    </div>
  )
}
