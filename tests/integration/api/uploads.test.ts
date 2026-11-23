/**
 * Upload API Integration Tests
 *
 * Tests HTTP request/response flow for upload endpoints with mocked storage.
 * Real storage (S3) is not used to avoid external dependencies.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

// Set test env before imports
process.env.DATABASE_URL = ''
process.env.DIRECT_URL = ''
process.env.JWT_SECRET = 'upload-test-access-secret'
process.env.JWT_REFRESH_SECRET = 'upload-test-refresh-secret'

import * as authMiddleware from '../../../lib/auth/middleware'
import * as uploadStore from '../../../lib/storage/private-upload-store'
import { POST as uploadPost } from '../../../app/api/v1/uploads/route'
import { GET as uploadGet } from '../../../app/api/v1/uploads/[fileId]/route'

const USER_ID = randomUUID()

function authenticatedUser() {
  return {
    user: {
      userId: USER_ID,
      sessionId: randomUUID(),
      role: 'USER',
    },
  }
}

function unauthorizedResponse() {
  return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 })
}

function createMultipartRequest(file: { name: string; type: string; content: Buffer }): NextRequest {
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
  const header = Buffer.from([
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${file.name}"`,
    `Content-Type: ${file.type}`,
    '',
    '',
  ].join('\r\n'))
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([header, file.content, footer])
  const requestBody = new Uint8Array(body.byteLength)
  requestBody.set(body)

  return new NextRequest('http://localhost:3000/api/v1/uploads', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.byteLength),
    },
    body: requestBody.buffer,
  })
}

// Valid PNG (1x1 pixel)
const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
  0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
])

// Valid JPEG (minimal)
const VALID_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b,
  0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
  0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00,
  0x00, 0x3f, 0x00, 0xd2, 0xcf, 0x20, 0xff, 0xd9,
])

// ============================================================================
// TEST: Authorization
// ============================================================================

test('POST /api/v1/uploads requires authentication', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => unauthorizedResponse())

  const request = createMultipartRequest({
    name: 'test.png',
    type: 'image/png',
    content: VALID_PNG,
  })

  const response = await uploadPost(request)
  const body = await response.json() as any

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'UNAUTHORIZED')
})

test('GET /api/v1/uploads/[fileId] requires authentication', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => unauthorizedResponse())

  const fileId = `${randomUUID()}.png`
  const request = new NextRequest(`http://localhost:3000/api/v1/uploads/${fileId}`)
  const context = { params: Promise.resolve({ fileId }) }

  const response = await uploadGet(request, context)
  const body = await response.json() as any

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'UNAUTHORIZED')
})

// ============================================================================
// TEST: File Upload - Success Cases
// ============================================================================

test('POST /api/v1/uploads accepts valid PNG', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  let storedKey: string | undefined
  let storedBytes: Uint8Array | undefined
  let storedContentType: string | undefined

  t.mock.method(uploadStore, 'getPrivateUploadStore', () => ({
    async put(key: string, bytes: Uint8Array, contentType: string) {
      storedKey = key
      storedBytes = bytes
      storedContentType = contentType
    },
    async get() { return null },
  }))

  const request = createMultipartRequest({
    name: 'avatar.png',
    type: 'image/png',
    content: VALID_PNG,
  })

  const response = await uploadPost(request)
  const body = await response.json() as any

  assert.equal(response.status, 201)
  assert.match(body.fileId, /^[0-9a-f-]{36}\.png$/)
  assert.equal(body.contentType, 'image/png')
  assert.equal(body.size, VALID_PNG.length)
  assert.match(body.url, /^\/api\/v1\/uploads\/[0-9a-f-]{36}\.png$/)

  // Verify storage was called correctly
  assert.ok(storedKey?.startsWith(`private/${USER_ID}/`))
  assert.ok(storedKey?.endsWith('.png'))
  assert.equal(storedContentType, 'image/png')
  assert.equal(storedBytes?.length, VALID_PNG.length)
})

test('POST /api/v1/uploads accepts valid JPEG', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  let storedContentType: string | undefined

  t.mock.method(uploadStore, 'getPrivateUploadStore', () => ({
    async put(_key: string, _bytes: Uint8Array, contentType: string) {
      storedContentType = contentType
    },
    async get() { return null },
  }))

  const request = createMultipartRequest({
    name: 'photo.jpg',
    type: 'image/jpeg',
    content: VALID_JPEG,
  })

  const response = await uploadPost(request)
  const body = await response.json() as any

  assert.equal(response.status, 201)
  assert.match(body.fileId, /^[0-9a-f-]{36}\.jpg$/)
  assert.equal(body.contentType, 'image/jpeg')
  assert.equal(storedContentType, 'image/jpeg')
})

// ============================================================================
// TEST: File Upload - Validation Errors
// ============================================================================

test('POST /api/v1/uploads rejects non-multipart content', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  const request = new NextRequest('http://localhost:3000/api/v1/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: 'base64data' }),
  })

  const response = await uploadPost(request)
  const body = await response.json() as any

  assert.equal(response.status, 415)
  assert.equal(body.error.code, 'UNSUPPORTED_MEDIA_TYPE')
})

test('POST /api/v1/uploads rejects file too large', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  // Create 6 MB file (exceeds 5 MB limit)
  const largeFile = Buffer.alloc(6 * 1024 * 1024)

  const request = createMultipartRequest({
    name: 'large.png',
    type: 'image/png',
    content: largeFile,
  })

  const response = await uploadPost(request)
  const body = await response.json() as any

  assert.equal(response.status, 413)
  assert.equal(body.error.code, 'FILE_TOO_LARGE')
})

test('POST /api/v1/uploads rejects unsupported file type', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  const txtFile = Buffer.from('This is a text file')

  const request = createMultipartRequest({
    name: 'file.txt',
    type: 'text/plain',
    content: txtFile,
  })

  const response = await uploadPost(request)
  const body = await response.json() as any

  assert.equal(response.status, 415)
  assert.equal(body.error.code, 'UNSUPPORTED_FILE_TYPE')
})

test('POST /api/v1/uploads rejects fake PNG (wrong magic bytes)', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  const fakeImage = Buffer.from('Not a real image file')

  const request = createMultipartRequest({
    name: 'fake.png',
    type: 'image/png',
    content: fakeImage,
  })

  const response = await uploadPost(request)
  const body = await response.json() as any

  assert.equal(response.status, 422)
  assert.match(body.error.code, /INVALID_FILE_CONTENT|UNSUPPORTED_FILE_TYPE/)
})

test('POST /api/v1/uploads rejects MIME/extension mismatch', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  // PNG file but claims to be JPEG
  const request = createMultipartRequest({
    name: 'image.png',
    type: 'image/jpeg',
    content: VALID_PNG,
  })

  const response = await uploadPost(request)
  const body = await response.json() as any

  assert.equal(response.status, 415)
  // Either mime_mismatch or unsupported_file_type is acceptable
})

// ============================================================================
// TEST: File Download - Access Control
// ============================================================================

test('GET /api/v1/uploads/[fileId] returns file for owner', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  const fileId = `${randomUUID()}.png`

  t.mock.method(uploadStore, 'getPrivateUploadStore', () => ({
    async put() {},
    async get(key: string) {
      // Return file only if key matches user
      if (key.startsWith(`private/${USER_ID}/`)) {
        return VALID_PNG
      }
      return null
    },
  }))

  const request = new NextRequest(`http://localhost:3000/api/v1/uploads/${fileId}`)
  const context = { params: Promise.resolve({ fileId }) }

  const response = await uploadGet(request, context)

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'image/png')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'none'; sandbox")
  assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'same-origin')
})

test('GET /api/v1/uploads/[fileId] returns 404 for non-existent file', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  const fileId = `${randomUUID()}.png`

  t.mock.method(uploadStore, 'getPrivateUploadStore', () => ({
    async put() {},
    async get() { return null },
  }))

  const request = new NextRequest(`http://localhost:3000/api/v1/uploads/${fileId}`)
  const context = { params: Promise.resolve({ fileId }) }

  const response = await uploadGet(request, context)
  const body = await response.json() as any

  assert.equal(response.status, 404)
  assert.equal(body.error.code, 'FILE_NOT_FOUND')
})

test('GET /api/v1/uploads/[fileId] blocks other user access', async (t) => {
  const otherUserId = randomUUID()

  t.mock.method(authMiddleware, 'requireAuth', async () => ({
    user: {
      userId: otherUserId,
      sessionId: randomUUID(),
      role: 'USER',
    },
  }))

  const fileId = `${randomUUID()}.png`

  t.mock.method(uploadStore, 'getPrivateUploadStore', () => ({
    async put() {},
    async get(key: string) {
      // File exists but for different user
      if (key.startsWith(`private/${USER_ID}/`)) {
        return VALID_PNG
      }
      // Other user shouldn't be able to access
      return null
    },
  }))

  const request = new NextRequest(`http://localhost:3000/api/v1/uploads/${fileId}`)
  const context = { params: Promise.resolve({ fileId }) }

  const response = await uploadGet(request, context)
  const body = await response.json() as any

  assert.equal(response.status, 404)
  assert.equal(body.error.code, 'FILE_NOT_FOUND')
})

// ============================================================================
// TEST: Security - Path Traversal
// ============================================================================

test('GET /api/v1/uploads rejects path traversal attempts', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  const maliciousIds = [
    '../../../etc/passwd.png',
    '..%2F..%2F..%2Fetc%2Fpasswd.png',
    '/etc/passwd.png',
    'not-a-uuid.png',
  ]

  for (const maliciousId of maliciousIds) {
    const request = new NextRequest(`http://localhost:3000/api/v1/uploads/${maliciousId}`)
    const context = { params: Promise.resolve({ fileId: maliciousId }) }

    const response = await uploadGet(request, context)
    const body = await response.json() as any

    assert.equal(response.status, 404, `Should reject: ${maliciousId}`)
    assert.equal(body.error.code, 'FILE_NOT_FOUND')
  }
})

// ============================================================================
// TEST: Error Handling
// ============================================================================

test('Upload errors do not leak internal paths', async (t) => {
  t.mock.method(authMiddleware, 'requireAuth', async () => authenticatedUser())

  t.mock.method(uploadStore, 'getPrivateUploadStore', () => ({
    async put() {
      throw new Error('/var/www/uploads/internal/path/file.png: Permission denied')
    },
    async get() { return null },
  }))

  const request = createMultipartRequest({
    name: 'test.png',
    type: 'image/png',
    content: VALID_PNG,
  })

  const response = await uploadPost(request)
  const body = await response.json() as any

  assert.equal(response.status, 503)
  assert.equal(body.error.code, 'UPLOAD_STORAGE_UNAVAILABLE')
  // Error message should be generic
  assert.ok(!body.error.message.includes('/var/www'))
  assert.ok(!body.error.message.includes('Permission denied'))
})

