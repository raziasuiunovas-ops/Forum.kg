import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** Class helper so <Link>/<a>/<button> share one button style. */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        outline: 'border border-border bg-white text-foreground hover:bg-muted',
        soft: 'bg-primary/10 text-primary hover:bg-primary/15',
        muted: 'bg-muted text-muted-foreground',
      },
      size: {
        default: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        sm: 'h-9 px-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
export { cn }
