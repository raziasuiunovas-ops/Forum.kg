export function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p
      className={`flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.22em] ${
        light ? 'text-white/70' : 'text-primary'
      }`}
    >
      <span className={`h-px w-6 ${light ? 'bg-white/60' : 'bg-primary'}`} />
      {children}
    </p>
  )
}
