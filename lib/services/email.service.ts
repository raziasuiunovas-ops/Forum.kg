/**
 * Email Service
 * Handles sending emails via SendGrid or Resend
 */

interface EmailResult {
  success: boolean
  error?: string
}

/**
 * Send password reset email
 * @param email - Recipient email
 * @param token - Reset token
 * @param locale - User's preferred locale (ru, ky, en)
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  locale: string = 'ru'
): Promise<EmailResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:3000'
  
  const resetLink = `${baseUrl}/${locale}/reset-password?token=${encodeURIComponent(token)}`

  // Translations for email
  const translations = {
    ru: {
      subject: 'Восстановление пароля — FORUM.KG',
      title: 'Восстановление пароля',
      body: `
        <p>Вы запросили восстановление пароля для вашего аккаунта на FORUM.KG.</p>
        <p>Перейдите по ссылке ниже, чтобы установить новый пароль:</p>
        <p><a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Восстановить пароль</a></p>
        <p>Или скопируйте эту ссылку в браузер:</p>
        <p style="color: #666; word-break: break-all;">${resetLink}</p>
        <p><strong>Ссылка действительна 15 минут.</strong></p>
        <p>Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #999; font-size: 12px;">FORUM.KG — Территория встреч</p>
      `,
    },
    ky: {
      subject: 'Сыр сөздү калыбына келтирүү — FORUM.KG',
      title: 'Сыр сөздү калыбына келтирүү',
      body: `
        <p>Сиз FORUM.KG аккаунтуңуз үчүн сыр сөздү калыбына келтирүүнү суратты.</p>
        <p>Жаңы сыр сөз коюу үчүн төмөнкү шилтемени басыңыз:</p>
        <p><a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Сыр сөздү калыбына келтирүү</a></p>
        <p>Же бул шилтемени браузерге көчүрүңүз:</p>
        <p style="color: #666; word-break: break-all;">${resetLink}</p>
        <p><strong>Шилтеме 15 мүнөт иштейт.</strong></p>
        <p>Эгер сиз сыр сөздү калыбына келтирүүнү сураган жок болсоңуз, бул катты этибарга албаңыз.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #999; font-size: 12px;">FORUM.KG — Жолугушуулардын аймагы</p>
      `,
    },
    en: {
      subject: 'Password Reset — FORUM.KG',
      title: 'Password Reset',
      body: `
        <p>You requested a password reset for your FORUM.KG account.</p>
        <p>Click the link below to set a new password:</p>
        <p><a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a></p>
        <p>Or copy this link into your browser:</p>
        <p style="color: #666; word-break: break-all;">${resetLink}</p>
        <p><strong>This link expires in 15 minutes.</strong></p>
        <p>If you didn't request a password reset, please ignore this email.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #999; font-size: 12px;">FORUM.KG — Territory of Meetings</p>
      `,
    },
  }

  const t = translations[locale as keyof typeof translations] || translations.ru

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">FORUM.KG</h1>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #333; margin-top: 0;">${t.title}</h2>
          ${t.body}
        </div>
      </body>
    </html>
  `

  // Try SendGrid first
  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email }],
            subject: t.subject,
          }],
          from: {
            email: process.env.SENDGRID_FROM_EMAIL,
            name: 'FORUM.KG',
          },
          content: [{
            type: 'text/html',
            value: htmlContent,
          }],
        }),
      })

      if (response.ok || response.status === 202) {
        return { success: true }
      }

      const errorText = await response.text()
      console.error('[SendGrid] Failed to send email:', response.status, errorText)
      return { 
        success: false, 
        error: `SendGrid error: ${response.status}` 
      }
    } catch (error) {
      console.error('[SendGrid] Exception:', error)
      // Fall through to try Resend
    }
  }

  // Try Resend as fallback
  if (process.env.RESEND_API_KEY) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'FORUM.KG <noreply@forum.kg>',
          to: [email],
          subject: t.subject,
          html: htmlContent,
        }),
      })

      if (response.ok) {
        return { success: true }
      }

      const errorText = await response.text()
      console.error('[Resend] Failed to send email:', response.status, errorText)
      return { 
        success: false, 
        error: `Resend error: ${response.status}` 
      }
    } catch (error) {
      console.error('[Resend] Exception:', error)
      return { 
        success: false, 
        error: 'Failed to send email via Resend' 
      }
    }
  }

  // No email service configured
  console.error('[Email] No email service configured (SENDGRID_API_KEY or RESEND_API_KEY required)')
  
  // For development: log the reset link
  if (process.env.NODE_ENV === 'development') {
    console.log('\n=== PASSWORD RESET LINK (DEV MODE) ===')
    console.log('Email:', email)
    console.log('Reset link:', resetLink)
    console.log('=======================================\n')
    
    // Return success in development even without email configured
    return { success: true }
  }
  
  return { 
    success: false, 
    error: 'No email service configured' 
  }
}
