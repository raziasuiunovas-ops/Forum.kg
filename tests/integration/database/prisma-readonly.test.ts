import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

after(async () => {
  await prisma.$disconnect()
})

test('configured isolated PostgreSQL database accepts a read-only query', async () => {
  const result = await prisma.$queryRaw<Array<{ value: number }>>`SELECT 1::int AS value`

  assert.deepEqual(result, [{ value: 1 }])
})
