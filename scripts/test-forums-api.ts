/**
 * Script to test the forums API endpoint
 * Run with: npx tsx scripts/test-forums-api.ts
 */

async function main() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  console.log('Testing /api/v1/forums endpoint...\n')
  
  try {
    const response = await fetch(`${baseUrl}/api/v1/forums?locale=RU&limit=10`)
    
    if (!response.ok) {
      console.error(`❌ API returned status: ${response.status}`)
      const text = await response.text()
      console.error('Response:', text)
      return
    }
    
    const data = await response.json()
    
    console.log(`✅ API call successful`)
    console.log(`Found ${data.forums?.length || 0} forum(s)\n`)
    
    if (data.forums && data.forums.length > 0) {
      for (const forum of data.forums) {
        console.log(`Forum: ${forum.slug}`)
        console.log(`  Title: ${forum.title}`)
        console.log(`  Status: ${forum.status}`)
        console.log(`  Venue: ${forum.venueName}`)
        console.log()
      }
    }
  } catch (error) {
    console.error('❌ Error testing API:', error)
  }
}

main()
