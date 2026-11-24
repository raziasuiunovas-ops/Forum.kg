/**
 * Global 404 (used for URLs outside /ru, /ky, /en).
 * Rendered outside [locale], so it needs its own <html>/<body>.
 */
import './globals.css'

export default function NotFound() {
  return (
    <html lang="ru">
      <body className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <h1 className="text-6xl font-bold">404</h1>
        <p className="mt-2 text-xl text-muted-foreground">Страница не найдена</p>
        <a
          href="/"
          className="mt-8 rounded-lg bg-primary px-6 py-3 text-primary-foreground hover:opacity-90"
        >
          Вернуться на главную
        </a>
      </body>
    </html>
  )
}
