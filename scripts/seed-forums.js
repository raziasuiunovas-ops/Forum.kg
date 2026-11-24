/**
 * Script to seed three forums via Admin API
 * Run with: node scripts/seed-forums.js
 */

const https = require('https');
const http = require('http');

// Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_LOGIN || 'forumadmin282';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'C9Gd/2T5N52R4TAiis04';

// Helper function to make HTTP requests
function makeRequest(url, options, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = lib.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const jsonBody = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: jsonBody });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Step 1: Get CSRF token
async function getCsrfToken() {
  console.log('📡 Getting CSRF token...');
  const response = await makeRequest(`${API_BASE_URL}/api/v1/auth/csrf-token`, {
    method: 'GET',
  });
  
  if (response.status === 200 && response.data.csrfToken) {
    console.log('✅ CSRF token obtained');
    return response.data.csrfToken;
  }
  throw new Error('Failed to get CSRF token');
}

// Step 2: Admin login (get pending token)
async function adminLogin(csrfToken) {
  console.log('🔐 Logging in as admin...');
  const response = await makeRequest(`${API_BASE_URL}/api/v1/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    },
  }, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });

  if (response.status === 200 && response.data.data?.pendingToken) {
    console.log('✅ Admin login successful - 2FA code sent');
    return response.data.data.pendingToken;
  }
  throw new Error(`Admin login failed: ${JSON.stringify(response.data)}`);
}

// Step 3: Verify 2FA (manual step - user needs to enter code from Telegram)
async function verify2FA(csrfToken, pendingToken, code) {
  console.log('🔑 Verifying 2FA code...');
  const response = await makeRequest(`${API_BASE_URL}/api/v1/admin/verify-2fa`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    },
  }, {
    pendingToken,
    code,
  });

  if (response.status === 200) {
    console.log('✅ 2FA verified successfully');
    // Extract session cookie from Set-Cookie header
    const cookies = response.headers['set-cookie'];
    return cookies ? cookies.join('; ') : '';
  }
  throw new Error(`2FA verification failed: ${JSON.stringify(response.data)}`);
}

// Step 4: Create forum
async function createForum(csrfToken, sessionCookie, forumData) {
  console.log(`📝 Creating forum: ${forumData.translations[0].title}...`);
  const response = await makeRequest(`${API_BASE_URL}/api/v1/admin/forums`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      'Cookie': sessionCookie,
    },
  }, forumData);

  if (response.status === 201) {
    console.log(`✅ Forum created: ${forumData.translations[0].title}`);
    return response.data.forum;
  }
  throw new Error(`Forum creation failed: ${JSON.stringify(response.data)}`);
}

// Forum data
const forums = [
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
    startsAt: new Date('2027-02-24T10:00:00+06:00').toISOString(),
    endsAt: new Date('2027-02-24T18:00:00+06:00').toISOString(),
    registrationDeadline: new Date('2027-02-23T23:59:59+06:00').toISOString(),
    qrExpiresAt: new Date('2027-02-25T00:00:00+06:00').toISOString(),
    capacity: 500,
    maxTicketsPerAccount: 2,
    tags: ['ТЕХНОЛОГИИ', 'БИШКЕК'],
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
    startsAt: new Date('2027-02-08T09:30:00+06:00').toISOString(),
    endsAt: new Date('2027-02-08T17:00:00+06:00').toISOString(),
    registrationDeadline: new Date('2027-02-07T23:59:59+06:00').toISOString(),
    qrExpiresAt: new Date('2027-02-09T00:00:00+06:00').toISOString(),
    capacity: 300,
    maxTicketsPerAccount: 1,
    tags: ['ФИНАНСЫ', 'БИШКЕК'],
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
    startsAt: new Date('2027-02-18T11:00:00+06:00').toISOString(),
    endsAt: new Date('2027-02-18T19:00:00+06:00').toISOString(),
    registrationDeadline: new Date('2027-02-17T23:59:59+06:00').toISOString(),
    qrExpiresAt: new Date('2027-02-19T00:00:00+06:00').toISOString(),
    capacity: 250,
    maxTicketsPerAccount: 1,
    tags: ['ОБРАЗОВАНИЕ', 'ОШ'],
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

// Main execution
async function main() {
  try {
    console.log('🚀 Starting forum seeding process...\n');

    // Step 1: Get CSRF token
    const csrfToken = await getCsrfToken();
    console.log('');

    // Step 2: Login as admin
    const pendingToken = await adminLogin(csrfToken);
    console.log('');

    // Step 3: Wait for user to enter 2FA code
    console.log('⏳ Please check Telegram for 2FA code');
    console.log('📱 After receiving the code, run this script again with the code as argument:');
    console.log(`   node scripts/seed-forums.js <2FA_CODE>\n`);
    
    // If code provided as argument, verify it
    const code = process.argv[2];
    if (!code) {
      console.log(`📌 Pending token: ${pendingToken}`);
      console.log('💾 Save this token to use with your 2FA code\n');
      process.exit(0);
    }

    // Verify 2FA
    const sessionCookie = await verify2FA(csrfToken, pendingToken, code);
    console.log('');

    // Step 4: Create forums
    for (const forumData of forums) {
      await createForum(csrfToken, sessionCookie, forumData);
      console.log('');
    }

    console.log('✅ All forums created successfully!');
    console.log('🎉 You can now view them in the admin panel\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main();
