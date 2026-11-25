'use client'

import { useRef, useState } from 'react'
import { Upload, X, Loader2, AlertCircle, ImagePlus } from 'lucide-react'
import { btn } from './ui'

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  label?: string
  hint?: string
  aspectRatio?: 'video' | 'square' | 'wide' | 'auto'
  maxSizeMB?: number
}

const ASPECT_CLASSES: Record<string, string> = {
  video: 'aspect-video',
  square: 'aspect-square',
  wide: 'aspect-[21/9]',
  auto: 'aspect-[4/3]',
}

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

  async function handleFile(file: File | null) {
    if (!file) return
    setError('')

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError('Разрешены только PNG, JPEG и WebP изображения')
      return
    }

    const maxBytes = maxSizeMB * 1024 * 1024
    if (file.size > maxBytes) {
      setError(`Размер файла не должен превышать ${maxSizeMB} МБ`)
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const csrfRes = await fetch('/api/v1/auth/csrf-token', { credentials: 'include' })
      const csrfData = await csrfRes.json()

      const statusRes = await fetch('/api/v1/auth/status', { credentials: 'include' })
      const statusData = await statusRes.json()
      if (!statusData?.authenticated && statusData?.canRefresh) {
        await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRF-Token': csrfData.csrfToken || '' },
        })
      }

      const response = await fetch('/api/v1/uploads', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfData.csrfToken || '' },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData?.error?.message || 'Ошибка при загрузке файла')
      }

      const data = await response.json()
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
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const files = e.dataTransfer.files
    if (files?.[0]) void handleFile(files[0])
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files?.[0]) void handleFile(files[0])
  }

  function handleRemove() {
    onChange('')
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const aspectClass = ASPECT_CLASSES[aspectRatio] ?? ASPECT_CLASSES.auto

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs font-bold text-ink">
          {label}
          {hint && <span className="ml-2 font-normal text-slate-400">({hint})</span>}
        </label>
      )}

      {/* Если фото уже загружено — показываем только превью */}
      {value ? (
        <div className={`relative w-full overflow-hidden rounded-xl ring-1 ring-slate-200 ${aspectClass}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Предпросмотр"
            className="h-full w-full object-cover"
          />
          {/* Оверлей с кнопками поверх фото */}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all hover:bg-black/40 hover:opacity-100">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-2 text-xs font-bold text-ink shadow transition hover:bg-white"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {uploading ? 'Загрузка...' : 'Заменить'}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/90 px-3 py-2 text-xs font-bold text-white shadow transition hover:bg-red-500"
            >
              <X className="h-3.5 w-3.5" /> Удалить
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleChange}
            className="hidden"
            disabled={uploading}
          />
        </div>
      ) : (
        /* Зона загрузки — соответствует соотношению сторон */
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            relative w-full overflow-hidden rounded-xl border-2 border-dashed transition-all ${aspectClass}
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs font-semibold text-slate-600">Загрузка...</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-slate-400" />
                <div>
                  <p className="text-sm font-bold text-slate-700">Нажмите для выбора или перетащите файл</p>
                  <p className="mt-1 text-xs text-slate-500">PNG, JPEG, WebP до {maxSizeMB} МБ</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Ввод URL вручную — только когда нет фото */}
      {!value && !uploading && (
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
