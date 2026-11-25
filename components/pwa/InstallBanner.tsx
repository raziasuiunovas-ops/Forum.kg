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
    if (permanent) localStorage.setItem('pwa-dismissed', String(Date.now()))
    setTimeout(() => { setVisible(false); setExiting(false) }, 350)
  }, [])

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

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') dismiss(true)
    setDeferredPrompt(null)
  }

  if (!visible || !platform) return null

  return (
    <div
      role="dialog"
      aria-label="Установить приложение"
      className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out ${
        exiting ? 'translate-y-full' : 'translate-y-0'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* iOS arrow pointing down to Safari share button */}
      {platform === 'ios' && (
        <div className="flex justify-center pb-1">
          <div className="rounded-t-xl bg-slate-800 px-4 py-2 text-center text-xs text-white/80 shadow-lg">
            Нажмите <strong className="text-white">⎙</strong> и выберите <strong className="text-white">«На экран "Домой"»</strong>
          </div>
        </div>
      )}

      <div className="bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.12)]">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          {/* Icon */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden
            className="h-12 w-12 shrink-0 rounded-xl shadow"
          />

          {/* Text */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight text-slate-900">
              Установить FORUM.KG
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {platform === 'ios'
                ? 'Добавьте на экран Домой для быстрого доступа'
                : 'Всегда под рукой — билеты и форумы'}
            </p>
          </div>

          {/* Action button */}
          {platform !== 'ios' && (
            <button
              onClick={install}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white active:scale-95"
            >
              {platform === 'desktop'
                ? <><Download className="h-4 w-4" /> Установить</>
                : <><Download className="h-4 w-4" /> Установить</>
              }
            </button>
          )}

          {platform === 'ios' && (
            <div className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-center">
              <Share className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-0.5 text-[10px] font-semibold text-slate-600">Поделиться</p>
            </div>
          )}

          {/* Close */}
          <button
            onClick={() => dismiss(true)}
            aria-label="Закрыть"
            className="-mr-1 shrink-0 rounded-lg p-2 text-slate-400 active:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
