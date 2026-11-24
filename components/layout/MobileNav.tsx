'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'

interface Item {
  href: string
  label: string
}

export function MobileNav({
  items,
  menuLabel,
  children,
}: {
  items: Item[]
  menuLabel: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={menuLabel}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full mt-2 animate-fade-up rounded-3xl border border-white/10 bg-[#0b1030]/95 p-5 shadow-2xl backdrop-blur-xl"
        >
          <nav className="flex flex-col">
            {items.map((i) => (
              <a key={i.href} href={i.href} onClick={close} className="py-3 text-base font-semibold text-white/90">
                {i.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between gap-3">{children}</div>
        </div>
      )}
    </div>
  )
}
