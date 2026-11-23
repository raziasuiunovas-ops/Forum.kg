import { Facebook, Instagram, Linkedin, MessageCircle, Send } from 'lucide-react'
import type { SocialLinkView } from '@/lib/site/settings'

const ICONS = {
  instagram: Instagram,
  telegram: Send,
  facebook: Facebook,
  whatsapp: MessageCircle,
  linkedin: Linkedin,
} as const

export function SocialIcons({ links }: { links: SocialLinkView[] }) {
  return (
    <ul className="mt-5 flex flex-wrap gap-2.5">
      {links.map(({ platform, url }) => {
        const Icon = ICONS[platform]
        return (
          <li key={platform}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={platform}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
            >
              <Icon className="h-4 w-4" />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
