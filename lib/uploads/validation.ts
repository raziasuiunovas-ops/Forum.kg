import { inflateSync } from 'node:zlib'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const MAX_UPLOAD_PIXELS = 4_000_000

export type UploadFormat = {
  extension: 'png' | 'jpg' | 'jpeg' | 'webp'
  contentType: 'image/png' | 'image/jpeg' | 'image/webp'
}

export type UploadValidationResult =
  | { ok: true; format: UploadFormat; width: number; height: number }
  | { ok: false; reason: 'too_large' | 'unsupported_type' | 'invalid_content' }

const FORMAT_BY_EXTENSION: Record<string, UploadFormat> = {
  png: { extension: 'png', contentType: 'image/png' },
  jpg: { extension: 'jpg', contentType: 'image/jpeg' },
  jpeg: { extension: 'jpeg', contentType: 'image/jpeg' },
  webp: { extension: 'webp', contentType: 'image/webp' },
}

/** Validate the filename hints, declared MIME type, file signature, and structure. */
export function validateUpload(
  fileName: string,
  declaredContentType: string,
  bytes: Uint8Array
): UploadValidationResult {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too_large' }

  // The original filename is never persisted or used as a storage path.
  if (!fileName || fileName.length > 128 || /[\\/\0]/.test(fileName)) {
    return { ok: false, reason: 'unsupported_type' }
  }

  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  const format = FORMAT_BY_EXTENSION[extension]
  if (!format || declaredContentType.toLowerCase() !== format.contentType) {
    return { ok: false, reason: 'unsupported_type' }
  }

  try {
    const dimensions = inspectImage(bytes)
    if (!dimensions || dimensions.contentType !== format.contentType) {
      return { ok: false, reason: 'invalid_content' }
    }
    if (!isAllowedDimensions(dimensions.width, dimensions.height)) {
      return { ok: false, reason: 'invalid_content' }
    }

    return { ok: true, format, width: dimensions.width, height: dimensions.height }
  } catch {
    return { ok: false, reason: 'invalid_content' }
  }
}

function inspectImage(bytes: Uint8Array):
  | { contentType: UploadFormat['contentType']; width: number; height: number }
  | null {
  if (hasPngSignature(bytes)) return inspectPng(bytes)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return inspectJpeg(bytes)
  if (hasAscii(bytes, 0, 'RIFF') && hasAscii(bytes, 8, 'WEBP')) return inspectWebp(bytes)
  return null
}

function isAllowedDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) &&
    width > 0 && height > 0 && width <= 8192 && height <= 8192 &&
    width * height <= MAX_UPLOAD_PIXELS
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d &&
    bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
}

function inspectPng(bytes: Uint8Array): { contentType: 'image/png'; width: number; height: number } | null {
  if (bytes.length < 33) return null

  const allowedChunks = new Set([
    'IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'sRGB', 'pHYs', 'bKGD', 'sBIT',
  ])
  const idat: Uint8Array[] = []
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = -1
  let seenHeader = false
  let seenPalette = false
  let seenData = false
  let dataEnded = false
  let seenEnd = false

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return null
    const length = readU32(bytes, offset)
    const type = readAscii(bytes, offset + 4, 4)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + 4
    if (!Number.isSafeInteger(dataEnd) || chunkEnd > bytes.length || !allowedChunks.has(type)) return null
    if (pngCrc32(bytes.subarray(offset + 4, dataEnd)) !== readU32(bytes, dataEnd)) return null

    if (!seenHeader && type !== 'IHDR') return null
    if (type === 'IHDR') {
      if (seenHeader || length !== 13) return null
      width = readU32(bytes, dataStart)
      height = readU32(bytes, dataStart + 4)
      bitDepth = bytes[dataStart + 8]
      colorType = bytes[dataStart + 9]
      const validBitDepth: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      }
      if (!validBitDepth[colorType]?.includes(bitDepth) ||
        bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0 ||
        bytes[dataStart + 12] !== 0 || !isAllowedDimensions(width, height)) return null
      seenHeader = true
    } else if (type === 'PLTE') {
      if (!seenHeader || seenData || seenPalette || length === 0 || length % 3 !== 0 || length > 768 || colorType === 0 || colorType === 4) return null
      if (colorType === 3 && length / 3 > 2 ** bitDepth) return null
      seenPalette = true
    } else if (type === 'IDAT') {
      if (!seenHeader || dataEnded || (colorType === 3 && !seenPalette)) return null
      seenData = true
      idat.push(bytes.subarray(dataStart, dataEnd))
    } else if (type === 'IEND') {
      if (!seenData || length !== 0 || seenEnd) return null
      seenEnd = true
      offset = chunkEnd
      break
    } else {
      if (!seenHeader || seenEnd || seenData && type !== 'IDAT') return null
      if (type === 'tRNS' && (colorType === 4 || colorType === 6)) return null
    }

    if (seenData && type !== 'IDAT') dataEnded = true
    offset = chunkEnd
  }

  if (!seenEnd || offset !== bytes.length || idat.length === 0) return null
  const channelCount: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const rowBytes = Math.ceil(width * channelCount[colorType] * bitDepth / 8)
  const expectedBytes = (rowBytes + 1) * height
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes > 20 * 1024 * 1024) return null

  const compressed = Buffer.concat(idat.map((part) => Buffer.from(part)))
  const inflated = inflateSync(compressed, { maxOutputLength: expectedBytes + 1 })
  if (inflated.byteLength !== expectedBytes) return null
  for (let row = 0; row < height; row += 1) {
    if (inflated[row * (rowBytes + 1)] > 4) return null
  }

  return { contentType: 'image/png', width, height }
}

function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function inspectJpeg(bytes: Uint8Array): { contentType: 'image/jpeg'; width: number; height: number } | null {
  let offset = 2
  let width = 0
  let height = 0
  let hasFrame = false
  let hasScan = false
  let scans = 0

  while (offset < bytes.length) {
    const markerStart = offset
    if (bytes[offset] !== 0xff) return null
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) return null
    const marker = bytes[offset++]

    if (marker === 0xd9) {
      if (!hasFrame || !hasScan || offset !== bytes.length) return null
      return { contentType: 'image/jpeg', width, height }
    }
    if (marker === 0xd8 || marker === 0x00 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) return null
    if (offset + 2 > bytes.length) return null

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1]
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null
    const segmentStart = offset + 2
    const segmentEnd = offset + segmentLength

    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (hasFrame || segmentLength < 8) return null
      height = (bytes[segmentStart + 1] << 8) | bytes[segmentStart + 2]
      width = (bytes[segmentStart + 3] << 8) | bytes[segmentStart + 4]
      const components = bytes[segmentStart + 5]
      if (segmentLength !== 8 + components * 3 || ![1, 3, 4].includes(components) || !isAllowedDimensions(width, height)) return null
      hasFrame = true
    }

    offset = segmentEnd
    if (marker === 0xda) {
      if (!hasFrame || segmentLength < 6) return null
      hasScan = true
      scans += 1
      if (scans > 100) return null

      let nextMarkerStart = -1
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1
          continue
        }

        const candidateStart = offset
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
        if (offset >= bytes.length) return null
        const candidate = bytes[offset]
        if (candidate === 0x00 || candidate >= 0xd0 && candidate <= 0xd7) {
          offset += 1
          continue
        }
        nextMarkerStart = candidateStart
        break
      }
      if (nextMarkerStart < 0) return null
      offset = nextMarkerStart
    }

    // Keep this assignment explicit so a zero-length segment cannot loop.
    if (offset <= markerStart) return null
  }

  return null
}

function inspectWebp(bytes: Uint8Array): { contentType: 'image/webp'; width: number; height: number } | null {
  if (bytes.length < 20 || readU32(bytes, 4) + 8 !== bytes.length) return null

  let offset = 12
  let extendedDimensions: { width: number; height: number } | null = null
  let imageDimensions: { width: number; height: number } | null = null
  let sawExtendedHeader = false

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return null
    const type = readAscii(bytes, offset, 4)
    const size = readU32(bytes, offset + 4)
    const dataStart = offset + 8
    const dataEnd = dataStart + size
    const chunkEnd = dataEnd + (size % 2)
    if (chunkEnd > bytes.length) return null

    if (type === 'VP8X') {
      if (sawExtendedHeader || imageDimensions || size !== 10) return null
      const flags = bytes[dataStart]
      if ((flags & 0xcf) !== 0 || (flags & 0x02) !== 0) return null
      extendedDimensions = {
        width: 1 + bytes[dataStart + 4] + (bytes[dataStart + 5] << 8) + (bytes[dataStart + 6] << 16),
        height: 1 + bytes[dataStart + 7] + (bytes[dataStart + 8] << 8) + (bytes[dataStart + 9] << 16),
      }
      sawExtendedHeader = true
    } else if (type === 'VP8 ' || type === 'VP8L') {
      if (imageDimensions) return null
      imageDimensions = type === 'VP8 '
        ? readLossyWebpDimensions(bytes, dataStart, size)
        : readLosslessWebpDimensions(bytes, dataStart, size)
      if (!imageDimensions) return null
    } else {
      // Reject metadata, animation, alpha sidecars, and unknown chunks. The
      // deliberately small accepted subset avoids carrying arbitrary payloads.
      return null
    }

    offset = chunkEnd
  }

  if (offset !== bytes.length || !imageDimensions) return null
  if (extendedDimensions && (extendedDimensions.width !== imageDimensions.width || extendedDimensions.height !== imageDimensions.height)) return null
  const dimensions = extendedDimensions ?? imageDimensions
  if (!isAllowedDimensions(dimensions.width, dimensions.height)) return null
  return { contentType: 'image/webp', ...dimensions }
}

function readLossyWebpDimensions(bytes: Uint8Array, offset: number, size: number): { width: number; height: number } | null {
  if (size < 10 || (bytes[offset] & 1) !== 0 || !hasAscii(bytes, offset + 3, '\x9d\x01\x2a')) return null
  const width = ((bytes[offset + 6] | bytes[offset + 7] << 8) & 0x3fff)
  const height = ((bytes[offset + 8] | bytes[offset + 9] << 8) & 0x3fff)
  return { width, height }
}

function readLosslessWebpDimensions(bytes: Uint8Array, offset: number, size: number): { width: number; height: number } | null {
  if (size < 5 || bytes[offset] !== 0x2f) return null
  const width = 1 + bytes[offset + 1] + ((bytes[offset + 2] & 0x3f) << 8)
  const height = 1 + ((bytes[offset + 2] >> 6) & 0x03) + (bytes[offset + 3] << 2) + ((bytes[offset + 4] & 0x0f) << 10)
  return { width, height }
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false)
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let result = ''
  for (let i = 0; i < length; i += 1) result += String.fromCharCode(bytes[offset + i])
  return result
}

function hasAscii(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (offset + expected.length > bytes.length) return false
  for (let i = 0; i < expected.length; i += 1) {
    if (bytes[offset + i] !== expected.charCodeAt(i)) return false
  }
  return true
}
