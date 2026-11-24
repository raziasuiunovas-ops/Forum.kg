/**
 * Tiny translator for client components. The server passes a slice of messages/*.json
 * as a prop (no next-intl provider/plugin needed): const t = makeT(messages); t('a.b', { n: 3 })
 */
export type Messages = { [key: string]: string | Messages }

export function makeT(messages: Messages) {
  return (key: string, values?: Record<string, string | number>): string => {
    let node: string | Messages | undefined = messages
    for (const part of key.split('.')) {
      node = typeof node === 'object' ? node[part] : undefined
    }
    if (typeof node !== 'string') return key
    return values ? node.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? `{${k}}`)) : node
  }
}
