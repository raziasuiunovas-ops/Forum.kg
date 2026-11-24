import { notFound } from 'next/navigation'
import { NAV } from '@/lib/admin/nav'
import { SectionView } from '@/components/admin/SectionView'

export default async function AdminSectionPage({ params }: { params: Promise<{ locale: string; section?: string[] }> }) {
  const { locale, section } = await params
  const id = section?.[0] ?? ''
  if ((section?.length ?? 0) > 1 || !NAV.some((n) => n.id === id)) notFound()
  return <SectionView id={id} locale={locale} />
}
