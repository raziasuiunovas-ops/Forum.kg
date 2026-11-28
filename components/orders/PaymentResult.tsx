'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Clock, Loader2, XCircle, Download, Ticket } from 'lucide-react'
import { api } from '@/lib/client/api'
import { makeT, type Messages } from '@/lib/i18n/client'

type View = 'loading' | 'waiting' | 'paid' | 'failed' | 'expired' | 'unknown' | 'noorder'

interface TicketData {
  id: string
  ticketNumber: string
  participant: { firstName: string; lastName: string }
  category: { name: string; code: string }
  forum: { title: string; startsAt: string; endsAt: string | null; venueName: string | null }
  priceMinor: number
}

const POLL_MS = 3000
const MAX_POLLS = 100

export function PaymentResult({
  locale,
  messages,
  orderId: orderIdProp,
}: {
  locale: string
  messages: Messages
  orderId?: string
}) {
  const t = makeT(messages)
  const search = useSearchParams()
  const [view, setView] = useState<View>('loading')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [tickets, setTickets] = useState<TicketData[]>([])
  const [downloading, setDownloading] = useState<string | null>(null)

  const openQRFullscreen = (ticketId: string) => {
    window.open(`/${locale}/tickets/${ticketId}/qr`, '_blank')
  }

  const fetchTickets = useCallback(async () => {
    try {
      const res = await api<{ tickets: TicketData[] }>('/api/v1/profile/tickets?limit=5')
      if (res.ok && res.data?.tickets) {
        setTickets(res.data.tickets.slice(0, 5))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    let id = orderIdProp ?? search.get('orderId')
    if (!id) {
      try { id = sessionStorage.getItem('lastOrderId') } catch { /* ignore */ }
    }
    if (!id) { setView('noorder'); return }
    setOrderId(id)

    let alive = true
    let polls = 0
    let timer: ReturnType<typeof setTimeout>

    async function tick() {
      const res = await api<{ orderStatus: string; paymentStatus: string | null }>(`/api/v1/orders/${id}/payment-status`)
      if (!alive) return
      if (res.ok && res.data) {
        const s = res.data.orderStatus
        if (s === 'PAID') {
          setView('paid')
          await fetchTickets()
          return
        }
        if (s === 'EXPIRED') return setView('expired')
        if (s === 'PAYMENT_FAILED' || s === 'CANCELLED') return setView('failed')
        setView('waiting')
      } else if (res.status === 401 || res.status === 403 || res.status === 404) {
        return setView('unknown')
      } else {
        setView('waiting')
      }
      if (++polls < MAX_POLLS) timer = setTimeout(tick, POLL_MS)
      else setView('unknown')
    }
    void tick()
    return () => { alive = false; clearTimeout(timer) }
  }, [orderIdProp, search, fetchTickets])

  const downloadQR = async (ticketId: string, ticketNumber: string) => {
    setDownloading(ticketId)
    const tk = tickets.find(t => t.id === ticketId)
    if (!tk) return

    try {
      const response = await fetch(`/api/v1/tickets/${ticketId}/qr?size=500`)
      const svgText = await response.text()
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`

      const W = 900
      const H = 1300

      const qrImg = new Image()
      qrImg.crossOrigin = 'anonymous'
      await new Promise<void>((resolve) => {
        qrImg.onload = () => resolve()
        qrImg.onerror = () => resolve()
        qrImg.src = svgDataUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')!

      // White background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)

      // Dark navy header
      const headerH = 280
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, W, headerH)

      // FORUM.KG label
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '500 24px Georgia, serif'
      ctx.textAlign = 'left'
      ctx.fillText('FORUM.KG', 60, 68)

      // Forum title
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 52px Georgia, serif'
      ctx.textAlign = 'left'
      let titleY = 148
      const words = tk.forum.title.split(' ')
      let line = ''
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width > W - 120 && line) {
          ctx.fillText(line, 60, titleY)
          line = word
          titleY += 62
        } else { line = test }
      }
      ctx.fillText(line, 60, titleY)

      // Date
      ctx.font = '26px Georgia, serif'
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(formatDate(tk.forum.startsAt), 60, titleY + 48)

      // QR code centered
      const qrSize = 480
      const qrX = (W - qrSize) / 2
      const qrY = headerH + 60
      ctx.shadowColor = 'rgba(0,0,0,0.12)'
      ctx.shadowBlur = 32
      ctx.fillStyle = '#f8fafc'
      ctx.beginPath()
      ctx.roundRect(qrX - 24, qrY - 24, qrSize + 48, qrSize + 48, 28)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

      // Scan hint
      ctx.fillStyle = '#94a3b8'
      ctx.font = '22px Georgia, serif'
      ctx.textAlign = 'center'
      ctx.fillText('Предъявите при входе', W / 2, qrY + qrSize + 56)

      // Horizontal rule
      const hrY = qrY + qrSize + 90
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(60, hrY)
      ctx.lineTo(W - 60, hrY)
      ctx.stroke()

      // Info fields
      const col1x = 60
      const col2x = W / 2 + 20
      let iy = hrY + 64

      const field = (label: string, value: string, x: number, y: number) => {
        ctx.textAlign = 'left'
        ctx.font = '20px Arial, sans-serif'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText(label, x, y)
        ctx.font = 'bold 26px Arial, sans-serif'
        ctx.fillStyle = '#0f172a'
        ctx.fillText(value, x, y + 34)
      }

      field('УЧАСТНИК', `${tk.participant.firstName} ${tk.participant.lastName}`, col1x, iy)
      field('КАТЕГОРИЯ', tk.category.name, col2x, iy)
      iy += 100

      if (tk.forum.venueName) {
        field('МЕСТО', tk.forum.venueName, col1x, iy)
        iy += 100
      }

      // Status
      ctx.textAlign = 'left'
      ctx.font = '20px Arial, sans-serif'
      ctx.fillStyle = '#94a3b8'
      ctx.fillText('СТАТУС', col1x, iy)
      ctx.font = 'bold 26px Arial, sans-serif'
      ctx.fillStyle = '#059669'
      ctx.fillText('Действителен', col1x, iy + 34)

      // Ticket number
      ctx.textAlign = 'center'
      ctx.font = '18px monospace'
      ctx.fillStyle = '#cbd5e1'
      ctx.fillText(tk.ticketNumber, W / 2, H - 40)

      // Download/Share
      canvas.toBlob(async (blob) => {
        if (!blob) return
        
        // Check if Web Share API is available and supports files
        if (navigator.share && navigator.canShare) {
          try {
            const file = new File([blob], `ticket-${ticketNumber}.png`, { type: 'image/png' })
            const shareData = {
              title: `Билет на ${tk.forum.title}`,
              text: `Мой билет на ${tk.forum.title}`,
              files: [file]
            }
            
            if (navigator.canShare(shareData)) {
              await navigator.share(shareData)
              return
            }
          } catch (err) {
            // If sharing fails, fall back to download
            console.log('Share failed, downloading instead', err)
          }
        }
        
        // Fall back to download
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ticket-${ticketNumber}.png`
        document.body.appendChild(a)
        a.click()
        URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }, 'image/png')
    } catch { /* ignore */ } finally {
      setDownloading(null)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' })

  const formatPrice = (minor: number) => `${(minor / 100).toLocaleString('ru-RU')} сом`

  /* ── Loading ── */
  if (view === 'loading') return (
    <div className="mx-auto max-w-md rounded-[2rem] bg-white p-10 text-center shadow-xl ring-1 ring-slate-200/70" role="status">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-sm text-slate-500">{t('checking')}</p>
    </div>
  )

  /* ── Waiting ── */
  if (view === 'waiting') return (
    <div className="mx-auto max-w-md rounded-[2rem] bg-white p-10 text-center shadow-xl ring-1 ring-slate-200/70" role="status" aria-live="polite">
      <Clock className="mx-auto h-14 w-14 text-amber-500" />
      <h1 className="mt-5 text-2xl font-black tracking-tight text-ink">{t('waitTitle')}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-500">{t('waitText')}</p>
      <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-slate-400" />
      {orderId && <p className="mt-4 text-[11px] text-slate-400">{t('order')}: {orderId.slice(0, 8)}</p>}
    </div>
  )

  /* ── Failed / Expired / Unknown / NoOrder ── */
  if (view !== 'paid') {
    const cfg = {
      failed: { Icon: XCircle, color: 'text-red-500', title: t('failedTitle'), text: t('failedText') },
      expired: { Icon: XCircle, color: 'text-red-500', title: t('expiredTitle'), text: t('expiredText') },
      unknown: { Icon: XCircle, color: 'text-slate-400', title: t('unknown'), text: '' },
      noorder: { Icon: XCircle, color: 'text-slate-400', title: t('noOrder'), text: '' },
    }[view]

    return (
      <div className="mx-auto max-w-md rounded-[2rem] bg-white p-10 text-center shadow-xl ring-1 ring-slate-200/70" role="status">
        <cfg.Icon className={`mx-auto h-14 w-14 ${cfg.color}`} />
        <h1 className="mt-5 text-2xl font-black tracking-tight text-ink">{cfg.title}</h1>
        {cfg.text && <p className="mt-3 text-sm leading-relaxed text-slate-500">{cfg.text}</p>}
        <Link href={`/${locale}/forums`} className="mt-7 inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-sm font-bold text-white transition hover:brightness-110">
          {t('again')}
        </Link>
      </div>
    )
  }

  /* ── PAID — главный экран ── */
  return (
    <div className="mx-auto max-w-lg" role="status" aria-live="polite">
      {/* Заголовок успеха */}
      <div className="mb-6 rounded-[2rem] bg-white p-8 text-center shadow-xl ring-1 ring-slate-200/70">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-ink">{t('paidTitle')}</h1>
        <p className="mt-2 text-sm text-slate-500">{t('paidText')}</p>
      </div>

      {/* Билеты с QR */}
      {tickets.length > 0 ? (
        <div className="space-y-4">
          {tickets.map((tk) => (
            <div key={tk.id} className="overflow-hidden rounded-[2rem] bg-white shadow-xl ring-1 ring-slate-200/70">
              {/* Шапка билета */}
              <div className="bg-primary px-6 py-4">
                <div className="flex items-center gap-2">
                  <Ticket className="h-5 w-5 text-white/80" />
                  <span className="text-sm font-bold text-white">{tk.forum.title}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-white/60">{tk.ticketNumber}</p>
              </div>

              <div className="p-6">
                <div className="flex gap-5">
                  {/* QR код */}
                  <div className="shrink-0">
                    <button 
                      onClick={() => openQRFullscreen(tk.id)}
                      className="rounded-xl bg-white p-2 ring-1 ring-slate-200 transition hover:ring-primary hover:shadow-lg cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/v1/tickets/${tk.id}/qr?size=200`}
                        alt={`QR билета ${tk.ticketNumber}`}
                        className="h-32 w-32"
                      />
                    </button>
                  </div>

                  {/* Инфо */}
                  <div className="flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div>
                        <p className="text-xs text-slate-400">Участник</p>
                        <p className="font-semibold text-slate-900">{tk.participant.firstName} {tk.participant.lastName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Категория</p>
                        <p className="text-sm font-semibold text-slate-700">{tk.category.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Дата</p>
                        <p className="text-sm text-slate-700">{formatDate(tk.forum.startsAt)}</p>
                      </div>
                      {tk.forum.venueName && (
                        <div>
                          <p className="text-xs text-slate-400">Место</p>
                          <p className="text-sm text-slate-700">{tk.forum.venueName}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-slate-400">Сумма</p>
                        <p className="text-sm font-bold text-emerald-600">{formatPrice(tk.priceMinor)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Кнопка скачать */}
                <button
                  onClick={() => downloadQR(tk.id, tk.ticketNumber)}
                  disabled={downloading === tk.id}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {downloading === tk.id
                    ? <Loader2 size={16} className="animate-spin" />
                    : <Download size={16} />}
                  {downloading === tk.id ? 'Скачивание...' : 'Скачать QR-код'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Если билеты ещё не загрузились */
        <div className="rounded-[2rem] bg-white p-8 text-center shadow-xl ring-1 ring-slate-200/70">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="mt-3 text-sm text-slate-500">Загружаем ваши билеты...</p>
        </div>
      )}

      {/* Кнопка в личный кабинет */}
      <div className="mt-5 text-center">
        <Link
          href={`/${locale}/account`}
          className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-8 text-sm font-bold text-white transition hover:brightness-110"
        >
          {t('tickets')}
        </Link>
      </div>
    </div>
  )
}
