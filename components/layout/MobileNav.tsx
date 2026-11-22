'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { buttonVariants, cn } from '@/components/ui/button'

interface Item {
  href: string
  label: string
}

export function MobileNav({
  items,
  loginHref,
  accountHref,
  loginLabel,
  accountLabel,
  menuLabel,
}: {
  items: Item[]
  loginHref: string
  accountHref: string
  loginLabel: string
  accountLabel: string
  menuLabel: string
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
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full border-b border-border bg-white px-4 pb-5 pt-2 shadow-lg"
        >
          <nav className="flex flex-col">
            {items.map((i) => (
              <a key={i.href} href={i.href} onClick={close} className="py-3 text-base font-medium text-slate-800">
                {i.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link href={loginHref} onClick={close} className={cn(buttonVariants({ variant: 'outline' }))}>
              {loginLabel}
            </Link>
            <Link href={accountHref} onClick={close} className={cn(buttonVariants())}>
              {accountLabel}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
