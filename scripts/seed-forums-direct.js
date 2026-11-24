/**
 * Direct database seeding for three forums
 * This bypasses the API and directly inserts into the database using Prisma
 * 
 * Usage: node scripts/seed-forums-direct.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Forum data
const forumsData = [
  {
    slug: 'bishkek-digital-forum-2026',
    status: 'PUBLISHED',
    bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200',
    venueName: 'Sheraton Hotel',
    venueAddress: 'Бишкек, пр. Манаса 191',
    locationCoordinates: {
      latitude: 42.874621,
      longitude: 74.612267,
    },
    timeZone: 'Asia/Bishkek',
    startsAt: new Date('2027-02-24T10:00:00+06:00'),
    endsAt: new Date('2027-02-24T18:00:00+06:00'),
    registrationDeadline: new Date('2027-02-23T23:59:59+06:00'),
    qrExpiresAt: new Date('2027-02-25T00:00:00+06:00'),
    capacity: 500,
    maxTicketsPerAccount: 2,
    tags: ['ТЕХНОЛОГИИ', 'БИШКЕК'],
    publishedAt: new Date(),
    translations: [
      {
        locale: 'RU',
        title: 'Bishkek Digital Forum 2026',
        shortDescription: 'Крупнейший форум о технологиях, цифровой трансформации и инновациях в Кыргызстане.',
        description: 'Крупнейший форум о технологиях, цифровой трансформации и инновациях в Кыргызстане. Присоединяйтесь к ведущим экспертам отрасли для обсуждения будущего технологий.',
        program: '10:00 - Регистрация\n11:00 - Открытие\n12:00 - Панельные дискуссии\n15:00 - Нетворкинг\n18:00 - Закрытие',
        venueName: 'Sheraton Hotel',
        venueAddress: 'Бишкек, пр. Манаса 191',
      },
      {
        locale: 'EN',
        title: 'Bishkek Digital Forum 2026',
        shortDescription: 'The largest forum on technology, digital transformation and innovation in Kyrgyzstan.',
        description: 'The largest forum on technology, digital transformation and innovation in Kyrgyzstan. Join leading industry experts to discuss the future of technology.',
        program: '10:00 - Registration\n11:00 - Opening\n12:00 - Panel Discussions\n15:00 - Networking\n18:00 - Closing',
        venueName: 'Sheraton Hotel',
        venueAddress: 'Bishkek, Manas Ave 191',
      },
    ],
    categories: [
      {
        code: 'STANDARD',
        priceMinor: 250000, // 2500 KGS
        currency: 'KGS',
        capacity: 400,
        sortOrder: 0,
        isActive: true,
        translations: [
          {
            locale: 'RU',
            name: 'Стандартный',
            description: 'Базовый доступ ко всем мероприятиям форума',
          },
          {
            locale: 'EN',
            name: 'Standard',
            description: 'Basic access to all forum events',
          },
        ],
      },
      {
        code: 'VIP',
        priceMinor: 500000, // 5000 KGS
        currency: 'KGS',
        capacity: 100,
        sortOrder: 1,
        isActive: true,
        translations: [
          {
            locale: 'RU',
            name: 'VIP',
            description: 'Премиум доступ с приоритетными местами и дополнительными привилегиями',
          },
          {
            locale: 'EN',
            name: 'VIP',
            description: 'Premium access with priority seating and additional perks',
          },
        ],
      },
    ],
  },
  {
    slug: 'fintech-forum-central-asia',
    status: 'PUBLISHED',
    bannerUrl: 'https://images.unsplash.com/photo-1559028012-481c04fa702d?w=1200',
    venueName: 'Novotel Bishkek',
    venueAddress: 'Бишкек, ул. Ибраимова 32',
    locationCoordinates: {
      latitude: 42.874722,
      longitude: 74.606944,
    },
    timeZone: 'Asia/Bishkek',
    startsAt: new Date('2027-02-08T09:30:00+06:00'),
    endsAt: new Date('2027-02-08T17:00:00+06:00'),
    registrationDeadline: new Date('2027-02-07T23:59:59+06:00'),
    qrExpiresAt: new Date('2027-02-09T00:00:00+06:00'),
    capacity: 300,
    maxTicketsPerAccount: 1,
    tags: ['ФИНАНСЫ', 'БИШКЕК'],
    publishedAt: new Date(),
    translations: [
      {
        locale: 'RU',
        title: 'Fintech Forum Central Asia',
        shortDescription: 'Региональный форум о платежах, цифровых финансах и развитии финтех-индустрии.',
        description: 'Региональный форум о платежах, цифровых финансах и развитии финтех-индустрии в Центральной Азии. Обсуждение инноваций в финансовом секторе.',
        program: '09:30 - Регистрация\n10:00 - Пленарная сессия\n12:00 - Обед\n13:00 - Секционные заседания\n16:00 - Круглый стол\n17:00 - Завершение',
        venueName: 'Novotel Bishkek',
        venueAddress: 'Бишкек, ул. Ибраимова 32',
      },
      {
        locale: 'EN',
        title: 'Fintech Forum Central Asia',
        shortDescription: 'Regional forum on payments, digital finance and fintech industry development.',
        description: 'Regional forum on payments, digital finance and fintech industry development in Central Asia. Discussion of innovations in the financial sector.',
        program: '09:30 - Registration\n10:00 - Plenary Session\n12:00 - Lunch\n13:00 - Breakout Sessions\n16:00 - Round Table\n17:00 - Closing',
        venueName: 'Novotel Bishkek',
        venueAddress: 'Bishkek, Ibraimova St 32',
      },
    ],
    categories: [
      {
        code: 'STANDARD',
        priceMinor: 300000, // 3000 KGS
        currency: 'KGS',
        capacity: 300,
        sortOrder: 0,
        isActive: true,
        translations: [
          {
            locale: 'RU',
            name: 'Стандартный билет',
            description: 'Доступ ко всем сессиям форума',
          },
          {
            locale: 'EN',
            name: 'Standard Ticket',
            description: 'Access to all forum sessions',
          },
        ],
      },
    ],
  },
  {
    slug: 'education-innovation-summit',
    status: 'PUBLISHED',
    bannerUrl: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=1200',
    venueName: 'Jannat Resort',
    venueAddress: 'Ош, парковая зона',
    locationCoordinates: {
      latitude: 40.527869,
      longitude: 72.797897,
    },
    timeZone: 'Asia/Bishkek',
    startsAt: new Date('2027-02-18T11:00:00+06:00'),
    endsAt: new Date('2027-02-18T19:00:00+06:00'),
    registrationDeadline: new Date('2027-02-17T23:59:59+06:00'),
    qrExpiresAt: new Date('2027-02-19T00:00:00+06:00'),
    capacity: 250,
    maxTicketsPerAccount: 1,
    tags: ['ОБРАЗОВАНИЕ', 'ОШ'],
    publishedAt: new Date(),
    translations: [
      {
        locale: 'RU',
        title: 'Education & Innovation Summit',
        shortDescription: 'Форум об образовании, EdTech и новых возможностях для развития талантов в регионе.',
        description: 'Форум об образовании, EdTech и новых возможностях для развития талантов в регионе. Обсуждение инновационных подходов в образовании.',
        program: '11:00 - Регистрация\n12:00 - Открытие\n13:00 - Мастер-классы\n15:00 - Перерыв\n16:00 - Панельные дискуссии\n19:00 - Закрытие',
        venueName: 'Jannat Resort',
        venueAddress: 'Ош, парковая зона',
      },
      {
        locale: 'EN',
        title: 'Education & Innovation Summit',
        shortDescription: 'Forum on education, EdTech and new opportunities for talent development in the region.',
        description: 'Forum on education, EdTech and new opportunities for talent development in the region. Discussion of innovative approaches in education.',
        program: '11:00 - Registration\n12:00 - Opening\n13:00 - Workshops\n15:00 - Break\n16:00 - Panel Discussions\n19:00 - Closing',
        venueName: 'Jannat Resort',
        venueAddress: 'Osh, Park Area',
      },
    ],
    categories: [
      {
        code: 'STANDARD',
        priceMinor: 180000, // 1800 KGS
        currency: 'KGS',
        capacity: 250,
        sortOrder: 0,
        isActive: true,
        translations: [
          {
            locale: 'RU',
            name: 'Стандартный билет',
            description: 'Полный доступ к программе саммита',
          },
          {
            locale: 'EN',
            name: 'Standard Ticket',
            description: 'Full access to summit program',
          },
        ],
      },
    ],
  },
];

async function main() {
  try {
    console.log('🚀 Starting direct database seeding...\n');

    // Get the first user (or admin) to use as createdBy
    const firstUser = await prisma.user.findFirst({
      where: {
        role: { in: ['SUPER_ADMIN', 'MANAGER', 'USER'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!firstUser) {
      throw new Error('No users found in database. Please create at least one user first.');
    }

    console.log(`Using user ${firstUser.email || firstUser.phone} as forum creator\n`);

    // Create each forum
    for (const forumData of forumsData) {
      console.log(`📝 Creating forum: ${forumData.translations[0].title}...`);

      // Check if forum already exists
      const existingForum = await prisma.forum.findUnique({
        where: { slug: forumData.slug },
      });

      if (existingForum) {
        console.log(`⚠️  Forum with slug "${forumData.slug}" already exists, skipping...\n`);
        continue;
      }

      // Extract categories and translations from forum data
      const { categories, translations, ...forumMainData } = forumData;

      // Create forum with all relations in a transaction
      await prisma.$transaction(async (tx) => {
        // Create the forum
        const forum = await tx.forum.create({
          data: {
            ...forumMainData,
            createdById: firstUser.id,
          },
        });

        // Create translations
        await tx.forumTranslation.createMany({
          data: translations.map((t) => ({
            forumId: forum.id,
            ...t,
          })),
        });

        // Create categories with their translations
        for (const category of categories) {
          const { translations: catTranslations, ...categoryData } = category;

          const createdCategory = await tx.ticketCategory.create({
            data: {
              forumId: forum.id,
              ...categoryData,
            },
          });

          await tx.ticketCategoryTranslation.createMany({
            data: catTranslations.map((t) => ({
              categoryId: createdCategory.id,
              ...t,
            })),
          });
        }

        console.log(`✅ Forum "${forumData.translations[0].title}" created successfully`);
        console.log(`   ID: ${forum.id}`);
        console.log(`   Slug: ${forum.slug}`);
        console.log(`   Status: ${forum.status}`);
        console.log(`   Categories: ${categories.length}`);
        console.log('');
      });
    }

    console.log('🎉 All forums created successfully!');
    console.log('🌐 You can now view them at: http://localhost:3001/admin\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main();
