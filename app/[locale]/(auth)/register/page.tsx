import { redirect } from 'next/navigation'

// Registration and login are one phone+code flow.
export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect(`/${locale}/login`)
}
