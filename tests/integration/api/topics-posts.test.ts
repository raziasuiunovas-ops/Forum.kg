import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'

// All DB delegates are local stubs. These tests never construct PrismaClient
// and cannot connect to a development or production database.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = ''
process.env.DIRECT_URL = ''
process.env.JWT_SECRET = 'topics-posts-test-access-secret'
process.env.JWT_REFRESH_SECRET = 'topics-posts-test-refresh-secret'

const prisma: any = {
  topicCategory: {
    findMany: async () => [],
    findFirst: async () => null,
    create: async () => null,
  },
  topic: {
    findMany: async () => [],
    findFirst: async () => null,
    count: async () => 0,
    create: async () => null,
    updateMany: async () => ({ count: 0 }),
    update: async () => null,
  },
  post: {
    findMany: async () => [],
    findFirst: async () => null,
    count: async () => 0,
    create: async () => null,
    updateMany: async () => ({ count: 0 }),
  },
}
prisma.$transaction = async (operation: (tx: any) => Promise<unknown>) => operation(prisma)

const moduleLoader = require('node:module') as any
const originalLoad = moduleLoader._load
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/db') return { prisma, default: prisma }
  return originalLoad.call(this, request, parent, isMain)
}

const auth = require('../../../lib/auth/middleware') as typeof import('../../../lib/auth/middleware')
const categoriesRoute = require('../../../app/api/v1/topics/categories/route') as typeof import('../../../app/api/v1/topics/categories/route')
const topicsRoute = require('../../../app/api/v1/topics/route') as typeof import('../../../app/api/v1/topics/route')
const topicRoute = require('../../../app/api/v1/topics/[id]/route') as typeof import('../../../app/api/v1/topics/[id]/route')
const repliesRoute = require('../../../app/api/v1/topics/[id]/replies/route') as typeof import('../../../app/api/v1/topics/[id]/replies/route')
const replyRoute = require('../../../app/api/v1/replies/[id]/route') as typeof import('../../../app/api/v1/replies/[id]/route')
moduleLoader._load = originalLoad

const USER_ID = '9f6a5d17-a1b8-47c1-9a2f-d223e4b4da19'
const OTHER_USER_ID = '207d88cb-9f36-4bc2-8b5b-f6c3a5c4e120'
const CATEGORY_ID = 'a5c2cc60-2820-43df-9ca9-a90e7a5aabb3'
const TOPIC_ID = 'b346ebef-57ad-4773-8754-81d79cc8886c'
const POST_ID = 'c1ff98b1-0243-4d78-a3f1-1e0f848fbac9'
const PARENT_ID = 'dba88c33-a66e-44dd-9b24-a8a49688ef39'

const topic = {
  id: TOPIC_ID,
  categoryId: CATEGORY_ID,
  title: { ru: 'Тема', ky: 'Тема', en: 'Topic' },
  content: { ru: 'Содержание', ky: 'Мазмун', en: 'Content' },
  tags: ['forum'],
  isPinned: false,
  isLocked: false,
  viewCount: 10,
  replyCount: 2,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  category: { id: CATEGORY_ID, slug: 'general', name: { ru: 'Общее' } },
  author: { id: USER_ID, firstName: 'Айжан', lastName: 'Осмонова' },
}

const reply = {
  id: POST_ID,
  topicId: TOPIC_ID,
  parentId: null,
  content: { ru: 'Ответ', ky: 'Жооп', en: 'Reply' },
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  author: { id: USER_ID, firstName: 'Айжан', lastName: 'Осмонова' },
}

function authenticatedUser(userId = USER_ID, role = 'USER') {
  return { user: { userId, role, status: 'ACTIVE' } }
}

function request(path: string, method = 'GET', body?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  })
}

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function authAs(t: any, userId = USER_ID, role = 'USER') {
  t.mock.method(auth, 'requireAuth', async () => authenticatedUser(userId, role))
}

test('GET topics applies filters and pagination and returns only public author fields', async (t) => {
  let findArgs: any
  t.mock.method(prisma.topic, 'findMany', async (args: any) => {
    findArgs = args
    return [topic]
  })
  t.mock.method(prisma.topic, 'count', async () => 11)

  const response = await topicsRoute.GET(request('/api/v1/topics?page=2&limit=5&isPinned=false&tag=forum'))
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(findArgs.skip, 5)
  assert.equal(findArgs.take, 5)
  assert.equal(findArgs.where.isPinned, false)
  assert.deepEqual(findArgs.where.tags, { has: 'forum' })
  assert.equal(body.pagination.totalPages, 3)
  assert.equal('phone' in body.topics[0].author, false)
  assert.equal('email' in body.topics[0].author, false)
})

test('GET topic increments views and returns a single public topic', async (t) => {
  let incrementArgs: any
  t.mock.method(prisma.topic, 'updateMany', async (args: any) => {
    incrementArgs = args
    return { count: 1 }
  })
  t.mock.method(prisma.topic, 'findFirst', async () => topic)

  const response = await topicRoute.GET(request(`/api/v1/topics/${TOPIC_ID}`), params(TOPIC_ID))
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.deepEqual(incrementArgs.data, { viewCount: { increment: 1 } })
  assert.equal(body.topic.author.id, USER_ID)
  assert.equal('phone' in body.topic.author, false)
})

test('GET topic returns 404 when the topic does not exist', async (t) => {
  t.mock.method(prisma.topic, 'updateMany', async () => ({ count: 0 }))

  const response = await topicRoute.GET(request(`/api/v1/topics/${TOPIC_ID}`), params(TOPIC_ID))
  assert.equal(response.status, 404)
})

test('POST topic creates it for the authenticated author with an existing category', async (t) => {
  authAs(t)
  t.mock.method(prisma.topicCategory, 'findFirst', async () => ({ id: CATEGORY_ID }))
  let createArgs: any
  t.mock.method(prisma.topic, 'create', async (args: any) => {
    createArgs = args
    return topic
  })

  const response = await topicsRoute.POST(request('/api/v1/topics', 'POST', JSON.stringify({
    categoryId: CATEGORY_ID,
    title: { ru: 'Тема' },
    content: { ru: 'Содержание' },
    tags: ['forum'],
  })))

  assert.equal(response.status, 201)
  assert.equal(createArgs.data.authorId, USER_ID)
  assert.equal(createArgs.data.categoryId, CATEGORY_ID)
  assert.equal(createArgs.data.isPinned, false)
  assert.equal(createArgs.data.isLocked, false)
})

test('POST topic rejects missing authentication and skips database writes', async (t) => {
  t.mock.method(auth, 'requireAuth', async () => NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  let writes = 0
  t.mock.method(prisma.topic, 'create', async () => {
    writes += 1
    return topic
  })

  const response = await topicsRoute.POST(request('/api/v1/topics', 'POST', JSON.stringify({
    categoryId: CATEGORY_ID,
    title: { ru: 'Тема' },
    content: { ru: 'Содержание' },
  })))

  assert.equal(response.status, 401)
  assert.equal(writes, 0)
})

test('POST topic rejects moderatorship fields from regular users', async (t) => {
  authAs(t)
  let writes = 0
  t.mock.method(prisma.topic, 'create', async () => {
    writes += 1
    return topic
  })

  const response = await topicsRoute.POST(request('/api/v1/topics', 'POST', JSON.stringify({
    categoryId: CATEGORY_ID,
    title: { ru: 'Тема' },
    content: { ru: 'Содержание' },
    isPinned: true,
  })))

  assert.equal(response.status, 403)
  assert.equal(writes, 0)
})

test('POST topic rejects unknown fields and malformed JSON', async (t) => {
  authAs(t)
  const unknown = await topicsRoute.POST(request('/api/v1/topics', 'POST', JSON.stringify({
    categoryId: CATEGORY_ID,
    title: { ru: 'Тема' },
    content: { ru: 'Содержание' },
    role: 'SUPER_ADMIN',
  })))
  const malformed = await topicsRoute.POST(request('/api/v1/topics', 'POST', '{ invalid'))
  const empty = await topicsRoute.POST(request('/api/v1/topics', 'POST', ''))
  const invalidType = await topicsRoute.POST(request('/api/v1/topics', 'POST', JSON.stringify({
    categoryId: CATEGORY_ID,
    title: 7,
    content: { ru: 'Содержание' },
  })))

  assert.equal(unknown.status, 422)
  assert.equal(malformed.status, 422)
  assert.equal(empty.status, 422)
  assert.equal(invalidType.status, 422)
})

test('POST topic returns 404 when its category does not exist or is inactive', async (t) => {
  authAs(t)
  t.mock.method(prisma.topicCategory, 'findFirst', async () => null)

  const response = await topicsRoute.POST(request('/api/v1/topics', 'POST', JSON.stringify({
    categoryId: CATEGORY_ID,
    title: { ru: 'Тема' },
    content: { ru: 'Содержание' },
  })))

  assert.equal(response.status, 404)
})

test('PATCH topic lets its owner edit content but not moderation fields', async (t) => {
  authAs(t)
  let findCalls = 0
  t.mock.method(prisma.topic, 'findFirst', async () => {
    findCalls += 1
    return findCalls === 1 ? { id: TOPIC_ID, authorId: USER_ID } : topic
  })
  let updateArgs: any
  t.mock.method(prisma.topic, 'updateMany', async (args: any) => {
    updateArgs = args
    return { count: 1 }
  })

  const response = await topicRoute.PATCH(request(`/api/v1/topics/${TOPIC_ID}`, 'PATCH', JSON.stringify({
    title: { ru: 'Новое название' },
  })), params(TOPIC_ID))

  assert.equal(response.status, 200)
  assert.equal(updateArgs.where.authorId, USER_ID)
  assert.deepEqual(updateArgs.data.title, { ru: 'Новое название' })
})

test('PATCH topic denies editing another author topic', async (t) => {
  authAs(t)
  t.mock.method(prisma.topic, 'findFirst', async () => ({ id: TOPIC_ID, authorId: OTHER_USER_ID }))
  let updates = 0
  t.mock.method(prisma.topic, 'updateMany', async () => {
    updates += 1
    return { count: 1 }
  })

  const response = await topicRoute.PATCH(request(`/api/v1/topics/${TOPIC_ID}`, 'PATCH', JSON.stringify({
    title: { ru: 'Не мое' },
  })), params(TOPIC_ID))

  assert.equal(response.status, 403)
  assert.equal(updates, 0)
})

test('PATCH topic allows a manager to edit and lock another author topic', async (t) => {
  authAs(t, USER_ID, 'MANAGER')
  let findCalls = 0
  t.mock.method(prisma.topic, 'findFirst', async () => {
    findCalls += 1
    return findCalls === 1 ? { id: TOPIC_ID, authorId: OTHER_USER_ID } : { ...topic, isLocked: true }
  })
  let updateArgs: any
  t.mock.method(prisma.topic, 'updateMany', async (args: any) => {
    updateArgs = args
    return { count: 1 }
  })

  const response = await topicRoute.PATCH(request(`/api/v1/topics/${TOPIC_ID}`, 'PATCH', JSON.stringify({
    isLocked: true,
  })), params(TOPIC_ID))

  assert.equal(response.status, 200)
  assert.equal(updateArgs.where.authorId, undefined)
  assert.equal(updateArgs.data.isLocked, true)
})

test('DELETE topic soft-deletes only the owner topic', async (t) => {
  authAs(t)
  t.mock.method(prisma.topic, 'findFirst', async () => ({ authorId: USER_ID }))
  let updateArgs: any
  t.mock.method(prisma.topic, 'updateMany', async (args: any) => {
    updateArgs = args
    return { count: 1 }
  })

  const response = await topicRoute.DELETE(request(`/api/v1/topics/${TOPIC_ID}`, 'DELETE'), params(TOPIC_ID))

  assert.equal(response.status, 200)
  assert.equal(updateArgs.where.authorId, USER_ID)
  assert.ok(updateArgs.data.deletedAt instanceof Date)
})

test('GET replies paginates and masks deleted reply content', async (t) => {
  t.mock.method(prisma.topic, 'findFirst', async () => ({ id: TOPIC_ID }))
  let findArgs: any
  t.mock.method(prisma.post, 'findMany', async (args: any) => {
    findArgs = args
    return [reply, { ...reply, id: PARENT_ID, deletedAt: new Date(), content: { ru: 'private deleted content' } }]
  })
  t.mock.method(prisma.post, 'count', async () => 7)

  const response = await repliesRoute.GET(
    request(`/api/v1/topics/${TOPIC_ID}/replies?page=2&limit=3`),
    params(TOPIC_ID)
  )
  const body = await response.json() as any

  assert.equal(response.status, 200)
  assert.equal(findArgs.skip, 3)
  assert.equal(findArgs.take, 3)
  assert.equal(body.pagination.totalPages, 3)
  assert.equal(body.replies[0].author.id, USER_ID)
  assert.equal(body.replies[1].content, null)
  assert.equal(body.replies[1].author, null)
  assert.equal(body.replies[1].isDeleted, true)
})

test('POST reply creates a same-topic reply and increments its counter transactionally', async (t) => {
  authAs(t)
  let transactionOptions: any
  t.mock.method(prisma, '$transaction', async (operation: any, options: any) => {
    transactionOptions = options
    return operation(prisma)
  })
  t.mock.method(prisma.topic, 'findFirst', async () => ({ id: TOPIC_ID, isLocked: false }))
  t.mock.method(prisma.post, 'findFirst', async () => ({ id: PARENT_ID }))
  t.mock.method(prisma.post, 'create', async () => reply)
  let countUpdate: any
  t.mock.method(prisma.topic, 'updateMany', async (args: any) => {
    countUpdate = args
    return { count: 1 }
  })

  const response = await repliesRoute.POST(
    request(`/api/v1/topics/${TOPIC_ID}/replies`, 'POST', JSON.stringify({
      content: { ru: 'Ответ' }, parentId: PARENT_ID,
    })),
    params(TOPIC_ID)
  )

  assert.equal(response.status, 201)
  assert.equal(transactionOptions.isolationLevel, 'Serializable')
  assert.deepEqual(countUpdate.data, { replyCount: { increment: 1 } })
})

test('POST reply rejects locked topics and parents from another topic', async (t) => {
  authAs(t)
  t.mock.method(prisma, '$transaction', async (operation: any) => operation(prisma))
  let locked = true
  t.mock.method(prisma.topic, 'findFirst', async () => ({ id: TOPIC_ID, isLocked: locked }))
  t.mock.method(prisma.post, 'findFirst', async () => null)
  let creates = 0
  t.mock.method(prisma.post, 'create', async () => {
    creates += 1
    return reply
  })
  const body = JSON.stringify({ content: { ru: 'Ответ' }, parentId: PARENT_ID })

  const lockedResponse = await repliesRoute.POST(
    request(`/api/v1/topics/${TOPIC_ID}/replies`, 'POST', body),
    params(TOPIC_ID)
  )
  locked = false
  const parentResponse = await repliesRoute.POST(
    request(`/api/v1/topics/${TOPIC_ID}/replies`, 'POST', body),
    params(TOPIC_ID)
  )

  assert.equal(lockedResponse.status, 409)
  assert.equal(parentResponse.status, 422)
  assert.equal(creates, 0)
})

test('PATCH reply allows its author and denies another user', async (t) => {
  let currentUserId = USER_ID
  t.mock.method(auth, 'requireAuth', async () => authenticatedUser(currentUserId))
  let findCalls = 0
  t.mock.method(prisma.post, 'findFirst', async () => {
    findCalls += 1
    return findCalls % 2 === 1
      ? { id: POST_ID, authorId: USER_ID }
      : { ...reply, authorId: USER_ID }
  })
  let updateArgs: any
  let updates = 0
  t.mock.method(prisma.post, 'updateMany', async (args: any) => {
    updateArgs = args
    updates += 1
    return { count: 1 }
  })
  const allowed = await replyRoute.PATCH(request(`/api/v1/replies/${POST_ID}`, 'PATCH', JSON.stringify({
    content: { ru: 'Изменённый ответ' },
  })), params(POST_ID))
  currentUserId = OTHER_USER_ID
  const denied = await replyRoute.PATCH(request(`/api/v1/replies/${POST_ID}`, 'PATCH', JSON.stringify({
    content: { ru: 'Чужой ответ' },
  })), params(POST_ID))

  assert.equal(allowed.status, 200)
  assert.equal(updateArgs.where.authorId, USER_ID)
  assert.equal(denied.status, 403)
  assert.equal(updates, 1)
})

test('PATCH reply permits a manager to edit another author reply', async (t) => {
  authAs(t, USER_ID, 'MANAGER')
  let calls = 0
  t.mock.method(prisma.post, 'findFirst', async () => {
    calls += 1
    return calls === 1 ? { id: POST_ID, authorId: OTHER_USER_ID } : reply
  })
  let updateArgs: any
  t.mock.method(prisma.post, 'updateMany', async (args: any) => {
    updateArgs = args
    return { count: 1 }
  })

  const response = await replyRoute.PATCH(request(`/api/v1/replies/${POST_ID}`, 'PATCH', JSON.stringify({
    content: { ru: 'Исправлено модератором' },
  })), params(POST_ID))

  assert.equal(response.status, 200)
  assert.equal(updateArgs.where.authorId, undefined)
})

test('DELETE reply soft-deletes own reply and decrements the topic count atomically', async (t) => {
  authAs(t)
  t.mock.method(prisma.post, 'findFirst', async () => ({ authorId: USER_ID, topicId: TOPIC_ID }))
  let transactionOptions: any
  t.mock.method(prisma, '$transaction', async (operation: any, options: any) => {
    transactionOptions = options
    return operation(prisma)
  })
  let postUpdate: any
  t.mock.method(prisma.post, 'updateMany', async (args: any) => {
    postUpdate = args
    return { count: 1 }
  })
  let topicUpdate: any
  t.mock.method(prisma.topic, 'updateMany', async (args: any) => {
    topicUpdate = args
    return { count: 1 }
  })

  const response = await replyRoute.DELETE(request(`/api/v1/replies/${POST_ID}`, 'DELETE'), params(POST_ID))

  assert.equal(response.status, 200)
  assert.equal(transactionOptions.isolationLevel, 'Serializable')
  assert.equal(postUpdate.where.authorId, USER_ID)
  assert.ok(postUpdate.data.deletedAt instanceof Date)
  assert.deepEqual(topicUpdate.data, { replyCount: { decrement: 1 } })
})

test('reply endpoints require authentication and return 404 for missing IDs', async (t) => {
  let authorized = false
  t.mock.method(auth, 'requireAuth', async () => authorized
    ? authenticatedUser()
    : NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }))
  const unauthorized = await repliesRoute.POST(
    request(`/api/v1/topics/${TOPIC_ID}/replies`, 'POST', JSON.stringify({ content: { ru: 'Ответ' } })),
    params(TOPIC_ID)
  )
  assert.equal(unauthorized.status, 401)

  authorized = true
  t.mock.method(prisma.post, 'findFirst', async () => null)
  const missing = await replyRoute.PATCH(
    request(`/api/v1/replies/${POST_ID}`, 'PATCH', JSON.stringify({ content: { ru: 'Изменение' } })),
    params(POST_ID)
  )
  assert.equal(missing.status, 404)
})

test('reply validation rejects unknown fields and malformed JSON', async (t) => {
  authAs(t)
  const unknown = await repliesRoute.POST(
    request(`/api/v1/topics/${TOPIC_ID}/replies`, 'POST', JSON.stringify({
      content: { ru: 'Ответ' }, isPinned: true,
    })),
    params(TOPIC_ID)
  )
  const malformed = await repliesRoute.POST(
    request(`/api/v1/topics/${TOPIC_ID}/replies`, 'POST', '{ invalid'),
    params(TOPIC_ID)
  )
  const empty = await repliesRoute.POST(
    request(`/api/v1/topics/${TOPIC_ID}/replies`, 'POST', ''),
    params(TOPIC_ID)
  )
  assert.equal(unknown.status, 422)
  assert.equal(malformed.status, 422)
  assert.equal(empty.status, 422)
})

test('GET categories returns only active public category fields', async (t) => {
  let query: any
  t.mock.method(prisma.topicCategory, 'findMany', async (args: any) => {
    query = args
    return [{ id: CATEGORY_ID, slug: 'general', name: { ru: 'Общее' }, sortOrder: 0 }]
  })

  const response = await categoriesRoute.GET()
  const body = await response.json() as any
  assert.equal(response.status, 200)
  assert.deepEqual(query.where, { isActive: true })
  assert.equal('isActive' in body.categories[0], false)
  assert.equal('internalNotes' in body.categories[0], false)
})

test('POST category allows managers to provision a public discussion category', async (t) => {
  t.mock.method(auth, 'requireManager', async () => authenticatedUser(USER_ID, 'MANAGER'))
  let createArgs: any
  t.mock.method(prisma.topicCategory, 'create', async (args: any) => {
    createArgs = args
    return { id: CATEGORY_ID, slug: 'general', name: { ru: 'Общее' }, sortOrder: 0 }
  })

  const response = await categoriesRoute.POST(request('/api/v1/topics/categories', 'POST', JSON.stringify({
    slug: 'general',
    name: { ru: 'Общее' },
  })))
  const body = await response.json() as any

  assert.equal(response.status, 201)
  assert.equal(createArgs.data.slug, 'general')
  assert.equal(body.category.slug, 'general')
})

test('POST category denies category provisioning to regular users', async (t) => {
  t.mock.method(auth, 'requireManager', async () =>
    NextResponse.json({ error: { code: 'INSUFFICIENT_PERMISSIONS' } }, { status: 403 }))
  let writes = 0
  t.mock.method(prisma.topicCategory, 'create', async () => {
    writes += 1
    return null
  })

  const response = await categoriesRoute.POST(request('/api/v1/topics/categories', 'POST', JSON.stringify({
    slug: 'general',
    name: { ru: 'Общее' },
  })))

  assert.equal(response.status, 403)
  assert.equal(writes, 0)
})
