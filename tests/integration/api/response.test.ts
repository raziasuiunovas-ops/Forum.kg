import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  conflict,
  created,
  error,
  forbidden,
  noContent,
  notFound,
  paginated,
  success,
  unauthorized,
  validationError,
} from '../../../lib/api/response'

test('success and created helpers return JSON with their expected status codes', async () => {
  const successResponse = success({ id: 'example' })
  const createdResponse = created({ id: 'created' })

  assert.equal(successResponse.status, 200)
  assert.deepEqual(await successResponse.json(), { id: 'example' })
  assert.equal(createdResponse.status, 201)
  assert.deepEqual(await createdResponse.json(), { id: 'created' })
})

test('paginated helper wraps data with pagination metadata', async () => {
  const response = paginated([{ id: 'one' }], {
    page: 1,
    limit: 20,
    total: 1,
    totalPages: 1,
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    data: [{ id: 'one' }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  })
})

test('noContent returns an empty 204 response', async () => {
  const response = noContent()

  assert.equal(response.status, 204)
  assert.equal(await response.text(), '')
})

test('generic and validation errors preserve the API error envelope', async () => {
  const genericResponse = error('INVALID_INPUT', 'Invalid input', 422, { field: 'name' })
  const validationResponse = validationError('Invalid fields', { name: ['Required'] })

  assert.equal(genericResponse.status, 422)
  assert.deepEqual(await genericResponse.json(), {
    error: { code: 'INVALID_INPUT', message: 'Invalid input', details: { field: 'name' } },
  })
  assert.equal(validationResponse.status, 422)
  assert.deepEqual(await validationResponse.json(), {
    error: { code: 'VALIDATION_ERROR', message: 'Invalid fields', details: { fields: { name: ['Required'] } } },
  })
})

test('standard client error helpers return their documented HTTP statuses', async () => {
  const cases = [
    [unauthorized(), 401, 'UNAUTHORIZED'],
    [forbidden(), 403, 'INSUFFICIENT_PERMISSIONS'],
    [notFound('Пост'), 404, 'NOT_FOUND'],
    [conflict('Already exists'), 409, 'CONFLICT'],
  ] as const

  for (const [response, expectedStatus, expectedCode] of cases) {
    assert.equal(response.status, expectedStatus)
    const body = await response.json() as { error: { code: string } }
    assert.equal(body.error.code, expectedCode)
  }
})
