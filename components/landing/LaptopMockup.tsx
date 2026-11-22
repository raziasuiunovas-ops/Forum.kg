import { BarChart3, CalendarDays, Settings, ShoppingBag, UserCheck, Users } from 'lucide-react'

interface Labels {
  forum: string
  active: string
  sold: string
  registered: string
  revenue: string
  dynamics: string
  menu: string[]
}

/** Decorative dashboard preview; numbers are demo values. */
export function LaptopMockup({ labels }: { labels: Labels }) {
  const icons = [CalendarDays, ShoppingBag, Users, UserCheck, BarChart3, Settings]
  return (
    <div className="mx-auto w-full max-w-[520px]" aria-hidden="true">
      <div className="rounded-t-2xl border-[6px] border-slate-800 bg-slate-100">
        <div className="grid grid-cols-[34%_1fr]">
          <div className="bg-slate-900 p-3 text-[10px] text-white/80">
            <p className="mb-3 font-extrabold text-white">FORUM.KG</p>
            {labels.menu.map((m, i) => {
              const Icon = icons[i]
              return (
                <div key={m} className={`mb-1 flex items-center gap-1.5 rounded px-1.5 py-1 ${i === 0 ? 'bg-primary text-white' : ''}`}>
                  <Icon className="h-3 w-3" /> <span className="truncate">{m}</span>
                </div>
              )
            })}
          </div>
          <div className="p-3">
            <p className="flex items-center gap-2 text-[11px] font-bold text-slate-900">
              {labels.forum}
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">{labels.active}</span>
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-[9px]">
              {[
                [labels.sold, '452'],
                [labels.registered, '528'],
                [labels.revenue, '1 240 000'],
              ].map(([k, v]) => (
                <div key={k} className="rounded bg-white p-1.5 shadow-sm">
                  <p className="text-slate-500">{k}</p>
                  <p className="text-xs font-bold text-slate-900">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded bg-white p-2 shadow-sm">
              <p className="text-[9px] font-semibold text-slate-700">{labels.dynamics}</p>
              <svg viewBox="0 0 200 70" className="mt-1 h-16 w-full">
                <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2" points="0,60 25,52 50,55 75,40 100,44 125,28 150,30 175,14 200,8" />
                <polygon fill="hsl(var(--primary))" opacity=".12" points="0,70 0,60 25,52 50,55 75,40 100,44 125,28 150,30 175,14 200,8 200,70" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="h-3 rounded-b-xl bg-gradient-to-b from-slate-300 to-slate-400" />
    </div>
  )
}
