// 담담 - Service Worker (최소화 버전)
// 공유 수신만 처리, 나머지는 브라우저에 완전히 위임

const SHARE_DATA_CACHE  = 'damdam-share-data';
const SHARE_FILES_CACHE = 'damdam-share-files';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 공유 수신 POST만 처리 — 그 외 모든 요청은 완전히 건드리지 않음
  if (url.pathname.endsWith('/share') && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request, url));
  }
  // 나머지: event.respondWith() 안 부름 → 브라우저가 직접 처리
});

async function handleShareTarget(request, url) {
  const formData = await request.formData();

  const shareData = {
    title:     formData.get('title') || '',
    text:      formData.get('text')  || '',
    url:       formData.get('url')   || '',
    timestamp: Date.now(),
    type:      'link'
  };

  const files = formData.getAll('images').filter(f => f instanceof File && f.size > 0);

  if (files.length > 0) {
    shareData.type      = 'image';
    shareData.fileCount = files.length;

    const fileCache = await caches.open(SHARE_FILES_CACHE);
    const oldKeys   = await fileCache.keys();
    await Promise.all(oldKeys.map(k => fileCache.delete(k)));

    for (let i = 0; i < files.length; i++) {
      const f   = files[i];
      const buf = await f.arrayBuffer();
      await fileCache.put(`file-${i}`, new Response(buf, {
        headers: {
          'Content-Type': f.type || 'image/jpeg',
          'X-File-Name':  encodeURIComponent(f.name || `image_${i}.jpg`)
        }
      }));
    }
  } else if (shareData.url) {
    shareData.type = 'link';
  } else {
    shareData.type = 'memo';
  }

  const dataCache = await caches.open(SHARE_DATA_CACHE);
  await dataCache.put('pending', new Response(JSON.stringify(shareData)));

  const redirectUrl = url.origin + url.pathname.replace(/\/share$/, '/share.html');
  return Response.redirect(redirectUrl, 303);
}
