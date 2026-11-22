import { ArrowUpRight } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import { Reveal } from '@/components/motion/Reveal'
import { Eyebrow } from './Eyebrow'

export async function Steps({ locale }: { locale: AppLocale }) {
  const t = await getT(locale, 'steps')

  return (
    <section id="how" className="bg-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <Reveal>
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h2 className="mt-5 text-5xl font-black leading-[0.95] tracking-tighter text-ink sm:text-6xl">
            {t.rich('title', { accent: (chunks) => <span className="block text-primary">{chunks}</span> })}
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-slate-500">{t('text')}</p>
          <a
            href="#events"
            className="group mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-sm font-bold text-white shadow-[0_14px_32px_-10px_hsl(var(--primary))] transition hover:-translate-y-0.5 hover:brightness-110"
          >
            {t('cta')}
            <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </Reveal>

        <ol className="border-b border-slate-200">
          {['1', '2', '3'].map((n, i) => (
            <li key={n}>
              <Reveal delay={i * 120}>
                <div className="group flex items-start gap-6 border-t border-slate-200 py-8 transition hover:bg-slate-50/70 sm:gap-10">
                  <span className="pt-1 text-xs font-extrabold text-primary">0{n}—</span>
                  <div className="flex-1">
                    <h3 className="text-xl font-black tracking-tight text-ink">{t(`items.${n}.title`)}</h3>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{t(`items.${n}.text`)}</p>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
