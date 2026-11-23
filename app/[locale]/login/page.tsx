import Link from 'next/link'
import type { AppLocale } from '@/i18n/routing'

export default async function LoginPage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {locale === 'ru' ? 'Вход в личный кабинет' : locale === 'ky' ? 'Жеке кабинетке кируу' : 'Login to your account'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {locale === 'ru' 
              ? 'Войдите с помощью номера телефона' 
              : locale === 'ky' 
              ? 'Телефон номери менен кириңиз' 
              : 'Sign in with your phone number'}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <div className="space-y-6">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-foreground">
                {locale === 'ru' ? 'Номер телефона' : locale === 'ky' ? 'Телефон номери' : 'Phone number'}
              </label>
              <input
                id="phone"
                type="tel"
                placeholder="+996 XXX XXX XXX"
                className="mt-1.5 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              />
            </div>

            <button
              type="button"
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {locale === 'ru' ? 'Получить код' : locale === 'ky' ? 'Код алуу' : 'Get code'}
            </button>

            <div className="text-center text-sm text-muted-foreground">
              {locale === 'ru' 
                ? 'На ваш номер будет отправлен код подтверждения' 
                : locale === 'ky' 
                ? 'Сиздин номериңизге тастыктоо коду жөнөтүлөт' 
                : 'A verification code will be sent to your number'}
            </div>
          </div>
        </div>

        <div className="text-center">
          <Link
            href={`/${locale}`}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {locale === 'ru' ? 'Вернуться на главную' : locale === 'ky' ? 'Башкы бетке кайтуу' : 'Back to home'}
          </Link>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">
            {locale === 'ru' ? '🚧 В разработке' : locale === 'ky' ? '🚧 Иштеп чыгуу учурунда' : '🚧 Under development'}
          </p>
          <p className="mt-1 text-blue-700">
            {locale === 'ru' 
              ? 'Функционал авторизации через SMS находится в разработке. API готово (/api/v1/auth/phone/request-otp), интеграция с frontend будет добавлена в следующих версиях.' 
              : locale === 'ky' 
              ? 'SMS аркылуу авторизация иштеп чыгуу учурунда. API даяр (/api/v1/auth/phone/request-otp), frontend менен интеграция келерки версияларда кошулат.' 
              : 'SMS authentication is under development. API is ready (/api/v1/auth/phone/request-otp), frontend integration will be added in upcoming versions.'}
          </p>
        </div>
      </div>
    </div>
  )
}
