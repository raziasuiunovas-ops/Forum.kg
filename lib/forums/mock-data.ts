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
    description: {
      ru: 'Главная встреча о технологиях, цифровой трансформации и будущем инноваций Кыргызстана. Доклады лидеров индустрии, панельные дискуссии, демо стартапов и нетворкинг.',
      ky: 'Кыргызстандын технологиялар, санариптик трансформация жана инновациялардын келечеги боюнча башкы жолугушуусу. Тармак лидерлеринин докладдары, панелдик талкуулар, стартаптардын демолору жана нетворкинг.',
      en: 'The main meeting on technology, digital transformation and the future of innovation in Kyrgyzstan. Industry keynotes, panel discussions, startup demos and networking.',
    },
    venueAddress: { ru: 'пр. Чуй 128, Бишкек', ky: 'Чүй пр. 128, Бишкек', en: '128 Chuy Ave, Bishkek' },
    maxTicketsPerAccount: 1,
    availableTickets: 48,
    categories: [
      { code: 'STANDARD', available: 30, priceMinor: 250000, name: { ru: 'Standard' } },
      { code: 'VIP', available: 18, priceMinor: 600000, name: { ru: 'VIP' } },
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
    description: {
      ru: 'Региональный форум о платежах, цифровых финансах и развитии финтех-экосистемы Центральной Азии. Банки, финтех-компании и регуляторы в одном зале.',
      ky: 'Борбордук Азиядагы төлөмдөр, санариптик финансы жана финтех-экосистеманын өнүгүүсү боюнча аймактык форум. Банктар, финтех-компаниялар жана жөнгө салуучулар бир залда.',
      en: 'A regional forum on payments, digital finance and the growth of the Central Asian fintech ecosystem. Banks, fintech companies and regulators in one room.',
    },
    venueAddress: { ru: 'ул. Тоголок Молдо 1, Бишкек', ky: 'Тоголок Молдо көч. 1, Бишкек', en: '1 Togolok Moldo St, Bishkek' },
    maxTicketsPerAccount: 2,
    availableTickets: 112,
    categories: [
      { code: 'STANDARD', available: 80, priceMinor: 300000, name: { ru: 'Standard' } },
      { code: 'VIP', available: 32, priceMinor: 700000, name: { ru: 'VIP' } },
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
    description: {
      ru: 'Форум об образовании, EdTech и новых возможностях для развития талантов в Кыргызстане. Практические сессии, кейсы школ и университетов, площадка для стартапов.',
      ky: 'Билим берүү, EdTech жана Кыргызстанда таланттарды өнүктүрүүнүн жаңы мүмкүнчүлүктөрү боюнча форум. Практикалык сессиялар, мектептердин жана университеттердин кейстери, стартаптарга аянтча.',
      en: 'A forum on education, EdTech and new ways to develop talent in Kyrgyzstan. Hands-on sessions, school and university cases, a startup showcase.',
    },
    venueAddress: { ru: 'Джаннат Резорт, Ош', ky: 'Жаннат Резорт, Ош', en: 'Jannat Resort, Osh' },
    maxTicketsPerAccount: 1,
    availableTickets: 0,
    categories: [
      { code: 'STANDARD', available: 0, priceMinor: 180000, name: { ru: 'Standard' } },
      { code: 'VIP', available: 0, priceMinor: 450000, name: { ru: 'VIP' } },
    ],
  },
]
