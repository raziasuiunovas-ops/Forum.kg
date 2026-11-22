import { Check } from 'lucide-react'
import { LogoMark } from '@/components/layout/Logo'
import { FakeQr } from './FakeQr'

export function PhoneMockup({ forumName, dateLine, badge }: { forumName: string; dateLine: string; badge: string }) {
  return (
    <div className="relative mx-auto w-[220px] rotate-[6deg] rounded-[2.2rem] border-[7px] border-slate-900 bg-white p-4 shadow-2xl sm:w-[250px]">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-900/80" />
      <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
        <LogoMark className="h-4 w-4" /> FORUM.KG
      </div>
      <p className="mt-3 text-sm font-bold leading-tight text-slate-900">{forumName}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{dateLine}</p>
      <div className="mt-3 rounded-xl border border-slate-200 p-2">
        <FakeQr className="h-full w-full" seed={5} />
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-brand/15 px-3 py-1.5 text-xs font-bold text-brand">
        <Check className="h-3.5 w-3.5" /> {badge}
      </div>
    </div>
  )
}
