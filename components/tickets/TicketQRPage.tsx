'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { api } from '@/lib/client/api'

interface TicketInfo {
  id: string
  ticketNumber: string
  status: string
  participant: { firstName: string; lastName: string }
  category: { name: string }
  forum: { title: string; startsAt: string; venueName: string | null }
  priceMinor: number
}

export function TicketQRPage({ locale, ticketId }: { locale: string; ticketId: string }) {
  const router = useRouter()
  const [ticket, setTicket] = useState<TicketInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'notfound' | 'auth' | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    api<{ tickets: TicketInfo[] }>('/api/v1/profile/tickets?limit=100').then((res) => {
      if (res.status === 401 || res.status === 403) {
        router.replace(`/${locale}/login?next=${encodeURIComponent(`/${locale}/tickets/${ticketId}/qr`)}`)
        return
      }
      if (res.ok && res.data?.tickets) {
        const t = res.data.tickets.find((t) => t.id === ticketId)
        setTicket(t ?? null)
        if (!t) setError('notfound')
      } else {
        setError('notfound')
      }
      setLoading(false)
    })
  }, [ticketId, locale, router])

  const downloadQR = async () => {
    if (!ticket) return
    setDownloading(true)
    try {
      // Fetch QR SVG
      const response = await fetch(`/api/v1/tickets/${ticketId}/qr?size=400`)
      const svgText = await response.text()
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`

      const W = 600
      const H = 880

      // Load QR image
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

      // Dark gradient background
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#0f172a')
      grad.addColorStop(1, '#1e3a8a')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.roundRect(0, 0, W, H, 28)
      ctx.fill()

      // Top accent bar
      ctx.fillStyle = '#3b82f6'
      ctx.fillRect(0, 0, W, 8)

      // FORUM.KG label
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = 'bold 13px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('FORUM.KG', W / 2, 36)

      // White QR card — centered
      const cardSize = 340
      const cardX = (W - cardSize) / 2
      const cardY = 55
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(cardX, cardY, cardSize, cardSize, 16)
      ctx.fill()

      // Draw QR inside white card
      const pad = 16
      ctx.drawImage(qrImg, cardX + pad, cardY + pad, cardSize - pad * 2, cardSize - pad * 2)

      // Dashed divider
      let dashY = cardY + cardSize + 36
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 5])
      ctx.beginPath()
      ctx.moveTo(40, dashY)
      ctx.lineTo(W - 40, dashY)
      ctx.stroke()
      ctx.setLineDash([])

      // Forum title (word wrap)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 22px Arial, sans-serif'
      ctx.textAlign = 'center'
      let titleY = dashY + 40
      const words = ticket.forum.title.split(' ')
      let line = ''
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width > W - 80 && line) {
          ctx.fillText(line, W / 2, titleY)
          line = word
          titleY += 30
        } else {
          line = test
        }
      }
      ctx.fillText(line, W / 2, titleY)
      titleY += 10

      // Date
      ctx.font = '15px Arial, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.65)'
      const dateStr = new Date(ticket.forum.startsAt).toLocaleDateString(locale, {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek',
      })
      ctx.fillText(dateStr, W / 2, titleY + 28)

      if (ticket.forum.venueName) {
        ctx.fillText(ticket.forum.venueName, W / 2, titleY + 50)
        titleY += 22
      }

      // Info rows
      const infoY = titleY + 72
      const drawRow = (label: string, value: string, x: number, y: number) => {
        ctx.textAlign = 'left'
        ctx.font = '12px Arial, sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText(label, x, y)
        ctx.font = 'bold 15px Arial, sans-serif'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(value, x, y + 20)
      }

      drawRow('Участник', `${ticket.participant.firstName} ${ticket.participant.lastName}`, 48, infoY)
      drawRow('Категория', ticket.category.name, W / 2 + 20, infoY)
      drawRow('Статус', ticket.status === 'ACTIVE' ? '✓ Действителен' : ticket.status, 48, infoY + 55)

      // Ticket number at bottom
      ctx.textAlign = 'center'
      ctx.font = '10px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fillText(ticket.ticketNumber, W / 2, H - 20)

      // Download PNG
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `forum-ticket-${ticket!.ticketNumber}.png`
        document.body.appendChild(a)
        a.click()
        URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }, 'image/png')
    } catch (e) {
      console.error('Download failed', e)
    } finally {
      setDownloading(false)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Bishkek',
    })

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <Loader2 className="h-8 w-8 animate-spin text-white" />
    </div>
  )

  if (error === 'notfound' || !ticket) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-white">
      <div className="rounded-full bg-red-500/20 p-5">
        <svg className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 className="text-xl font-bold">Билет не найден</h1>
      <p className="text-sm text-slate-400">Этот билет не относится к вашему аккаунту</p>
      <button
        onClick={() => router.push(`/${locale}/account`)}
        className="mt-2 rounded-full bg-white/10 px-6 py-2.5 text-sm font-semibold transition hover:bg-white/20"
      >
        Мои билеты
      </button>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-4 pt-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4" /> Назад
        </button>
        <button
          onClick={downloadQR}
          disabled={downloading}
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/20 disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Скачать
        </button>
      </div>

      {/* QR Code */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-6">
        <div className="rounded-3xl bg-white p-5 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/v1/tickets/${ticketId}/qr?size=600`}
            alt={`QR билета ${ticket.ticketNumber}`}
            className="h-64 w-64 sm:h-72 sm:w-72"
          />
        </div>

        {/* Info */}
        <div className="mt-6 w-full max-w-sm space-y-2 text-center">
          <h1 className="text-xl font-bold">{ticket.forum.title}</h1>
          <p className="text-sm text-slate-400">{formatDate(ticket.forum.startsAt)}</p>
          {ticket.forum.venueName && (
            <p className="text-sm text-slate-400">{ticket.forum.venueName}</p>
          )}

          <div className="mt-4 rounded-2xl bg-white/10 p-4 text-left">
            <div className="flex justify-between py-1 text-sm">
              <span className="text-slate-400">Участник</span>
              <span className="font-semibold">{ticket.participant.firstName} {ticket.participant.lastName}</span>
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-slate-400">Категория</span>
              <span className="font-semibold">{ticket.category.name}</span>
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-slate-400">Статус</span>
              <span className={`font-bold ${ticket.status === 'ACTIVE' ? 'text-emerald-400' : 'text-red-400'}`}>
                {ticket.status === 'ACTIVE' ? '✓ Действителен' : ticket.status}
              </span>
            </div>
          </div>

          <p className="text-xs font-mono text-slate-500 break-all">{ticket.ticketNumber}</p>
          <p className="text-xs text-slate-500">Покажите этот QR-код при входе на мероприятие</p>
        </div>
      </div>
    </div>
  )
}
