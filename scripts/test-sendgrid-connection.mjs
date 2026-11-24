/**
 * Test SendGrid Connection
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env from parent directory
dotenv.config({ path: join(__dirname, '..', '.env') })

console.log('🧪 Testing SendGrid Configuration\n')

console.log('1️⃣ Checking environment variables...')
const apiKey = process.env.SENDGRID_API_KEY
const fromEmail = process.env.SENDGRID_FROM_EMAIL

if (!apiKey) {
  console.log('   ❌ SENDGRID_API_KEY not found in .env')
  process.exit(1)
}

if (!fromEmail) {
  console.log('   ❌ SENDGRID_FROM_EMAIL not found in .env')
  process.exit(1)
}

console.log(`   ✅ SENDGRID_API_KEY: ${apiKey.substring(0, 15)}...${apiKey.substring(apiKey.length - 10)}`)
console.log(`   ✅ SENDGRID_FROM_EMAIL: ${fromEmail}`)

console.log('\n2️⃣ Testing SendGrid SDK...')

try {
  const sgMail = await import('@sendgrid/mail')
  console.log('   ✅ @sendgrid/mail package imported successfully')
  
  sgMail.default.setApiKey(apiKey)
  console.log('   ✅ API key set successfully')
  
  console.log('\n3️⃣ Attempting to send test email...')
  console.log(`   📧 From: ${fromEmail}`)
  console.log(`   📧 To: ${fromEmail}`)
  
  const msg = {
    to: fromEmail,
    from: fromEmail,
    subject: 'Test Email from FORUM.KG',
    text: 'This is a test email to verify SendGrid configuration.',
    html: '<p>This is a test email to verify SendGrid configuration.</p>',
  }
  
  const response = await sgMail.default.send(msg)
  console.log('   ✅ Email sent successfully!')
  console.log(`   📬 Message ID: ${response[0].headers['x-message-id']}`)
  console.log(`   📊 Status: ${response[0].statusCode}`)
  
  console.log('\n✨ SendGrid is configured correctly!')
  console.log('💡 Check your email at:', fromEmail)
  
} catch (error) {
  console.log('   ❌ SendGrid error:')
  if (error.response) {
    console.log('   Status:', error.response.statusCode)
    console.log('   Body:', JSON.stringify(error.response.body, null, 2))
  } else {
    console.log('   Error:', error.message)
  }
  process.exit(1)
}
