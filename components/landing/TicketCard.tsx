import { LogoMark } from '@/components/layout/Logo'
import { FakeQr } from './FakeQr'

/** Decorative "access pass" ticket used in the hero. */
export function TicketCard({ label, title }: { label: string; title: string }) {
  return (
    <div className="relative flex w-[260px] overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-20px_rgba(0,0,0,.6)] sm:w-[290px] lg:w-[340px]">
      <div className="flex-1 p-4 sm:p-5">
        <p className="flex items-center gap-1 text-[10px] font-extrabold text-ink sm:text-[11px]">
          <LogoMark className="h-3.5 w-3.5 text-primary" /> FORUM.KG
        </p>
        <p className="mt-5 text-[8px] font-bold tracking-[0.2em] text-slate-400 sm:mt-6 sm:text-[9px]">{label}</p>
        <p className="mt-1.5 text-sm font-extrabold leading-tight text-ink sm:text-base">{title}</p>
      </div>
      <div className="relative w-24 border-l border-dashed border-slate-300 p-3 sm:w-28 sm:p-3.5">
        <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-[#0b1030]" />
        <span className="absolute -bottom-2.5 -left-2.5 h-5 w-5 rounded-full bg-[#0b1030]" />
        <p className="text-[7px] font-bold tracking-widest text-slate-400 sm:text-[8px]">ADMIT ONE</p>
        <FakeQr className="mt-2 h-full w-full" seed={9} size={21} />
      </div>
    </div>
  )
}
