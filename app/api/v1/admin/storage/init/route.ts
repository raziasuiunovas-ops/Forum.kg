/**
 * POST /api/v1/admin/storage/init
 * Initialize storage bucket (SUPER_ADMIN only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import { requireSuperAdmin } from '@/lib/auth/middleware'
import { createPrivateUploadStorageConfig } from '@/lib/storage/private-upload-store'

export async function POST(request: NextRequest) {
  const authResult = await requireSuperAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const config = createPrivateUploadStorageConfig(process.env)
    
    const client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    })

    // Check if bucket exists
    let bucketExists = false
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }))
      bucketExists = true
    } catch (error: any) {
      if (error.name !== 'NotFound' && error.$metadata?.httpStatusCode !== 404) {
        throw error
      }
    }

    if (bucketExists) {
      return NextResponse.json({
        message: 'Бакет уже существует и готов к использованию',
        bucket: config.bucket,
        status: 'ready',
      })
    }

    // Create bucket
    await client.send(new CreateBucketCommand({ Bucket: config.bucket }))

    return NextResponse.json({
      message: 'Бакет успешно создан',
      bucket: config.bucket,
      status: 'created',
    }, { status: 201 })

  } catch (error: any) {
    console.error('Storage init error:', error)
    
    if (error.message?.includes('not configured')) {
      return NextResponse.json({
        error: {
          code: 'STORAGE_NOT_CONFIGURED',
          message: 'Хранилище не настроено. Проверьте переменные окружения AWS_*',
        },
      }, { status: 503 })
    }

    return NextResponse.json({
      error: {
        code: 'STORAGE_INIT_FAILED',
        message: error.message || 'Не удалось инициализировать хранилище',
      },
    }, { status: 500 })
  }
}
