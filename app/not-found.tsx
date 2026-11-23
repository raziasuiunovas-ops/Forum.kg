import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <h1 className="text-9xl font-bold text-foreground">404</h1>
      <h2 className="mt-4 text-2xl font-semibold text-foreground">Страница не найдена</h2>
      <p className="mt-2 text-muted-foreground">
        Страница, которую вы ищете, не существует или была перемещена.
      </p>
      <Link
        href="/ru"
        className="mt-8 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        Вернуться на главную
      </Link>
    </div>
  )
}
