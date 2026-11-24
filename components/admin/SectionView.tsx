'use client'

import { Dashboard } from './pages/Dashboard'
import { Forums } from './pages/Forums'
import { Orders } from './pages/Orders'
import { Payments } from './pages/Payments'
import { Tickets } from './pages/Tickets'
import { Users } from './pages/Users'
import { Scanner } from './pages/Scanner'
import { Notifications } from './pages/Notifications'
import { Analytics } from './pages/Analytics'
import { Staff } from './pages/Staff'
import { Settings } from './pages/Settings'
import { Integrations } from './pages/Integrations'
import { Audit } from './pages/Audit'

export function SectionView({ id, locale }: { id: string; locale: string }) {
  switch (id) {
    case '': return <Dashboard locale={locale} />
    case 'forums': return <Forums />
    case 'orders': return <Orders />
    case 'payments': return <Payments />
    case 'tickets': return <Tickets />
    case 'users': return <Users />
    case 'scanner': return <Scanner />
    case 'notifications': return <Notifications />
    case 'analytics': return <Analytics />
    case 'staff': return <Staff />
    case 'settings': return <Settings />
    case 'integrations': return <Integrations />
    case 'audit': return <Audit />
    default: return null
  }
}
