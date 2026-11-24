/**
 * Email Service using Resend
 * Handles all email sending including password reset emails
 */

import { Resend } from 'resend'

// Initialize Resend with API key from environment
const resend = new Resend(process.env.RESEND_API_KEY)

// Configuration
const FROM_EMAIL = 'onboarding@resend.dev' // For testing without custom domain
const SITE_NAME = 'FORUM.KG'

/**
 * Get the application base URL for constructing links
 * Uses NEXT_PUBLIC_APP_URL or falls back to production URL
 */
function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://forum-kg.vercel.app'
}

/**
 * Generate HTML email template for password reset
 * Styled to match FORUM.KG branding
 */
function generatePasswordResetEmail(resetLink: string, locale: string = 'ru'): string {
  const texts = {
    ru: {
      title: 'Восстановление пароля',
      greeting: 'Здравствуйте!',
      body1: 'Вы запросили восстановление пароля для вашего аккаунта на FORUM.KG.',
      body2: 'Нажмите на кнопку ниже, чтобы создать новый пароль:',
      button: 'Восстановить пароль',
      expiry: 'Эта ссылка действительна в течение 15 минут.',
      ignore: 'Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.',
      footer: 'С уважением,<br/>Команда FORUM.KG',
      alt: 'Или скопируйте эту ссылку в браузер:',
    },
    en: {
      title: 'Password Recovery',
      greeting: 'Hello!',
      body1: 'You have requested to reset your password for your FORUM.KG account.',
      body2: 'Click the button below to create a new password:',
      button: 'Reset Password',
      expiry: 'This link is valid for 15 minutes.',
      ignore: 'If you did not request a password reset, please ignore this email.',
      footer: 'Best regards,<br/>FORUM.KG Team',
      alt: 'Or copy this link to your browser:',
    },
    ky: {
      title: 'Сырсөздү калыбына келтирүү',
      greeting: 'Саламатсызбы!',
      body1: 'Сиз FORUM.KG сайтындагы эсебиңиздин сырсөзүн калыбына келтирүүнү суранткансыз.',
      body2: 'Жаңы сырсөз түзүү үчүн төмөнкү баскычты басыңыз:',
      button: 'Сырсөздү калыбына келтирүү',
      expiry: 'Бул шилтеме 15 мүнөткө жарактуу.',
      ignore: 'Эгер сиз сырсөздү калыбына келтирүүнү сураган жок болсоңуз, бул катты этибарга албаңыз.',
      footer: 'Урматтоо менен,<br/>FORUM.KG командасы',
      alt: 'Же бул шилтемени браузериңизге көчүрүңүз:',
    },
  }

  const t = texts[locale as keyof typeof texts] || texts.ru

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #0f0f23;
      color: #ffffff;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .logo {
      font-size: 32px;
      font-weight: 900;
      color: #3B82F6;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    .card {
      background: linear-gradient(135deg, #1a1a3e 0%, #0f0f23 100%);
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 24px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    .title {
      font-size: 28px;
      font-weight: 800;
      margin: 0 0 20px 0;
      color: #ffffff;
    }
    .text {
      font-size: 16px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 16px 0;
    }
    .button {
      display: inline-block;
      background: #3B82F6;
      color: #ffffff;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 16px;
      margin: 24px 0;
      box-shadow: 0 14px 32px -10px rgba(59, 130, 246, 0.6);
      transition: transform 0.2s;
    }
    .button:hover {
      transform: translateY(-2px);
    }
    .link {
      color: #3B82F6;
      word-break: break-all;
      font-size: 14px;
    }
    .warning {
      background: rgba(251, 191, 36, 0.1);
      border-left: 4px solid #fbbf24;
      padding: 16px;
      border-radius: 8px;
      margin: 24px 0;
    }
    .warning-text {
      font-size: 14px;
      color: #fbbf24;
      margin: 0;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 40px;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
      color: #64748b;
      font-size: 14px;
    }
    .divider {
      height: 1px;
      background: rgba(148, 163, 184, 0.1);
      margin: 32px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">FORUM.KG</div>
    </div>
    
    <div class="card">
      <h1 class="title">${t.title}</h1>
      <p class="text">${t.greeting}</p>
      <p class="text">${t.body1}</p>
      <p class="text">${t.body2}</p>
      
      <div style="text-align: center;">
        <a href="${resetLink}" class="button">${t.button}</a>
      </div>
      
      <div class="warning">
        <p class="warning-text">⏱️ ${t.expiry}</p>
      </div>
      
      <div class="divider"></div>
      
      <p class="text" style="font-size: 14px;">${t.alt}</p>
      <a href="${resetLink}" class="link">${resetLink}</a>
      
      <div class="divider"></div>
      
      <p class="text" style="font-size: 14px;">${t.ignore}</p>
    </div>
    
    <div class="footer">
      <p>${t.footer}</p>
      <p style="margin-top: 8px; color: #475569;">© ${new Date().getFullYear()} ${SITE_NAME}</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Send password reset email
 * @param to - Recipient email address
 * @param resetToken - Plain reset token (not hashed)
 * @param locale - User's preferred locale
 * @returns Success status
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  locale: string = 'ru'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate API key
    if (!process.env.RESEND_API_KEY) {
      console.error('[Email Service] RESEND_API_KEY not configured')
      return { success: false, error: 'Email service not configured' }
    }

    // Construct reset link with token
    const baseUrl = getAppUrl()
    const resetLink = `${baseUrl}/${locale}/reset-password?token=${encodeURIComponent(resetToken)}`

    // Generate email HTML
    const html = generatePasswordResetEmail(resetLink, locale)

    // Send email via Resend
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: locale === 'en' ? 'Password Reset - FORUM.KG' : 
               locale === 'ky' ? 'Сырсөздү калыбына келтирүү - FORUM.KG' :
               'Восстановление пароля - FORUM.KG',
      html,
    })

    if (error) {
      console.error('[Email Service] Resend error:', error)
      return { success: false, error: error.message }
    }

    console.log('[Email Service] Password reset email sent:', data?.id)
    return { success: true }
  } catch (error) {
    console.error('[Email Service] Unexpected error:', error)
    return { success: false, error: 'Failed to send email' }
  }
}

/**
 * Send test email to verify Resend configuration
 */
export async function sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!process.env.RESEND_API_KEY) {
      return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Test Email from FORUM.KG',
      html: '<p>This is a test email from FORUM.KG password reset system.</p>',
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: 'Failed to send test email' }
  }
}
