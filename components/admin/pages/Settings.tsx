'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { actions, useAdminState, useIsServerDataLoaded } from '@/lib/admin/store'
import type { Loc, SiteSettingsData } from '@/lib/admin/types'
import { useAdminUser } from '../AdminShell'
import { Card, DemoBanner, Field, PageHeader, Select, btn, field } from '../ui'
import { ImageUpload } from '../ImageUpload'
import { api } from '@/lib/client/api'

const HEX = /^#[0-9a-fA-F]{6}$/

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
/** WCAG contrast of white text on the given background. */
const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05)

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input type="color" aria-label={`${label} — выбор цвета`} value={HEX.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
        <input className={field} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!HEX.test(value)} maxLength={7} />
      </div>
    </Field>
  )
}

/** Spec 8.5: display name, logo, colours, hero images, slogan, organizer info, contacts, social links. */
export function Settings() {
  const stored = useAdminState().settings
  const isServerData = useIsServerDataLoaded()
  const { actor } = useAdminUser()
  const [s, setS] = useState<SiteSettingsData>(stored)
  const [loc, setLoc] = useState<Loc>('ru')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const set = <K extends keyof SiteSettingsData>(k: K, v: SiteSettingsData[K]) => { setS((x) => ({ ...x, [k]: v })); setSaved(false) }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const errs: string[] = []
    if (!s.displayName.trim()) errs.push('Укажите название сайта.')
    for (const [k, v] of [['Основной цвет', s.primaryColorHex], ['Акцентный цвет', s.accentColorHex], ['Цвет футера', s.footerColorHex]] as [string, string][]) {
      if (!HEX.test(v)) errs.push(`${k}: формат #RRGGBB.`)
    }
    if (HEX.test(s.primaryColorHex) && contrastWithWhite(s.primaryColorHex) < 3) errs.push('Основной цвет слишком светлый: белый текст на кнопках будет плохо читаться.')
    if (s.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.contactEmail)) errs.push('Некорректный email.')
    if (s.socialLinks.some((l) => l.url && !/^https?:\/\//.test(l.url))) errs.push('Ссылки соцсетей должны начинаться с http:// или https://')
    setErrors(errs)
    if (errs.length) return

    setSaving(true)
    try {
      // Save to real DB via API with CSRF token
      const res = await api('/api/v1/admin/settings', {
        method: 'PUT',
        csrf: true,
        body: {
          displayName: s.displayName,
          logoUrl: s.logoUrl || null,
          heroImageUrl: s.heroImageUrl || null,
          primaryColorHex: s.primaryColorHex,
          accentColorHex: s.accentColorHex,
          footerColorHex: s.footerColorHex,
          contactEmail: s.contactEmail,
          contactPhone: s.contactPhone,
          socialLinks: s.socialLinks,
          translations: (['ru', 'ky', 'en'] as Loc[]).map((l) => ({
            locale: l,
            heroTitle: s.heroSlogan[l] || null,
            heroSubtitle: null,
            aboutText: s.organizerInfo[l] || null,
          })),
        },
      })
      if (!res.ok) throw new Error('API error')

      // Also update local store for immediate preview
      actions.saveSettings(s, actor)
      setSaved(true)
    } catch {
      setErrors(['Не удалось сохранить настройки. Попробуйте ещё раз.'])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="Настройки сайта" text="Название, логотип, цвета, фото, слоган и контакты меняются без участия разработчика." />
      <DemoBanner forceShow={!isServerData} note="Пока сохраняется только в браузере. После появления /api/v1/admin/settings изменения сразу будут применяться на публичном сайте." />
      <form onSubmit={save} noValidate className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card title="Основное">
            <div className="space-y-4">
              <Field label="Название сайта"><input className={field} value={s.displayName} onChange={(e) => set('displayName', e.target.value)} /></Field>
              <ImageUpload
                label="Логотип сайта"
                hint="Загрузите изображение логотипа или введите URL"
                value={s.logoUrl}
                onChange={(url) => set('logoUrl', url)}
                aspectRatio="auto"
              />
            </div>
          </Card>
          <Card title="Цвета">
            <div className="grid gap-4 sm:grid-cols-3">
              <Color label="Основной" value={s.primaryColorHex} onChange={(v) => set('primaryColorHex', v)} />
              <Color label="Акцентный" value={s.accentColorHex} onChange={(v) => set('accentColorHex', v)} />
              <Color label="Футер / тёмный фон" value={s.footerColorHex} onChange={(v) => set('footerColorHex', v)} />
            </div>
          </Card>
          <Card title="Фото на главной">
            <ImageUpload
              label="Главное фото (героя)"
              hint="Баннеры форумов задаются в карточке форума"
              value={s.heroImageUrl}
              onChange={(url) => set('heroImageUrl', url)}
              aspectRatio="wide"
            />
          </Card>
          <Card title="Тексты">
            <div role="tablist" className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-xs font-bold">
              {(['ru', 'ky', 'en'] as Loc[]).map((l) => <button key={l} type="button" role="tab" aria-selected={loc === l} onClick={() => setLoc(l)} className={`rounded-md px-3 py-1.5 ${loc === l ? 'bg-white text-ink shadow' : 'text-slate-500'}`}>{l.toUpperCase()}</button>)}
            </div>
            <div className="space-y-4">
              <Field label="Короткий слоган"><input className={field} value={s.heroSlogan[loc]} onChange={(e) => set('heroSlogan', { ...s.heroSlogan, [loc]: e.target.value })} /></Field>
              <Field label="Об организаторе"><textarea className={`${field} h-24 py-2`} value={s.organizerInfo[loc]} onChange={(e) => set('organizerInfo', { ...s.organizerInfo, [loc]: e.target.value })} /></Field>
            </div>
          </Card>
          <Card title="Контакты и соцсети">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email"><input className={field} value={s.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></Field>
              <Field label="Телефон"><input className={field} value={s.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} /></Field>
            </div>
            <div className="mt-4 space-y-2">
              {s.socialLinks.map((l, i) => (
                <div key={i} className="grid grid-cols-[9rem_1fr_auto] gap-2 items-center">
                  <Select
                    aria-label="Соцсеть"
                    value={l.platform}
                    onChange={(value) => set('socialLinks', s.socialLinks.map((x, idx) => idx === i ? { ...x, platform: value } : x))}
                    options={['instagram', 'telegram', 'facebook', 'whatsapp', 'linkedin'].map((p) => ({ value: p, label: p }))}
                  />
                  <input aria-label="Ссылка" className={field} value={l.url} onChange={(e) => set('socialLinks', s.socialLinks.map((x, idx) => idx === i ? { ...x, url: e.target.value } : x))} placeholder="https://..." />
                  <button type="button" aria-label="Удалить" className={`${btn.danger} !h-10`} onClick={() => set('socialLinks', s.socialLinks.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" className={btn.soft} onClick={() => set('socialLinks', [...s.socialLinks, { platform: 'instagram', url: '' }])}><Plus className="h-4 w-4" /> Добавить ссылку</button>
            </div>
          </Card>

          {errors.length > 0 && <ul role="alert" className="list-disc space-y-1 rounded-xl bg-red-50 py-3 pl-8 pr-4 text-xs font-semibold text-red-600">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className={btn.primary}>
              {saving ? 'Сохранение...' : 'Сохранить настройки'}
            </button>
            {saved && <span role="status" className="text-xs font-bold text-emerald-600">Сохранено — лендинг обновится в течение минуты</span>}
          </div>
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Card title="Предпросмотр">
            <div className="overflow-hidden rounded-xl" style={{ background: HEX.test(s.footerColorHex) ? s.footerColorHex : '#070B24' }}>
              <div className="p-5">
                <p className="text-sm font-extrabold text-white">{s.displayName || '—'}</p>
                <p className="mt-6 text-2xl font-black uppercase leading-tight tracking-tighter text-white">{s.heroSlogan[loc] || '—'}</p>
                <span className="mt-5 inline-block rounded-full px-4 py-2 text-xs font-bold text-white" style={{ background: HEX.test(s.primaryColorHex) ? s.primaryColorHex : '#3B5BFF' }}>Кнопка</span>
                <span className="ml-2 inline-block rounded-full px-4 py-2 text-xs font-bold text-white" style={{ background: HEX.test(s.accentColorHex) ? s.accentColorHex : '#7C5CFF' }}>Акцент</span>
              </div>
              {s.heroImageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.heroImageUrl} alt="" className="h-40 w-full object-cover" />}
            </div>
          </Card>
        </aside>
      </form>
    </div>
  )
}
