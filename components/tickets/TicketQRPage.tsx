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
      const response = await fetch(`/api/v1/tickets/${ticketId}/qr?size=500`)
      const svgText = await response.text()
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`

      const W = 800
      const H = 1100

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

      // ── White background with rounded corners ──
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(0, 0, W, H, 40)
      ctx.fill()

      // ── Top color band ──
      ctx.fillStyle = '#1e3a8a'
      ctx.beginPath()
      ctx.roundRect(0, 0, W, 220, [40, 40, 0, 0])
      ctx.fill()

      // FORUM.KG
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '600 20px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('FORUM.KG', W / 2, 52)

      // Forum title on blue
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 36px Arial, sans-serif'
      ctx.textAlign = 'center'
      let titleY = 110
      const words = ticket.forum.title.split(' ')
      let line = ''
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width > W - 80 && line) {
          ctx.fillText(line, W / 2, titleY)
          line = word
          titleY += 44
        } else { line = test }
      }
      ctx.fillText(line, W / 2, titleY)

      // ── QR code — white square centered ──
      const qrSize = 460
      const qrX = (W - qrSize) / 2
      const qrY = 240
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 24)
      ctx.fill()
      // drop shadow
      ctx.shadowColor = 'rgba(0,0,0,0.08)'
      ctx.shadowBlur = 20
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(qrX - 20, qrY - 20, qrSize + 40, qrSize + 40, 24)
      ctx.fill()
      ctx.shadowBlur = 0

      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

      // ── Scan hint ──
      ctx.fillStyle = '#94a3b8'
      ctx.font = '17px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Покажите QR-код при входе', W / 2, qrY + qrSize + 50)

      // ── Divider ──
      const divY = qrY + qrSize + 80
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 2
      ctx.setLineDash([8, 6])
      ctx.beginPath()
      ctx.moveTo(50, divY)
      ctx.lineTo(W - 50, divY)
      ctx.stroke()
      ctx.setLineDash([])

      // ── Info rows ──
      const col1 = 60
      const col2 = W / 2 + 20
      let iy = divY + 55

      const drawField = (label: string, value: string, x: number, y: number) => {
        ctx.textAlign = 'left'
        ctx.font = '16px Arial, sans-serif'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText(label.toUpperCase(), x, y)
        ctx.font = 'bold 22px Arial, sans-serif'
        ctx.fillStyle = '#0f172a'
        ctx.fillText(value, x, y + 30)
      }

      drawField('Участник', `${ticket.participant.firstName} ${ticket.participant.lastName}`, col1, iy)
      drawField('Категория', ticket.category.name, col2, iy)
      iy += 90

      const dateStr = new Date(ticket.forum.startsAt).toLocaleDateString(locale, {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek',
      })
      drawField('Дата', dateStr, col1, iy)
      if (ticket.forum.venueName) {
        drawField('Место', ticket.forum.venueName, col2, iy)
      }
      iy += 90

      // Status badge
      ctx.textAlign = 'left'
      ctx.font = '16px Arial, sans-serif'
      ctx.fillStyle = '#94a3b8'
      ctx.fillText('СТАТУС', col1, iy)
      ctx.fillStyle = ticket.status === 'ACTIVE' ? '#059669' : '#dc2626'
      ctx.font = 'bold 22px Arial, sans-serif'
      ctx.fillText(ticket.status === 'ACTIVE' ? '✓  Действителен' : '✗  Недействителен', col1, iy + 30)

      // ── Ticket number at bottom ──
      ctx.textAlign = 'center'
      ctx.font = '13px monospace'
      ctx.fillStyle = '#cbd5e1'
      ctx.fillText(ticket.ticketNumber, W / 2, H - 32)

      // Download
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ticket-${ticket!.ticketNumber}.png`
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
