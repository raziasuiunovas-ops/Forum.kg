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
        // Not logged in — redirect to login
        router.replace(`/${locale}/login?next=${encodeURIComponent(`/${locale}/tickets/${ticketId}/qr`)}`)
        return
      }
      if (res.ok && res.data?.tickets) {
        const t = res.data.tickets.find((t) => t.id === ticketId)
        if (t) {
          setTicket(t)
        } else {
          setError('notfound')
        }
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
      // Fetch the QR SVG
      const response = await fetch(`/api/v1/tickets/${ticketId}/qr?size=400`)
      const svgText = await response.text()

      // Create canvas with ticket card design
      const canvas = document.createElement('canvas')
      const W = 600
      const H = 820
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')!

      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#1e3a8a')
      grad.addColorStop(1, '#1e40af')
      ctx.fillStyle = grad
      ctx.roundRect(0, 0, W, H, 32)
      ctx.fill()

      // White card for QR
      ctx.fillStyle = '#ffffff'
      ctx.roundRect(W / 2 - 190, 60, 380, 380, 20)
      ctx.fill()

      // Draw QR SVG onto canvas
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' })
      const svgUrl = URL.createObjectURL(svgBlob)
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = svgUrl
      })
      ctx.drawImage(img, W / 2 - 180, 70, 360, 360)
      URL.revokeObjectURL(svgUrl)

      // Forum title
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 26px system-ui, sans-serif'
      ctx.textAlign = 'center'
      const title = ticket.forum.title
      // Word wrap for long titles
      const words = title.split(' ')
      let line = ''
      let y = 495
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width > 520 && line) {
          ctx.fillText(line, W / 2, y)
          line = word
          y += 34
        } else {
          line = test
        }
      }
      ctx.fillText(line, W / 2, y)
      y += 34

      // Date
      ctx.font = '18px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      const dateStr = new Date(ticket.forum.startsAt).toLocaleDateString(locale, {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek'
      })
      ctx.fillText(dateStr, W / 2, y + 5)

      // Divider
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(40, y + 32)
      ctx.lineTo(W - 40, y + 32)
      ctx.stroke()
      ctx.setLineDash([])

      // Participant & category
      ctx.textAlign = 'left'
      ctx.font = '15px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText('Участник', 50, y + 65)
      ctx.fillText('Категория', W / 2 + 20, y + 65)

      ctx.font = 'bold 17px system-ui, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.fillText(`${ticket.participant.firstName} ${ticket.participant.lastName}`, 50, y + 88)
      ctx.fillText(ticket.category.name, W / 2 + 20, y + 88)

      // Ticket number
      ctx.font = '12px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.textAlign = 'center'
      ctx.fillText(ticket.ticketNumber, W / 2, y + 120)

      // FORUM.KG branding
      ctx.font = 'bold 15px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillText('FORUM.KG', W / 2, H - 24)

      // Download
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `ticket-${ticket.ticketNumber}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
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
      {/* Top bar — fixed height, always visible */}
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

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-6">
        {/* QR Code */}
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
