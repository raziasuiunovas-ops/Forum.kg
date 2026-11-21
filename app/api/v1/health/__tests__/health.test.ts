import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { GET } from '../route'

type HealthResponse = {
  status: 'ok' | 'unavailable'
  timestamp: string
  checks: {
    application: { status: 'ok' | 'unavailable'; message?: string }
    database?: { status: 'ok' | 'unavailable'; message?: string }
  }
}

function request(url: string): NextRequest {
  return new NextRequest(url)
}

test('liveness returns healthy without querying the database', async (t) => {
  let databaseQueried = false
  t.mock.method(prisma, '$queryRaw', async () => {
    databaseQueried = true
    return []
  })

  const response = await GET(request('http://localhost/api/v1/health?check=live'))
  const body = await response.json() as HealthResponse

  assert.equal(response.status, 200)
  assert.equal(body.status, 'ok')
  assert.equal(body.checks.application.status, 'ok')
  assert.equal(body.checks.database, undefined)
  assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.equal(Number.isNaN(Date.parse(body.timestamp)), false)
  assert.equal(databaseQueried, false)
})

test('readiness returns healthy when the database query succeeds', async (t) => {
  let databaseQueried = false
  t.mock.method(prisma, '$queryRaw', async () => {
    databaseQueried = true
    return [{ result: 1 }]
  })

  const response = await GET(request('http://localhost/api/v1/health?check=ready'))
  const body = await response.json() as HealthResponse

  assert.equal(response.status, 200)
  assert.equal(body.status, 'ok')
  assert.equal(body.checks.application.status, 'ok')
  assert.deepEqual(body.checks.database, {
    status: 'ok',
    message: 'Database is accessible',
  })
  assert.equal(databaseQueried, true)
})

test('readiness is the default and checks the database', async (t) => {
  t.mock.method(prisma, '$queryRaw', async () => [{ result: 1 }])

  const response = await GET(request('http://localhost/api/v1/health'))
  const body = await response.json() as HealthResponse

  assert.equal(response.status, 200)
  assert.equal(body.checks.database?.status, 'ok')
})

test('readiness returns a generic unavailable response when the database query fails', async (t) => {
  t.mock.method(console, 'error', () => undefined)
  t.mock.method(prisma, '$queryRaw', async () => {
    throw new Error('private database connection detail')
  })

  const response = await GET(request('http://localhost/api/v1/health?check=ready'))
  const body = await response.json() as HealthResponse
  const responseText = JSON.stringify(body)

  assert.equal(response.status, 503)
  assert.equal(body.status, 'unavailable')
  assert.deepEqual(body.checks.database, {
    status: 'unavailable',
    message: 'Database is not accessible',
  })
  assert.equal(responseText.includes('private database connection detail'), false)
  assert.equal(responseText.includes('DATABASE_URL'), false)
})

test('health check rejects an unsupported check mode', async (t) => {
  t.mock.method(console, 'error', () => undefined)

  const response = await GET(request('http://localhost/api/v1/health?check=invalid'))
  const body = await response.json() as { error: { code: string } }

  assert.equal(response.status, 422)
  assert.equal(body.error.code, 'VALIDATION_ERROR')
})

test('health check rejects unknown query parameters', async (t) => {
  t.mock.method(console, 'error', () => undefined)

  const response = await GET(request('http://localhost/api/v1/health?check=live&extra=1'))
  const body = await response.json() as { error: { code: string } }

  assert.equal(response.status, 422)
  assert.equal(body.error.code, 'VALIDATION_ERROR')
})
