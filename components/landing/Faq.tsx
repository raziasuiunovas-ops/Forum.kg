import { ArrowUpRight, Mail } from 'lucide-react'
import { getT } from '@/lib/i18n/server'
import type { AppLocale } from '@/i18n/routing'
import { Reveal } from '@/components/motion/Reveal'
import { Eyebrow } from './Eyebrow'
import { FaqAccordion } from './FaqAccordion'

export async function Faq({ locale, email }: { locale: AppLocale; email: string }) {
  const t = await getT(locale, 'faq')
  const items = ['1', '2', '3', '4'].map((n) => ({ q: t(`items.${n}.q`), a: t(`items.${n}.a`) }))

  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <Reveal>
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h2 className="mt-5 text-5xl font-black leading-[0.95] tracking-tighter text-ink sm:text-6xl">
            {t('title')}
            <span className="text-primary">?</span>
          </h2>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-slate-500">{t('text')}</p>
          <a
            href={`mailto:${email}`}
            className="group mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-primary shadow-md ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <Mail className="h-4 w-4" />
            {email}
            <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </Reveal>
        <Reveal delay={120}>
          <FaqAccordion items={items} />
        </Reveal>
      </div>
    </section>
  )
}
