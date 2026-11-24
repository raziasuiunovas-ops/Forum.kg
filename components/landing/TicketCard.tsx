import { LogoMark } from '@/components/layout/Logo'
import { FakeQr } from './FakeQr'

/** Decorative "access pass" ticket used in the hero. */
export function TicketCard({ label, title }: { label: string; title: string }) {
  return (
    <div className="relative flex w-[220px] overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-20px_rgba(0,0,0,.6)] sm:w-[250px] lg:w-[290px]">
      <div className="flex-1 p-3.5 sm:p-4">
        <p className="flex items-center gap-1 text-[9px] font-extrabold text-ink sm:text-[10px]">
          <LogoMark className="h-3 w-3 text-primary" /> FORUM.KG
        </p>
        <p className="mt-4 text-[7px] font-bold tracking-[0.2em] text-slate-400 sm:mt-5 sm:text-[8px]">{label}</p>
        <p className="mt-1 text-xs font-extrabold leading-tight text-ink sm:text-sm">{title}</p>
      </div>
      <div className="relative w-20 border-l border-dashed border-slate-300 p-2.5 sm:w-24 sm:p-3">
        <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-[#0b1030]" />
        <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-[#0b1030]" />
        <p className="text-[6px] font-bold tracking-widest text-slate-400 sm:text-[7px]">ADMIT ONE</p>
        <FakeQr className="mt-1.5 h-full w-full" seed={9} size={21} />
      </div>
    </div>
  )
}
