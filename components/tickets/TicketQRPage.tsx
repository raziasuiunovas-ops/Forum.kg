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
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    api<{ tickets: TicketInfo[] }>('/api/v1/profile/tickets').then((res) => {
      if (res.ok && res.data?.tickets) {
        const t = res.data.tickets.find((t) => t.id === ticketId)
        setTicket(t ?? null)
      }
      setLoading(false)
    })
  }, [ticketId])

  const downloadQR = async () => {
    if (!ticket) return
    setDownloading(true)
    try {
      const response = await fetch(`/api/v1/tickets/${ticketId}/qr?size=800`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ticket-${ticket.ticketNumber}.png`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch { /* ignore */ }
    finally { setDownloading(false) }
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

  if (!ticket) return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white">
      <p className="text-lg">Билет не найден</p>
      <button onClick={() => router.back()} className="mt-4 text-sm text-slate-400 underline">Назад</button>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Navbar */}
      <div className="flex items-center justify-between px-5 py-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
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

      {/* QR Code — большой и по центру */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="rounded-3xl bg-white p-6 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/v1/tickets/${ticketId}/qr?size=600`}
            alt={`QR билета ${ticket.ticketNumber}`}
            className="h-72 w-72 sm:h-80 sm:w-80"
          />
        </div>

        {/* Инфо о билете */}
        <div className="mt-8 w-full max-w-sm space-y-3 text-center">
          <h1 className="text-xl font-bold text-white">{ticket.forum.title}</h1>
          <p className="text-sm text-slate-400">{formatDate(ticket.forum.startsAt)}</p>
          {ticket.forum.venueName && (
            <p className="text-sm text-slate-400">{ticket.forum.venueName}</p>
          )}

          <div className="mt-4 rounded-2xl bg-white/10 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Участник</span>
              <span className="font-semibold">{ticket.participant.firstName} {ticket.participant.lastName}</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-slate-400">Категория</span>
              <span className="font-semibold">{ticket.category.name}</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-slate-400">Статус</span>
              <span className={`font-bold ${ticket.status === 'ACTIVE' ? 'text-emerald-400' : 'text-red-400'}`}>
                {ticket.status === 'ACTIVE' ? '✓ Действителен' : ticket.status}
              </span>
            </div>
          </div>

          <p className="text-xs font-mono text-slate-500">{ticket.ticketNumber}</p>
          <p className="text-xs text-slate-500">Покажите этот QR-код при входе на мероприятие</p>
        </div>
      </div>
    </div>
  )
}
