// 담담 - Service Worker
// 공유 대상 수신 + PWA 오프라인 지원

const SHARE_DATA_CACHE  = 'damdam-share-data';
const SHARE_FILES_CACHE = 'damdam-share-files';
const APP_CACHE         = 'damdam-app-v1';

const APP_SHELL = [
  './',
  './index.html',
  './share.html',
  './manifest.json'
];

// ─── 설치 ─────────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

// ─── 활성화 ───────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// ─── fetch 인터셉트 ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 공유 대상 POST 수신
  if (url.pathname.endsWith('/share') && request.method === 'POST') {
    event.respondWith(handleShareTarget(request, url));
    return;
  }

  // 앱 파일은 캐시 우선
  if (APP_SHELL.some(path => url.pathname.endsWith(path.replace('./', '/')))) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
    return;
  }

  // 나머지는 네트워크 우선
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// ─── 공유 수신 처리 ────────────────────────────────────────────────────────────
async function handleShareTarget(request, url) {
  const formData = await request.formData();

  const shareData = {
    title:     formData.get('title') || '',
    text:      formData.get('text')  || '',
    url:       formData.get('url')   || '',
    timestamp: Date.now(),
    type:      'link'
  };

  // 파일(이미지) 처리
  const files = formData.getAll('images').filter(f => f instanceof File && f.size > 0);

  if (files.length > 0) {
    shareData.type      = 'image';
    shareData.fileCount = files.length;

    // 기존 캐시 초기화
    const fileCache = await caches.open(SHARE_FILES_CACHE);
    const oldKeys   = await fileCache.keys();
    await Promise.all(oldKeys.map(k => fileCache.delete(k)));

    // 파일 캐시에 저장
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

  // 공유 데이터 저장
  const dataCache = await caches.open(SHARE_DATA_CACHE);
  await dataCache.put('pending', new Response(JSON.stringify(shareData)));

  // share.html로 리다이렉트
  const redirectUrl = url.origin + url.pathname.replace(/\/share$/, '/share.html');
  return Response.redirect(redirectUrl, 303);
}
