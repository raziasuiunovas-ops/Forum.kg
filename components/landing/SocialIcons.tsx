import { Facebook, Instagram, Linkedin, MessageCircle, Send } from 'lucide-react'
import type { SocialLinkView } from '@/lib/site/settings'

const ICONS = {
  instagram: { Icon: Instagram, bg: 'bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600' },
  telegram: { Icon: Send, bg: 'bg-sky-500' },
  facebook: { Icon: Facebook, bg: 'bg-blue-600' },
  whatsapp: { Icon: MessageCircle, bg: 'bg-green-500' },
  linkedin: { Icon: Linkedin, bg: 'bg-blue-700' },
} as const

export function SocialIcons({
  links,
  variant,
}: {
  links: SocialLinkView[]
  variant: 'footer' | 'contacts'
}) {
  return (
    <ul className={`flex flex-wrap gap-3 ${variant === 'footer' ? 'mt-5' : ''}`}>
      {links.map(({ platform, url }) => {
        const { Icon, bg } = ICONS[platform]
        return (
          <li key={platform}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={platform}
              className={
                variant === 'contacts'
                  ? `flex h-10 w-10 items-center justify-center rounded-lg text-white ${bg}`
                  : 'flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:text-white'
              }
            >
              <Icon className="h-5 w-5" />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
