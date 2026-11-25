// Forum.kg Service Worker — PWA + Web Push notifications
const CACHE_NAME = 'forum-kg-v1'
const OFFLINE_URL = '/ru'

// Files to cache for offline
const PRECACHE = [
  '/ru',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  clients.claim()
})

self.addEventListener('fetch', (event) => {
  // Skip non-GET and API requests — always fetch fresh
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('/api/')) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        // Cache successful HTML/CSS/JS responses
        if (response.ok && (
          event.request.destination === 'document' ||
          event.request.destination === 'script' ||
          event.request.destination === 'style' ||
          event.request.destination === 'image'
        )) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      }).catch(() => cached || caches.match(OFFLINE_URL))

      // Return cached first (fast), update in background
      return cached || networkFetch
    })
  )
})

// ── Push notifications ──

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data = { title: 'FORUM.KG', body: 'Новое уведомление', icon: '/icons/icon-192.png', url: '/ru' }
  try {
    data = { ...data, ...event.data.json() }
  } catch {
    data.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/ru' },
      vibrate: [100, 50, 100],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/ru'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
