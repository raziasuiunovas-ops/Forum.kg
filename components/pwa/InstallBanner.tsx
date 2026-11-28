'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Download, Share } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Platform = 'android' | 'ios' | 'desktop' | null

export function InstallBanner() {
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [platform, setPlatform] = useState<Platform>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  const dismiss = useCallback((permanent = false) => {
    setExiting(true)
    if (permanent) {
      localStorage.setItem('pwa-dismissed', String(Date.now()))
    }
    setTimeout(() => { 
      setVisible(false)
      setExiting(false) 
    }, 350)
  }, [])

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dismiss(true)
  }, [dismiss])

  useEffect(() => {
    // Already installed as PWA — never show
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone
    ) return

    // User dismissed recently (7 days)
    const ts = Number(localStorage.getItem('pwa-dismissed') || 0)
    if (ts && Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return

    const ua = navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua)
    const android = /android/i.test(ua)

    if (ios) setPlatform('ios')
    else if (android) setPlatform('android')
    else setPlatform('desktop')

    // Increment visit count
    const visits = Number(localStorage.getItem('pwa-visits') || 0) + 1
    localStorage.setItem('pwa-visits', String(visits))

    if (ios) {
      // iOS has no install prompt — show hint after 2 visits
      if (visits >= 2) setTimeout(() => setVisible(true), 1800)
      return
    }

    // Android / Desktop — wait for browser prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      if (visits >= 2) setTimeout(() => setVisible(true), 1200)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Also show on custom event (e.g. after payment)
    const show = () => setVisible(true)
    window.addEventListener('pwa-show-banner', show)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('pwa-show-banner', show)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        dismiss(true)
      }
      setDeferredPrompt(null)
    } catch (err) {
      console.error('Install prompt failed:', err)
    }
  }, [deferredPrompt, dismiss])

  const handleInstallClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    install()
  }, [install])

  if (!visible || !platform) return null

  return (
    <div
      role="dialog"
      aria-label="Установить приложение"
      className={`fixed inset-x-0 bottom-0 z-50 p-4 transition-transform duration-300 ease-out ${
        exiting ? 'translate-y-full' : 'translate-y-0'
      }`}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
    >
      {/* iOS arrow pointing down to Safari share button */}
      {platform === 'ios' && (
        <div className="mb-2 flex justify-center">
          <div className="rounded-xl bg-slate-800 px-4 py-2 text-center text-xs text-white/90 shadow-lg">
            Нажмите <Share className="mx-1 inline h-3.5 w-3.5" /> и выберите <strong className="text-white">«На экран "Домой"»</strong>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-lg overflow-hidden rounded-2xl bg-white shadow-[0_8px_32px_rgba(0,0,0,0.16)] ring-1 ring-slate-200/50">
        <div className="flex items-center gap-3 p-4">
          {/* Icon */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden
            className="h-14 w-14 shrink-0 rounded-2xl shadow-sm ring-1 ring-slate-200/70"
          />

          {/* Text */}
          <div className="min-w-0 flex-1">
            <p className="text-base font-black leading-tight tracking-tight text-ink">
              Установить FORUM.KG
            </p>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {platform === 'ios'
                ? 'Добавьте на экран Домой для быстрого доступа'
                : 'Всегда под рукой — билеты и форумы'}
            </p>
          </div>

          {/* Action button */}
          {platform !== 'ios' && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 active:scale-95 touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Download className="h-4 w-4" />
              Установить
            </button>
          )}

          {platform === 'ios' && (
            <div className="shrink-0 rounded-xl bg-blue-50 px-3 py-2.5 text-center">
              <Share className="mx-auto h-5 w-5 text-blue-600" />
              <p className="mt-1 text-[10px] font-bold text-blue-600">Поделиться</p>
            </div>
          )}

          {/* Close */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Закрыть"
            className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 active:scale-95 touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
