import { revalidatePath, revalidateTag } from 'next/cache'

/** Show admin changes on the public pages right away instead of after the 60 s cache. */
export function revalidatePublicForums() {
  try {
    revalidateTag('forums')
    revalidatePath('/[locale]', 'layout')
  } catch {
    /* outside a request scope (tests/scripts): nothing to revalidate */
  }
}
