import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'
import { getPrivateUploadStore } from '@/lib/storage/private-upload-store'
import { MAX_UPLOAD_BYTES, validateUpload } from '@/lib/uploads/validation'

export const runtime = 'nodejs'

const MAX_MULTIPART_OVERHEAD = 64 * 1024
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD

/** POST /api/v1/uploads — authenticated, private image upload. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const contentType = request.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !/\bboundary=/i.test(contentType)) {
    return apiError('UNSUPPORTED_MEDIA_TYPE', 'Ожидается multipart/form-data', 415)
  }

  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return apiError('INVALID_CONTENT_LENGTH', 'Некорректный запрос', 400)
    if (Number(contentLength) > MAX_REQUEST_BYTES) return tooLargeResponse()
  }

  let bodyBytes: Uint8Array
  try {
    const boundedBody = await readBodyLimited(request, MAX_REQUEST_BYTES)
    if (!boundedBody) return tooLargeResponse()
    bodyBytes = boundedBody
  } catch {
    return apiError('INVALID_MULTIPART', 'Не удалось прочитать файл', 400)
  }

  let formData: FormData
  try {
    const requestBody = new Uint8Array(bodyBytes.byteLength)
    requestBody.set(bodyBytes)
    const boundedRequest = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: requestBody.buffer,
    })
    formData = await boundedRequest.formData()
  } catch {
    return apiError('INVALID_MULTIPART', 'Некорректное тело запроса', 400)
  }

  const entries = [...formData.entries()]
  if (entries.length !== 1 || entries[0][0] !== 'file' || typeof entries[0][1] === 'string') {
    return apiError('INVALID_FILE_FIELD', 'Запрос должен содержать один файл в поле file', 400)
  }

  const file = entries[0][1] as File
  if (file.size > MAX_UPLOAD_BYTES) return tooLargeResponse()

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return apiError('INVALID_FILE', 'Не удалось прочитать файл', 400)
  }

  const validation = validateUpload(file.name, file.type, bytes)
  if (!validation.ok) {
    if (validation.reason === 'too_large') return tooLargeResponse()
    if (validation.reason === 'unsupported_type') {
      return apiError('UNSUPPORTED_FILE_TYPE', 'Разрешены только корректные PNG, JPEG и WebP изображения', 415)
    }
    return apiError('INVALID_FILE_CONTENT', 'Содержимое файла не соответствует допустимому формату', 422)
  }

  const uploadId = randomUUID()
  const fileId = `${uploadId}.${validation.format.extension}`
  const key = `private/${authResult.user.userId}/${fileId}`
  const storedFileName = `${uploadId}.${validation.format.extension}`

  try {
    await getPrivateUploadStore().put(key, bytes, validation.format.contentType, storedFileName)
  } catch {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR',
      result: 'error',
      request,
      userId: authResult.user.userId,
      reason: 'private_upload_storage_failure',
      statusCode: 503,
    })
    return apiError('UPLOAD_STORAGE_UNAVAILABLE', 'Хранилище файлов временно недоступно', 503)
  }

  return NextResponse.json(
    {
      fileId,
      url: `/api/v1/uploads/${fileId}`,
      contentType: validation.format.contentType,
      size: bytes.byteLength,
    },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

async function readBodyLimited(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function tooLargeResponse(): NextResponse {
  return apiError('FILE_TOO_LARGE', 'Размер файла превышает 5 МБ', 413)
}

function apiError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } })
}
