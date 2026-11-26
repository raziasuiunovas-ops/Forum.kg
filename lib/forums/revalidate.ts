import { revalidatePath, revalidateTag } from 'next/cache'

/** Show admin changes on the public pages right away instead of after the 60 s cache. */
export function revalidatePublicForums() {
  try {
    revalidateTag('forums')
    // Revalidate all locales of the homepage and forums page
    revalidatePath('/ru', 'page')
    revalidatePath('/ky', 'page')
    revalidatePath('/en', 'page')
    revalidatePath('/ru/forums', 'page')
    revalidatePath('/ky/forums', 'page')
    revalidatePath('/en/forums', 'page')
  } catch {
    /* outside a request scope (tests/scripts): nothing to revalidate */
  }
}
