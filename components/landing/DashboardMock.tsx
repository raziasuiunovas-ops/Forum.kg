/** Decorative organizer dashboard preview (demo numbers). */
export function DashboardMock({
  labels,
}: {
  labels: { forum: string; active: string; sold: string; registered: string; revenue: string; dynamics: string }
}) {
  return (
    <div className="animate-float" aria-hidden="true">
      <div className="overflow-hidden rounded-[1.6rem] border-[6px] border-[#0b1030] bg-white shadow-[0_40px_80px_-30px_rgba(0,0,40,.8)]">
        <div className="grid grid-cols-[22%_1fr]">
          <div className="space-y-2 bg-[#0e1a52] p-3">
            <p className="text-[8px] font-extrabold text-white">FORUM.KG</p>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`h-2.5 rounded ${i === 1 ? 'bg-primary' : 'bg-white/20'}`} />
            ))}
          </div>
          <div className="bg-[#f5f7fd] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold text-ink">{labels.forum}</p>
              <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {labels.active}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                [labels.sold, '452'],
                [labels.registered, '528'],
                [labels.revenue, '1.24M'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-white p-2 shadow-sm">
                  <p className="text-[8px] text-slate-400">{k}</p>
                  <p className="text-sm font-black text-ink">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-white p-3 shadow-sm">
              <p className="text-[9px] font-bold text-ink">{labels.dynamics} ↗</p>
              <svg viewBox="0 0 240 90" className="mt-1 h-24 w-full">
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity=".35" />
                    <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,70 C20,50 30,44 48,56 C66,68 80,52 100,46 C120,40 134,58 154,52 C174,46 186,28 206,34 C220,38 230,18 240,10 L240,90 L0,90Z" fill="url(#area)" />
                <path
                  d="M0,70 C20,50 30,44 48,56 C66,68 80,52 100,46 C120,40 134,58 154,52 C174,46 186,28 206,34 C220,38 230,18 240,10"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={1}
                  className="animate-draw"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
