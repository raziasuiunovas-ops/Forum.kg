import Link from 'next/link'

/** Branded 404 shown for unknown URLs. Trilingual because it has no access to the locale. */
export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden bg-footer px-6 text-center text-white">
      <div className="bg-grid absolute inset-0 -z-10" aria-hidden />
      <div className="absolute left-1/2 top-1/3 -z-10 h-96 w-96 -translate-x-1/2 animate-glow rounded-full bg-primary/30 blur-[120px]" aria-hidden />
      <p className="text-outline text-[clamp(6rem,24vw,14rem)] font-black leading-none tracking-tighter">404</p>
      <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
        Страница не найдена · Бет табылган жок · Page not found
      </h1>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {(
          [
            ['ru', 'На главную'],
            ['ky', 'Башкы бетке'],
            ['en', 'Back to home'],
          ] as const
        ).map(([l, label]) => (
          <Link
            key={l}
            href={`/${l}`}
            className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:brightness-110"
          >
            {label}
          </Link>
        ))}
      </div>
    </main>
  )
}
