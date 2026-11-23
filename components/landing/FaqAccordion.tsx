'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <ul className="divide-y divide-slate-200 border-y border-slate-200">
      {items.map((item, i) => {
        const isOpen = open === i
        return (
          <li key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={`faq-${i}`}
              className="flex w-full items-center justify-between gap-6 py-6 text-left"
            >
              <span className={`text-base font-extrabold tracking-tight transition-colors sm:text-lg ${isOpen ? 'text-primary' : 'text-ink'}`}>
                {item.q}
              </span>
              <Plus className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-[135deg] text-primary' : ''}`} />
            </button>
            <div
              id={`faq-${i}`}
              role="region"
              className={`grid transition-all duration-300 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
            >
              <div className="overflow-hidden">
                <p className="max-w-lg pb-6 text-sm leading-relaxed text-slate-500">{item.a}</p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
