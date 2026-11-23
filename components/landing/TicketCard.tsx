import { LogoMark } from '@/components/layout/Logo'
import { FakeQr } from './FakeQr'

/** Decorative "access pass" ticket used in the hero. */
export function TicketCard({ label, title }: { label: string; title: string }) {
  return (
    <div className="relative flex w-[250px] overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-20px_rgba(0,0,0,.6)] sm:w-[290px]">
      <div className="flex-1 p-4">
        <p className="flex items-center gap-1 text-[10px] font-extrabold text-ink">
          <LogoMark className="h-3 w-3 text-primary" /> FORUM.KG
        </p>
        <p className="mt-5 text-[8px] font-bold tracking-[0.2em] text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-extrabold leading-tight text-ink">{title}</p>
      </div>
      <div className="relative w-24 border-l border-dashed border-slate-300 p-3">
        <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-[#0b1030]" />
        <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-[#0b1030]" />
        <p className="text-[7px] font-bold tracking-widest text-slate-400">ADMIT ONE</p>
        <FakeQr className="mt-1.5 h-full w-full" seed={9} size={21} />
      </div>
    </div>
  )
}
