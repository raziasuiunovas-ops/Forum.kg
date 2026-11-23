import type { Metadata } from 'next'
import StaffScanner from '@/components/staff/StaffScanner'

export const metadata: Metadata = {
  title: 'QR-сканер сотрудников | FORUM.KG',
  description: 'Проверка билетов на мероприятиях FORUM.KG',
  robots: { index: false, follow: false },
}

export default function StaffScannerPage() {
  return <StaffScanner />
}
