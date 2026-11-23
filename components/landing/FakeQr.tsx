/** Decorative QR-like pattern for mockups (NOT a real, scannable code). */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function FakeQr({ size = 25, seed = 11, className }: { size?: number; seed?: number; className?: string }) {
  const rand = rng(seed)
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8)
  const cells: React.ReactNode[] = []
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (!inFinder(x, y) && rand() > 0.52) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)

  const finder = (ox: number, oy: number) => (
    <g key={`${ox}-${oy}`}>
      <rect x={ox} y={oy} width="7" height="7" />
      <rect x={ox + 1} y={oy + 1} width="5" height="5" fill="#fff" />
      <rect x={ox + 2} y={oy + 2} width="3" height="3" />
    </g>
  )

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} fill="#0f172a" aria-hidden="true" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      {cells}
      {finder(0, 0)}
      {finder(size - 7, 0)}
      {finder(0, size - 7)}
    </svg>
  )
}
