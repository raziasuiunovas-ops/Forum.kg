import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { writeSecurityAuditEvent } from '@/lib/security/audit-logger'
import { getPrivateUploadStore } from '@/lib/storage/private-upload-store'
import { validateUpload } from '@/lib/uploads/validation'

export const runtime = 'nodejs'

const FILE_ID_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpg|jpeg|webp)$/i

/** GET /api/v1/uploads/[fileId] — only the authenticated file owner can read. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ fileId: string }> }
): Promise<NextResponse> {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { fileId } = await context.params
  const match = FILE_ID_PATTERN.exec(fileId)
  if (!match) return notFoundResponse()

  const key = `private/${authResult.user.userId}/${fileId}`
  let bytes: Uint8Array | null
  try {
    bytes = await getPrivateUploadStore().get(key)
  } catch {
    writeSecurityAuditEvent({
      eventType: 'API_ERROR',
      result: 'error',
      request,
      userId: authResult.user.userId,
      reason: 'private_upload_download_failure',
      statusCode: 503,
    })
    return NextResponse.json(
      { error: { code: 'UPLOAD_STORAGE_UNAVAILABLE', message: 'Файл временно недоступен' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  if (!bytes) return notFoundResponse()

  const validation = validateUpload(fileId, mimeTypeForExtension(match[2]), bytes)
  if (!validation.ok || validation.format.extension.toLowerCase() !== match[2].toLowerCase()) {
    writeSecurityAuditEvent({
      eventType: 'SUSPICIOUS_REQUEST',
      result: 'denied',
      request,
      userId: authResult.user.userId,
      reason: 'stored_upload_content_invalid',
      statusCode: 404,
    })
    return notFoundResponse()
  }

  const responseBody = Uint8Array.from(bytes).buffer
  return new NextResponse(responseBody, {
    status: 200,
    headers: {
      'Content-Type': validation.format.contentType,
      'Content-Length': String(bytes.byteLength),
      // inline — браузер показывает картинку, а не скачивает
      'Content-Disposition': `inline; filename="${match[1]}.${validation.format.extension}"`,
      // Кешируем на 1 час — картинка не меняется после загрузки
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

function mimeTypeForExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'webp': return 'image/webp'
    default: return 'application/octet-stream'
  }
}

function notFoundResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: 'FILE_NOT_FOUND', message: 'Файл не найден' } },
    { status: 404, headers: { 'Cache-Control': 'no-store' } }
  )
}
