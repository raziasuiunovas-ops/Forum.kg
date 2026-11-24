'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { createForum, listForums, setForumStatus, updateForum } from '@/lib/admin/api'
import { dateTime, fromLocalInput, money, toLocalInput } from '@/lib/admin/format'
import type { AdminCategory, AdminForum, ForumStatus, L10n, Loc } from '@/lib/admin/types'
import { useAdminUser } from '../AdminShell'
import { Badge, Card, DataTable, Field, Modal, PageHeader, btn, field } from '../ui'
import { FORUM_LABEL, FORUM_TONE } from './labels'

const LOCS: { id: Loc; label: string }[] = [{ id: 'ru', label: 'Русский' }, { id: 'ky', label: 'Кыргызча' }, { id: 'en', label: 'English' }]
const empty = (): L10n => ({ ru: '', ky: '', en: '' })

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', ң: 'ng',
  о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const slugify = (s: string) =>
  (s.toLowerCase().replace(/[а-яёңөү]/g, (c) => TRANSLIT[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'forum') +
  `-${Math.random().toString(36).slice(2, 6)}`

function blank(): AdminForum {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`, slug: '', status: 'DRAFT',
    title: empty(), shortDescription: empty(), description: empty(), program: empty(),
    bannerUrl: '', startsAt: '', endsAt: null, venueName: '', venueAddress: '',
    capacity: 100, maxTicketsPerAccount: 1, qrExpiresAt: '', publishAt: null,
    categories: [{ code: 'STANDARD', priceMinor: 0, capacity: null }], sold: 0, checkedIn: 0,
  }
}

export function Forums() {
  useAdminUser()
  const [forums, setForums] = useState<AdminForum[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<AdminForum | null>(null)
  const [isNew, setIsNew] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const r = await listForums()
    if (r.ok) { setForums(r.data!); setError('') } else setError(r.error!)
    setLoading(false)
  }, [])
  useEffect(() => { void reload() }, [reload])

  async function changeStatus(f: AdminForum, status: ForumStatus) {
    const r = await setForumStatus(f.id, status)
    if (!r.ok) return alert(r.error)
    void reload()
  }

  return (
    <div>
      <PageHeader title="Форумы" text="Создание, редактирование и публикация форумов. Время событий — Asia/Bishkek.">
        <button type="button" className={btn.primary} onClick={() => { setEditing(blank()); setIsNew(true) }}><Plus className="h-4 w-4" /> Создать форум</button>
      </PageHeader>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
      <div className="mb-3 flex items-center gap-3 text-xs text-slate-500">
        <button type="button" className={btn.soft} onClick={() => void reload()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Обновить</button>
        {!loading && !error && forums.length === 0 && <span>Форумов пока нет — создайте первый.</span>}
      </div>
      <Card>
        <DataTable
          rows={forums}
          searchText={(f) => `${f.title.ru} ${f.title.en} ${f.venueName}`}
          columns={[
            { key: 't', header: 'Форум', sortValue: (f) => f.title.ru, cell: (f) => (<div><p className="font-bold text-ink">{f.title.ru}</p><p className="text-xs text-slate-400">{f.venueName}</p></div>) },
            { key: 's', header: 'Статус', cell: (f) => <Badge tone={FORUM_TONE[f.status]}>{FORUM_LABEL[f.status]}</Badge> },
            { key: 'd', header: 'Начало', sortValue: (f) => f.startsAt, cell: (f) => dateTime(f.startsAt) },
            { key: 'c', header: 'Продано', cell: (f) => `${f.sold} / ${f.capacity}` },
            { key: 'p', header: 'Цена от', cell: (f) => money(Math.min(...f.categories.map((c) => c.priceMinor))) },
            {
              key: 'a', header: '', cell: (f) => (
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className={btn.soft} onClick={() => { setEditing(f); setIsNew(false) }}>Изменить</button>
                  {(f.status === 'DRAFT' || f.status === 'SCHEDULED') && <button type="button" className={btn.ok} onClick={() => void changeStatus(f, 'PUBLISHED')}>Опубликовать</button>}
                  {f.status === 'PUBLISHED' && <button type="button" className={btn.danger} onClick={() => confirm(`Отменить форум «${f.title.ru}»?`) && void changeStatus(f, 'CANCELLED')}>Отменить</button>}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {editing && <ForumForm initial={editing} isNew={isNew} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload() }} />}
    </div>
  )
}

function ForumForm({ initial, isNew, onClose, onSaved }: { initial: AdminForum; isNew: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<AdminForum>(initial)
  const [loc, setLoc] = useState<Loc>('ru')
  const [publish, setPublish] = useState<'draft' | 'now' | 'scheduled'>(initial.status === 'PUBLISHED' ? 'now' : initial.status === 'SCHEDULED' ? 'scheduled' : 'draft')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof AdminForum>(k: K, v: AdminForum[K]) => setF((x) => ({ ...x, [k]: v }))
  const setL = (k: 'title' | 'shortDescription' | 'description' | 'program', v: string) => setF((x) => ({ ...x, [k]: { ...x[k], [loc]: v } }))
  const setCat = (i: number, patch: Partial<AdminCategory>) => setF((x) => ({ ...x, categories: x.categories.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const errs: string[] = []
    if (!f.title.ru.trim()) errs.push('Укажите название на русском (русский язык обязателен).')
    if (!f.bannerUrl.trim()) errs.push('Загрузите или укажите обложку (обязательно).')
    if (!f.startsAt) errs.push('Укажите дату и время начала.')
    if (f.endsAt && f.startsAt && f.endsAt <= f.startsAt) errs.push('Время окончания должно быть позже начала.')
    if (!f.venueName.trim() || !f.venueAddress.trim()) errs.push('Укажите место и адрес.')
    if (!Number.isInteger(f.capacity) || f.capacity < 1) errs.push('Вместимость — положительное целое число.')
    if (!Number.isInteger(f.maxTicketsPerAccount) || f.maxTicketsPerAccount < 1) errs.push('Лимит билетов на аккаунт — положительное целое число.')
    if (isNew && f.startsAt && new Date(f.startsAt) <= new Date()) errs.push('Дата начала должна быть в будущем.')
    if (!f.qrExpiresAt) errs.push('Укажите срок действия QR (обязательно).')
    else if (f.startsAt && f.qrExpiresAt < f.startsAt) errs.push('Срок действия QR должен быть не раньше начала форума.')
    if (f.categories.length < 1) errs.push('Нужна хотя бы одна категория билетов.')
    if (f.categories.some((c) => c.priceMinor < 0 || !/^[A-Z_]+$/.test(c.code))) errs.push('Проверьте категории: код латиницей (STANDARD, VIP, ...) и цена.')
    if (new Set(f.categories.map((c) => c.code)).size !== f.categories.length) errs.push('Коды категорий не должны повторяться.')
    const catSum = f.categories.reduce((a, c) => a + (c.capacity ?? 0), 0)
    if (f.categories.every((c) => c.capacity !== null) && catSum > f.capacity) errs.push('Сумма мест по категориям превышает общую вместимость.')
    if (publish === 'scheduled' && !f.publishAt) errs.push('Укажите время публикации.')
    if (errs.length) return setErrors(errs)

    const status: ForumStatus = publish === 'now' ? 'PUBLISHED' : publish === 'scheduled' ? 'SCHEDULED' : f.status === 'PUBLISHED' || f.status === 'SCHEDULED' ? 'DRAFT' : f.status
    const slug = f.slug || slugify(f.title.en || f.title.ru)
    const payload = { ...f, status, slug: slug.length >= 3 ? slug : `${slug}-forum`, publishAt: publish === 'scheduled' ? f.publishAt : null }
    setSaving(true)
    setErrors([])
    const r = isNew ? await createForum(payload) : await updateForum(payload)
    setSaving(false)
    if (!r.ok) return setErrors([r.error!])
    onSaved()
  }

  return (
    <Modal title={isNew ? 'Новый форум' : 'Изменить форум'} onClose={onClose} wide>
      <form onSubmit={save} noValidate className="space-y-5">
        <div role="tablist" className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-bold">
          {LOCS.map((l) => (
            <button key={l.id} type="button" role="tab" aria-selected={loc === l.id} onClick={() => setLoc(l.id)} className={`rounded-md px-3 py-1.5 transition ${loc === l.id ? 'bg-white text-ink shadow' : 'text-slate-500'}`}>{l.label}{l.id === 'ru' ? ' *' : ''}</button>
          ))}
        </div>
        <Field label={`Название (${loc.toUpperCase()})`} hint={loc !== 'ru' ? 'Если пусто — на сайте покажется русский вариант.' : undefined}>
          <input className={field} value={f.title[loc]} onChange={(e) => setL('title', e.target.value)} />
        </Field>
        <Field label={`Краткое описание (${loc.toUpperCase()})`}><textarea className={`${field} h-20 py-2`} value={f.shortDescription[loc]} onChange={(e) => setL('shortDescription', e.target.value)} /></Field>
        <Field label={`Полное описание (${loc.toUpperCase()})`}><textarea className={`${field} h-28 py-2`} value={f.description[loc]} onChange={(e) => setL('description', e.target.value)} /></Field>
        <Field label={`Программа (${loc.toUpperCase()}, необязательно)`}><textarea className={`${field} h-24 py-2`} value={f.program[loc]} onChange={(e) => setL('program', e.target.value)} /></Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Обложка (URL изображения) *" hint="Ссылка на картинку (https://...) или путь на сайте (/images/...).">
            <input className={field} value={f.bannerUrl} onChange={(e) => set('bannerUrl', e.target.value)} placeholder="/images/forum-tech.webp или https://..." />
          </Field>
          {f.bannerUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={f.bannerUrl} alt="" className="h-20 w-full rounded-lg object-cover ring-1 ring-slate-200 sm:mt-6" />}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Начало (время Бишкека) *"><input type="datetime-local" className={field} value={toLocalInput(f.startsAt)} onChange={(e) => set('startsAt', fromLocalInput(e.target.value))} /></Field>
          <Field label="Окончание (необязательно)"><input type="datetime-local" className={field} value={toLocalInput(f.endsAt)} onChange={(e) => set('endsAt', fromLocalInput(e.target.value) || null)} /></Field>
          <Field label="Место *"><input className={field} value={f.venueName} onChange={(e) => set('venueName', e.target.value)} /></Field>
          <Field label="Адрес *"><input className={field} value={f.venueAddress} onChange={(e) => set('venueAddress', e.target.value)} /></Field>
          <Field label="Общая вместимость *"><input type="number" min={1} className={field} value={f.capacity} onChange={(e) => set('capacity', Number(e.target.value))} /></Field>
          <Field label="Билетов на аккаунт (по умолчанию 1) *"><input type="number" min={1} className={field} value={f.maxTicketsPerAccount} onChange={(e) => set('maxTicketsPerAccount', Number(e.target.value))} /></Field>
          <Field label="Срок действия QR (время Бишкека) *" hint="После этого момента вход по QR невозможен, страница QR станет чёрной."><input type="datetime-local" className={field} value={toLocalInput(f.qrExpiresAt)} onChange={(e) => set('qrExpiresAt', fromLocalInput(e.target.value))} /></Field>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold text-ink">Категории билетов *</p>
          <div className="space-y-2">
            {f.categories.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                <Field label={i === 0 ? 'Название' : ''}><input className={field} value={c.code} onChange={(e) => setCat(i, { code: e.target.value.toUpperCase() })} placeholder="STANDARD / VIP" /></Field>
                <Field label={i === 0 ? 'Цена, сом' : ''}><input type="number" min={0} className={field} value={c.priceMinor / 100} onChange={(e) => setCat(i, { priceMinor: Math.round(Number(e.target.value) * 100) })} /></Field>
                <Field label={i === 0 ? 'Мест (пусто = без лимита)' : ''}><input type="number" min={1} className={field} value={c.capacity ?? ''} onChange={(e) => setCat(i, { capacity: e.target.value ? Number(e.target.value) : null })} /></Field>
                <button type="button" aria-label="Удалить категорию" disabled={f.categories.length === 1} onClick={() => set('categories', f.categories.filter((_, idx) => idx !== i))} className={`${btn.danger} !h-10`}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" className={`${btn.soft} mt-2`} onClick={() => set('categories', [...f.categories, { code: 'VIP', priceMinor: 0, capacity: null }])}><Plus className="h-4 w-4" /> Добавить категорию</button>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold text-ink">Публикация</p>
          <div className="flex flex-wrap gap-2">
            {([['draft', 'Черновик'], ['now', 'Сейчас'], ['scheduled', 'По расписанию']] as const).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={publish === v} onClick={() => setPublish(v)} className={`rounded-lg px-4 py-2 text-xs font-bold ${publish === v ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
            ))}
          </div>
          {publish === 'scheduled' && <div className="mt-3 max-w-xs"><Field label="Опубликовать в (время Бишкека)"><input type="datetime-local" className={field} value={toLocalInput(f.publishAt)} onChange={(e) => set('publishAt', fromLocalInput(e.target.value) || null)} /></Field></div>}
          <p className="mt-2 text-[11px] text-slate-400">При публикации всем зарегистрированным пользователям создаются уведомления.</p>
        </div>

        {errors.length > 0 && <ul role="alert" className="list-disc space-y-1 rounded-xl bg-red-50 py-3 pl-8 pr-4 text-xs font-semibold text-red-600">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={btn.soft} onClick={onClose}>Отмена</button>
          <button type="submit" disabled={saving} className={btn.primary}>{saving ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      </form>
    </Modal>
  )
}
