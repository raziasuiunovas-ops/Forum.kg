/**
 * Simplified script to seed three forums via Admin API
 * This version saves state between steps to handle 2FA flow
 * 
 * Usage:
 * 1. node scripts/seed-forums-simple.js login     - Start login and get 2FA code
 * 2. node scripts/seed-forums-simple.js create <CODE> - Verify 2FA and create forums
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
const ADMIN_USERNAME = 'forumadmin282';
const ADMIN_PASSWORD = 'C9Gd/2T5N52R4TAiis04';
const STATE_FILE = path.join(__dirname, '.seed-state.json');

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

// Save state to file
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Load state from file
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

// Step 1: Get CSRF token and login
async function loginStep() {
  console.log('🚀 Step 1: Admin Login\n');
  
  // Get CSRF token
  console.log('📡 Getting CSRF token...');
  const csrfResponse = await makeRequest(`${API_BASE_URL}/api/v1/auth/csrf-token`, {
    method: 'GET',
  });
  
  if (csrfResponse.status !== 200 || !csrfResponse.data.csrfToken) {
    throw new Error('Failed to get CSRF token');
  }
  const csrfToken = csrfResponse.data.csrfToken;
  
  // Extract cookie from CSRF request
  const csrfCookies = csrfResponse.headers['set-cookie'];
  const csrfCookie = csrfCookies ? csrfCookies.join('; ') : '';
  
  console.log('✅ CSRF token obtained\n');

  // Admin login
  console.log('🔐 Logging in as admin...');
  const loginResponse = await makeRequest(`${API_BASE_URL}/api/v1/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      'Cookie': csrfCookie,
    },
  }, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });

  if (loginResponse.status !== 200 || !loginResponse.data.data?.pendingToken) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginResponse.data)}`);
  }

  const pendingToken = loginResponse.data.data.pendingToken;
  console.log('✅ Admin login successful - 2FA code sent to Telegram\n');

  // Save state including cookie for CSRF validation
  saveState({ csrfToken, pendingToken, csrfCookie });

  console.log('📱 Check your Telegram for the 2FA code');
  console.log('🔑 Then run: node scripts/seed-forums-simple.js create <CODE>\n');
}

// Step 2: Verify 2FA and create forums
async function createStep(code) {
  console.log('🚀 Step 2: Verify 2FA and Create Forums\n');
  
  // Load state
  const state = loadState();
  if (!state || !state.csrfToken || !state.pendingToken) {
    throw new Error('No saved state found. Please run login step first.');
  }

  const { csrfToken, pendingToken, csrfCookie } = state;

  // Verify 2FA
  console.log('🔑 Verifying 2FA code...');
  const verifyResponse = await makeRequest(`${API_BASE_URL}/api/v1/admin/verify-2fa`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      'Cookie': csrfCookie || '',
    },
  }, {
    pendingToken,
    code,
  });

  if (verifyResponse.status !== 200) {
    throw new Error(`2FA verification failed: ${JSON.stringify(verifyResponse.data)}`);
  }

  console.log('✅ 2FA verified successfully\n');

  // Extract session cookie and merge with CSRF cookie
  const sessionCookies = verifyResponse.headers['set-cookie'];
  const sessionCookie = sessionCookies ? sessionCookies.join('; ') : '';
  const allCookies = [csrfCookie, sessionCookie].filter(Boolean).join('; ');

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

  // Create forums
  for (const forumData of forums) {
    console.log(`📝 Creating forum: ${forumData.translations[0].title}...`);
    const createResponse = await makeRequest(`${API_BASE_URL}/api/v1/admin/forums`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        'Cookie': allCookies,
      },
    }, forumData);

    if (createResponse.status === 201) {
      console.log(`✅ Forum created: ${forumData.translations[0].title}\n`);
    } else {
      console.error(`❌ Failed to create forum: ${JSON.stringify(createResponse.data)}\n`);
    }
  }

  // Clean up state file
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }

  console.log('🎉 All forums created successfully!');
  console.log('🌐 You can now view them in the admin panel at: ' + API_BASE_URL + '/admin\n');
}

// Main execution
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    if (command === 'login') {
      await loginStep();
    } else if (command === 'create') {
      if (!arg) {
        console.error('❌ Error: Please provide the 2FA code');
        console.error('Usage: node scripts/seed-forums-simple.js create <CODE>\n');
        process.exit(1);
      }
      await createStep(arg);
    } else {
      console.log('Usage:');
      console.log('  1. node scripts/seed-forums-simple.js login');
      console.log('  2. node scripts/seed-forums-simple.js create <CODE>\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
