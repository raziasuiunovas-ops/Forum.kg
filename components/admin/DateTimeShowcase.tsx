'use client'

import { useState } from 'react'
import { DateInput, DateTimeInput, Select, Card, Field } from './ui'

/**
 * Демонстрационный компонент для визуального сравнения всех input элементов
 * Показывает единый стиль для Select, DateInput и DateTimeInput
 */
export function DateTimeShowcase() {
  const [date, setDate] = useState('2024-12-01')
  const [datetime, setDatetime] = useState('2024-12-01T10:00')
  const [forum, setForum] = useState('forum1')

  return (
    <Card title="🎨 Демонстрация единого стиля input элементов">
      <div className="space-y-4">
        <Field label="Выпадающее меню (Select)">
          <Select
            value={forum}
            onChange={setForum}
            options={[
              { value: 'forum1', label: 'Fintech Forum Central Asia' },
              { value: 'forum2', label: 'Education & Innovation Summit' },
              { value: 'forum3', label: 'Bishkek Digital Forum 2026' }
            ]}
            aria-label="Выберите форум"
          />
        </Field>

        <Field label="Дата (DateInput)">
          <DateInput
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Выберите дату"
          />
        </Field>

        <Field label="Дата и время (DateTimeInput)">
          <DateTimeInput
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
            aria-label="Выберите дату и время"
          />
        </Field>

        <div className="mt-6 rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-bold text-ink mb-2">✅ Общие характеристики:</p>
          <ul className="text-xs text-slate-600 space-y-1 ml-4 list-disc">
            <li>Закругленные углы (rounded-xl)</li>
            <li>Синяя обводка 2px при фокусе (border-primary)</li>
            <li>Градиентный фон при наведении (from-primary/5 to-primary/10)</li>
            <li>Плавные анимации (transition-all duration-200)</li>
            <li>Тень и кольцо при фокусе (shadow-lg ring-4 ring-primary/20)</li>
            <li>Иконки для визуальной идентификации</li>
            <li>Единая высота (h-10)</li>
            <li>Полужирный шрифт (font-semibold)</li>
          </ul>
        </div>
      </div>
    </Card>
  )
}
