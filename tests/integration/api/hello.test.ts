import assert from 'node:assert/strict'
import { test } from 'node:test'

import { GET } from '../../../app/api/hello/route'

test('GET /api/hello returns the health response contract', async () => {
  const response = await GET()
  const body = await response.json() as {
    status: string
    message: string
    timestamp: string
    endpoints: Record<string, string>
  }

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  assert.equal(body.status, 'OK')
  assert.equal(body.message, 'API is running')
  assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.equal(Number.isNaN(Date.parse(body.timestamp)), false)
  assert.equal(body.endpoints.hello, '/api/hello')
})
