'use client'

import { Download } from 'lucide-react'
import { useState } from 'react'

interface Ticket {
  id: string
  ticketNumber: string
  participantFirstName: string
  participantLastName: string
  category: string
  status: string
}

interface Forum {
  title: string
  startsAt: string
  endsAt: string | null
  location: string | null
}

export function TicketDisplay({ 
  ticket, 
  forum,
  locale 
}: { 
  ticket: Ticket
  forum: Forum
  locale: string 
}) {
  const [downloading, setDownloading] = useState(false)

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Bishkek',
    })

  const downloadQR = async () => {
    setDownloading(true)
    try {
      const response = await fetch(`/api/v1/tickets/${ticket.id}/qr?size=500`)
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
      const words = forum.title.split(' ')
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
      ctx.fillText(formatDate(forum.startsAt), 60, titleY + 48)

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

      field('УЧАСТНИК', `${ticket.participantFirstName} ${ticket.participantLastName}`, col1x, iy)
      field('КАТЕГОРИЯ', ticket.category, col2x, iy)
      iy += 100

      if (forum.location) {
        field('МЕСТО', forum.location, col1x, iy)
        iy += 100
      }

      // Status
      ctx.textAlign = 'left'
      ctx.font = '20px Arial, sans-serif'
      ctx.fillStyle = '#94a3b8'
      ctx.fillText('СТАТУС', col1x, iy)
      ctx.font = 'bold 26px Arial, sans-serif'
      ctx.fillStyle = ticket.status === 'ACTIVE' ? '#059669' : '#dc2626'
      ctx.fillText(ticket.status === 'ACTIVE' ? 'Действителен' : 'Недействителен', col1x, iy + 34)

      // Ticket number
      ctx.textAlign = 'center'
      ctx.font = '18px monospace'
      ctx.fillStyle = '#cbd5e1'
      ctx.fillText(ticket.ticketNumber, W / 2, H - 40)

      // Download/Share
      canvas.toBlob(async (blob) => {
        if (!blob) return
        
        // Check if Web Share API is available and supports files
        if (navigator.share && navigator.canShare) {
          try {
            const file = new File([blob], `ticket-${ticket.ticketNumber}.png`, { type: 'image/png' })
            const shareData = {
              title: `Билет на ${forum.title}`,
              text: `Мой билет на ${forum.title}`,
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
        a.download = `ticket-${ticket.ticketNumber}.png`
        document.body.appendChild(a)
        a.click()
        URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }, 'image/png')
    } catch (error) {
      console.error('Failed to download QR code:', error)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
      {/* Header */}
      <div className="mb-4 border-b border-slate-200 pb-4">
        <h3 className="text-lg font-bold text-slate-900">
          {ticket.participantFirstName} {ticket.participantLastName}
        </h3>
        <p className="text-sm text-slate-500">{forum.title}</p>
        <p className="mt-1 text-xs font-mono text-slate-400">{ticket.ticketNumber}</p>
      </div>

      {/* QR Code */}
      <div className="mb-4 flex justify-center">
        <button 
          onClick={() => window.open(`/${locale}/tickets/${ticket.id}/qr`, '_blank')}
          className="rounded-xl bg-white p-3 ring-1 ring-slate-200 transition hover:ring-primary hover:shadow-lg cursor-pointer"
        >
          <img 
            src={`/api/v1/tickets/${ticket.id}/qr?size=240`} 
            alt={`QR код билета ${ticket.ticketNumber}`}
            className="h-60 w-60"
          />
        </button>
      </div>

      {/* Info */}
      <div className="mb-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Категория:</span>
          <span className="font-semibold text-slate-900">{ticket.category}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Статус:</span>
          <span className="font-semibold text-emerald-600">Активен</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Дата:</span>
          <span className="font-semibold text-slate-900">
            {new Date(forum.startsAt).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
      </div>

      {/* Download Button */}
      <button
        onClick={downloadQR}
        disabled={downloading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        <Download size={18} />
        {downloading ? 'Скачивание...' : 'Скачать QR-код'}
      </button>

      {/* Hint */}
      <p className="mt-3 text-center text-xs text-slate-500">
        Покажите этот QR-код при входе на мероприятие
      </p>
    </div>
  )
}
