import assert from 'node:assert/strict'
import { test } from 'node:test'
import { S3Client } from '@aws-sdk/client-s3'
import {
  createPrivateUploadStorageConfig,
  createPrivateUploadStore,
} from '../../../lib/storage/private-upload-store'

const storageEnv = {
  NODE_ENV: 'test',
  AWS_S3_PRIVATE_BUCKET: 'forum-uploads-private',
  AWS_ENDPOINT_URL_S3: 'http://127.0.0.1:9000',
  AWS_REGION: 'us-east-2',
  AWS_ACCESS_KEY_ID: 'test-access-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
}

test('S3 adapter creates objects conditionally and never requests a public ACL', async () => {
  const commands: any[] = []
  const client = {
    send: async (command: any) => { commands.push(command); return {} },
  } as unknown as S3Client
  const store = createPrivateUploadStore(storageEnv, client)
  const bytes = new Uint8Array([1, 2, 3])

  await store.put('private/user/file.png', bytes, 'image/png', 'file.png')

  const command = commands[0]
  assert.equal(command.input.Bucket, storageEnv.AWS_S3_PRIVATE_BUCKET)
  assert.equal(command.input.Key, 'private/user/file.png')
  assert.equal(command.input.IfNoneMatch, '*')
  assert.equal(command.input.ContentType, 'image/png')
  assert.equal(command.input.ContentDisposition, 'attachment; filename="file.png"')
  assert.equal(command.input.CacheControl, 'private, no-store, max-age=0')
  assert.equal(command.input.ACL, undefined)
})

test('storage configuration requires a named bucket and rejects insecure production endpoints', () => {
  assert.throws(() => createPrivateUploadStorageConfig({ NODE_ENV: 'test' }), /not configured/)
  assert.throws(() => createPrivateUploadStorageConfig({
    ...storageEnv,
    NODE_ENV: 'production',
    AWS_ENDPOINT_URL_S3: 'http://object-storage.invalid',
  }), /not configured/)
  assert.throws(() => createPrivateUploadStorageConfig({
    ...storageEnv,
    AWS_S3_PRIVATE_BUCKET: 'bad/bucket',
  }), /not configured/)
})

test('storage config accepts HTTPS production endpoints without exposing credentials in errors', () => {
  const config = createPrivateUploadStorageConfig({
    ...storageEnv,
    NODE_ENV: 'production',
    AWS_ENDPOINT_URL_S3: 'https://objects.example.test',
  })
  assert.equal(config.endpoint, 'https://objects.example.test')
  assert.equal(config.bucket, storageEnv.AWS_S3_PRIVATE_BUCKET)
})

test('S3 adapter bounds download size using metadata before reading object contents', async () => {
  let streamDestroyed = false
  const client = {
    send: async () => ({
      ContentLength: 5 * 1024 * 1024 + 1,
      Body: { destroy: () => { streamDestroyed = true } },
    }),
  } as unknown as S3Client
  const store = createPrivateUploadStore(storageEnv, client)

  await assert.rejects(
    () => store.get('private/user/oversized.png'),
    /Stored upload exceeds the allowed size/
  )
  assert.equal(streamDestroyed, true)
})

test('S3 adapter returns streamed object bytes when they fit the upload limit', async () => {
  const expected = new Uint8Array([7, 8, 9])
  const client = {
    send: async () => ({
      ContentLength: expected.byteLength,
      Body: {
        async *[Symbol.asyncIterator]() { yield expected.subarray(0, 2); yield expected.subarray(2) },
      },
    }),
  } as unknown as S3Client
  const store = createPrivateUploadStore(storageEnv, client)

  assert.deepEqual(await store.get('private/user/file.png'), expected)
})
