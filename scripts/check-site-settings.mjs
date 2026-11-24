import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const settings = await prisma.siteSettings.findUnique({
      where: { id: 'main' },
      include: {
        translations: true,
      },
    })

    if (!settings) {
      console.log('❌ SiteSettings не найдены в базе данных')
      console.log('Создаю дефолтные настройки...')
      
      const created = await prisma.siteSettings.create({
        data: {
          id: 'main',
          displayName: 'FORUM.KG',
          primaryColorHex: '#3b82f6',
          accentColorHex: '#8b5cf6',
        },
      })
      
      console.log('✅ Настройки созданы:', created)
    } else {
      console.log('✅ SiteSettings найдены:')
      console.log(JSON.stringify(settings, null, 2))
    }
  } catch (error) {
    console.error('Ошибка:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

main()
