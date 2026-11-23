import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { MAX_UPLOAD_BYTES } from '@/lib/uploads/validation'

export interface PrivateUploadStore {
  put(key: string, bytes: Uint8Array, contentType: string, fileName: string): Promise<void>
  get(key: string): Promise<Uint8Array | null>
}

export interface PrivateUploadStorageConfig {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  production: boolean
}

const MAX_DOWNLOAD_BYTES = MAX_UPLOAD_BYTES
let defaultStore: PrivateUploadStore | undefined

/** Construct an S3 client from the existing Neon/AWS-compatible environment. */
export function createPrivateUploadStorageConfig(
  env: Readonly<Record<string, string | undefined>>
): PrivateUploadStorageConfig {
  const endpointValue = env.AWS_ENDPOINT_URL_S3?.trim()
  const bucket = env.AWS_S3_PRIVATE_BUCKET?.trim()
  const region = env.AWS_REGION?.trim()
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim()
  const production = env.NODE_ENV === 'production'

  if (!endpointValue || !bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error('Private upload storage is not configured')
  }

  if (!/^[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])?$/.test(bucket) || bucket.includes('..')) {
    throw new Error('Private upload storage is not configured')
  }

  let endpoint: URL
  try {
    endpoint = new URL(endpointValue)
  } catch {
    throw new Error('Private upload storage is not configured')
  }

  const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(endpoint.hostname.toLowerCase())
  if (
    !['https:', 'http:'].includes(endpoint.protocol) ||
    production && endpoint.protocol !== 'https:' ||
    endpoint.protocol === 'http:' && !localHost ||
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash
  ) {
    throw new Error('Private upload storage is not configured')
  }

  return {
    endpoint: endpoint.toString().replace(/\/$/, ''),
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    production,
  }
}

/**
 * Neon Object Storage requires path-style addressing. Objects are never given
 * public ACLs or direct URLs; reads go through the authenticated API proxy.
 */
export function createPrivateUploadStore(
  env: Readonly<Record<string, string | undefined>>,
  client?: S3Client
): PrivateUploadStore {
  const config = createPrivateUploadStorageConfig(env)
  const s3 = client ?? createConfiguredS3Client(config)

  return new S3PrivateUploadStore(config, s3)
}

export function createConfiguredS3Client(config: PrivateUploadStorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  })
}

export function getPrivateUploadStore(): PrivateUploadStore {
  if (!defaultStore) defaultStore = createPrivateUploadStore(process.env)
  return defaultStore
}

class S3PrivateUploadStore implements PrivateUploadStore {
  constructor(
    private readonly config: PrivateUploadStorageConfig,
    private readonly client: S3Client
  ) {}

  async put(key: string, bytes: Uint8Array, contentType: string, fileName: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: contentType,
      ContentDisposition: `attachment; filename="${fileName}"`,
      CacheControl: 'private, no-store, max-age=0',
      IfNoneMatch: '*',
    }))
  }

  async get(key: string): Promise<Uint8Array | null> {
    let response
    try {
      response = await this.client.send(new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }))
    } catch (error) {
      if (isMissingObject(error)) return null
      throw new Error('Private upload storage request failed')
    }

    if (!response.Body) return null
    if (response.ContentLength !== undefined && response.ContentLength > MAX_DOWNLOAD_BYTES) {
      cancelBody(response.Body)
      throw new Error('Stored upload exceeds the allowed size')
    }

    const body = response.Body as unknown as AsyncIterable<Uint8Array> & {
      destroy?: () => void
      transformToByteArray?: () => Promise<Uint8Array>
    }

    if (typeof body[Symbol.asyncIterator] === 'function') {
      const parts: Uint8Array[] = []
      let total = 0
      for await (const part of body) {
        total += part.byteLength
        if (total > MAX_DOWNLOAD_BYTES) {
          cancelBody(response.Body)
          throw new Error('Stored upload exceeds the allowed size')
        }
        parts.push(part)
      }
      return concatenate(parts, total)
    }

    if (typeof body.transformToByteArray === 'function') {
      const bytes = await body.transformToByteArray()
      if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error('Stored upload exceeds the allowed size')
      return bytes
    }

    throw new Error('Private upload storage returned an invalid response')
  }
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { name?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: unknown } }
  return value.name === 'NoSuchKey' || value.name === 'NotFound' || value.Code === 'NoSuchKey' || value.$metadata?.httpStatusCode === 404
}

function cancelBody(body: unknown): void {
  if (body && typeof body === 'object' && 'destroy' in body && typeof body.destroy === 'function') {
    try { body.destroy() } catch { /* Best-effort stream cleanup. */ }
  }
}

function concatenate(parts: Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}
