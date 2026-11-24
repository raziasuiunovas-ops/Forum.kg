/**
 * Email Service using SendGrid (Alternative to Resend)
 * Works without custom domain using SendGrid's verified sender
 */

let sgMail: any = null

try {
  // Dynamic import to avoid errors if @sendgrid/mail is not installed
  sgMail = require('@sendgrid/mail')
  
  // Initialize SendGrid
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  }
} catch (error) {
  console.warn('[Email Service] @sendgrid/mail not installed. Run: npm install @sendgrid/mail')
}

const SITE_NAME = 'FORUM.KG'

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://forum-kg.vercel.app'
}

// Use your verified SendGrid sender email
// Get it from: https://app.sendgrid.com/settings/sender_auth/senders
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@sendgrid.net'

/**
 * Generate HTML email template for password reset
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
  }

  const t = texts[locale as keyof typeof texts] || texts.ru

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f23;color:#fff;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:40px;">
      <div style="font-size:32px;font-weight:900;color:#3B82F6;letter-spacing:-0.02em;text-transform:uppercase;">FORUM.KG</div>
    </div>
    
    <div style="background:linear-gradient(135deg,#1a1a3e 0%,#0f0f23 100%);border:1px solid rgba(59,130,246,0.2);border-radius:24px;padding:40px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
      <h1 style="font-size:28px;font-weight:800;margin:0 0 20px 0;color:#fff;">${t.title}</h1>
      <p style="font-size:16px;line-height:1.6;color:#94a3b8;margin:0 0 16px 0;">${t.greeting}</p>
      <p style="font-size:16px;line-height:1.6;color:#94a3b8;margin:0 0 16px 0;">${t.body1}</p>
      <p style="font-size:16px;line-height:1.6;color:#94a3b8;margin:0 0 16px 0;">${t.body2}</p>
      
      <div style="text-align:center;margin:24px 0;">
        <a href="${resetLink}" style="display:inline-block;background:#3B82F6;color:#fff;text-decoration:none;padding:16px 32px;border-radius:999px;font-weight:700;font-size:16px;box-shadow:0 14px 32px -10px rgba(59,130,246,0.6);">${t.button}</a>
      </div>
      
      <div style="background:rgba(251,191,36,0.1);border-left:4px solid #fbbf24;padding:16px;border-radius:8px;margin:24px 0;">
        <p style="font-size:14px;color:#fbbf24;margin:0;">⏱️ ${t.expiry}</p>
      </div>
      
      <div style="height:1px;background:rgba(148,163,184,0.1);margin:32px 0;"></div>
      
      <p style="font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 16px 0;">${t.alt}</p>
      <a href="${resetLink}" style="color:#3B82F6;word-break:break-all;font-size:14px;">${resetLink}</a>
      
      <div style="height:1px;background:rgba(148,163,184,0.1);margin:32px 0;"></div>
      
      <p style="font-size:14px;color:#94a3b8;margin:0;">${t.ignore}</p>
    </div>
    
    <div style="text-align:center;margin-top:40px;padding-top:40px;border-top:1px solid rgba(148,163,184,0.1);color:#64748b;font-size:14px;">
      <p>${t.footer}</p>
      <p style="margin-top:8px;color:#475569;">© ${new Date().getFullYear()} ${SITE_NAME}</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Send password reset email via SendGrid
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  locale: string = 'ru'
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!sgMail) {
      console.error('[Email Service] SendGrid not initialized. Install with: npm install @sendgrid/mail')
      return { success: false, error: 'SendGrid not installed' }
    }

    if (!process.env.SENDGRID_API_KEY) {
      console.error('[Email Service] SENDGRID_API_KEY not configured')
      return { success: false, error: 'Email service not configured' }
    }

    const baseUrl = getAppUrl()
    const resetLink = `${baseUrl}/${locale}/reset-password?token=${encodeURIComponent(resetToken)}`
    const html = generatePasswordResetEmail(resetLink, locale)

    const msg = {
      to,
      from: FROM_EMAIL,
      subject: locale === 'en' ? 'Password Reset - FORUM.KG' : 'Восстановление пароля - FORUM.KG',
      html,
    }

    await sgMail.send(msg)
    console.log('[Email Service] Password reset email sent via SendGrid')
    return { success: true }
  } catch (error: any) {
    console.error('[Email Service] SendGrid error:', error.response?.body || error.message || error)
    return { success: false, error: error.message || 'Failed to send email' }
  }
}
