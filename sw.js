// 담담 - Service Worker
// 공유 수신 전용 안정화 버전

const SHARE_DATA_CACHE  = 'damdam-share-data';
const SHARE_FILES_CACHE = 'damdam-share-files';

const SHARE_DATA_KEY = new URL('__damdam_share_pending__', self.registration.scope).href;

function shareFileKey(i) {
  return new URL(`__damdam_share_file_${i}__`, self.registration.scope).href;
}

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const path = url.pathname.replace(/\/+$/, '');

  // Web Share Target: manifest의 action "./share"가 여기로 들어옴
  if (path.endsWith('/share') && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // 혹시 GET으로 /share가 열렸을 때도 저장 화면으로 보냄
  if (path.endsWith('/share') && event.request.method === 'GET') {
    event.respondWith(Response.redirect(new URL('./share.html', self.registration.scope).href, 303));
    return;
  }

  // 나머지는 브라우저 기본 처리
});

async function handleShareTarget(request) {
  const formData = await request.formData();

  const rawTitle = formData.get('title') || '';
  const rawText  = formData.get('text')  || '';
  let rawUrl     = formData.get('url')   || '';

  // 일부 앱은 url 필드가 아니라 text에 링크를 넣어서 공유함
  if (!rawUrl && rawText) {
    const m = String(rawText).match(/https?:\/\/[^\s]+/);
    if (m) rawUrl = m[0];
  }

  const shareData = {
    title: String(rawTitle || ''),
    text: String(rawText || ''),
    url: String(rawUrl || ''),
    timestamp: Date.now(),
    type: 'memo'
  };

  const files = formData
    .getAll('images')
    .filter(f => f instanceof File && f.size > 0);

  if (files.length > 0) {
    shareData.type = 'image';
    shareData.fileCount = files.length;

    const fileCache = await caches.open(SHARE_FILES_CACHE);
    const oldKeys = await fileCache.keys();
    await Promise.all(oldKeys.map(k => fileCache.delete(k)));

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const buf = await f.arrayBuffer();

      await fileCache.put(
        shareFileKey(i),
        new Response(buf, {
          headers: {
            'Content-Type': f.type || 'image/jpeg',
            'X-File-Name': encodeURIComponent(f.name || `image_${i}.jpg`)
          }
        })
      );
    }
  } else if (shareData.url) {
    shareData.type = 'link';
  } else {
    shareData.type = 'memo';
  }

  const dataCache = await caches.open(SHARE_DATA_CACHE);
  await dataCache.put(
    SHARE_DATA_KEY,
    new Response(JSON.stringify(shareData), {
      headers: { 'Content-Type': 'application/json' }
    })
  );

  return Response.redirect(new URL('./share.html', self.registration.scope).href, 303);
}
