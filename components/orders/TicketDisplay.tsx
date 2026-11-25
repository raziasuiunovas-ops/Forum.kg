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

  const downloadQR = async () => {
    setDownloading(true)
    try {
      const response = await fetch(`/api/v1/tickets/${ticket.id}/qr?size=600`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ticket-${ticket.ticketNumber}.png`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
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
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <img 
            src={`/api/v1/tickets/${ticket.id}/qr?size=240`} 
            alt={`QR код билета ${ticket.ticketNumber}`}
            className="h-60 w-60"
          />
        </div>
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
