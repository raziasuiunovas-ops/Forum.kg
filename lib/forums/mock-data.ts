import type { MockForum } from './types'

// Demo data until GET /api/v1/forums is wired. Prices are in tyiyn.
export const MOCK_FORUMS: MockForum[] = [
  {
    id: 'mock-1',
    slug: 'bishkek-digital-forum-2026',
    bannerUrl: '/images/forum-tech.svg',
    startsAt: '2027-01-24T10:00:00+06:00',
    timeZone: 'Asia/Bishkek',
    venueName: 'Бишкек, Sheraton',
    tag: { ru: 'Технологии', ky: 'Технологиялар', en: 'Technology' },
    tagColor: 'blue',
    title: { ru: 'Bishkek Digital Forum 2026' },
    shortDescription: {
      ru: 'Крупнейший форум о технологиях, цифровой трансформации и инновациях в Кыргызстане.',
      ky: 'Кыргызстандагы технологиялар, санариптик трансформация жана инновациялар боюнча эң чоң форум.',
      en: 'The largest forum on technology, digital transformation and innovation in Kyrgyzstan.',
    },
    availableTickets: 48,
    categories: [
      { code: 'STANDARD', priceMinor: 250000, name: { ru: 'Standard' } },
      { code: 'VIP', priceMinor: 600000, name: { ru: 'VIP' } },
    ],
  },
  {
    id: 'mock-2',
    slug: 'fintech-forum-central-asia',
    bannerUrl: '/images/forum-finance.svg',
    startsAt: '2027-02-05T09:30:00+06:00',
    timeZone: 'Asia/Bishkek',
    venueName: 'Бишкек, Novotel',
    tag: { ru: 'Финансы', ky: 'Финансы', en: 'Finance' },
    tagColor: 'green',
    title: { ru: 'Fintech Forum Central Asia' },
    shortDescription: {
      ru: 'Региональный форум о платежах, цифровых финансах и развитии финтех-экосистемы в Центральной Азии.',
      ky: 'Борбордук Азиядагы төлөмдөр, санариптик финансы жана финтех-экосистеманын өнүгүүсү боюнча аймактык форум.',
      en: 'A regional forum on payments, digital finance and the growth of the fintech ecosystem in Central Asia.',
    },
    availableTickets: 112,
    categories: [
      { code: 'STANDARD', priceMinor: 300000, name: { ru: 'Standard' } },
      { code: 'VIP', priceMinor: 700000, name: { ru: 'VIP' } },
    ],
  },
  {
    id: 'mock-3',
    slug: 'education-innovation-summit',
    bannerUrl: '/images/forum-edu.svg',
    startsAt: '2027-02-18T11:00:00+06:00',
    timeZone: 'Asia/Bishkek',
    venueName: 'Ош, Jannat Resort',
    tag: { ru: 'Образование', ky: 'Билим берүү', en: 'Education' },
    tagColor: 'purple',
    title: { ru: 'Education & Innovation Summit' },
    shortDescription: {
      ru: 'Форум об образовании, EdTech и новых возможностях для развития талантов в Кыргызстане.',
      ky: 'Билим берүү, EdTech жана Кыргызстанда таланттарды өнүктүрүүнүн жаңы мүмкүнчүлүктөрү боюнча форум.',
      en: 'A forum on education, EdTech and new opportunities for developing talent in Kyrgyzstan.',
    },
    availableTickets: 0,
    categories: [
      { code: 'STANDARD', priceMinor: 180000, name: { ru: 'Standard' } },
      { code: 'VIP', priceMinor: 450000, name: { ru: 'VIP' } },
    ],
  },
]
