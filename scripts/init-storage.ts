#!/usr/bin/env tsx
/**
 * Initialize S3 storage bucket
 * Usage: npm run storage:init
 */

import 'dotenv/config'
import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'

async function main() {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const region = process.env.AWS_REGION
  const bucket = process.env.AWS_S3_PRIVATE_BUCKET

  if (!endpoint || !accessKeyId || !secretAccessKey || !region || !bucket) {
    console.error('❌ Missing AWS configuration in .env file')
    process.exit(1)
  }

  console.log(`🔧 Initializing bucket: ${bucket}`)

  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    console.log('✅ Bucket already exists and is ready!')
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log('📦 Creating bucket...')
      await client.send(new CreateBucketCommand({ Bucket: bucket }))
      console.log('✅ Bucket created successfully!')
    } else {
      throw error
    }
  }
}

main().catch(console.error)
