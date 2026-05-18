// 담담 - Service Worker

const SHARE_DATA_CACHE  = 'damdam-share-data';
const SHARE_FILES_CACHE = 'damdam-share-files';
const APP_CACHE         = 'damdam-app-v2'; // 버전 올려서 강제 갱신

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  // 이전 캐시 삭제
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k.startsWith('damdam-app-') && k !== APP_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 공유 대상 POST 수신
  if (url.pathname.endsWith('/share') && request.method === 'POST') {
    event.respondWith(handleShareTarget(request, url));
    return;
  }

  // 앱 HTML/JS/JSON 파일 → 네트워크 우선 (항상 최신 버전)
  const isAppFile = url.hostname === self.location.hostname;
  if (isAppFile && request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then(res => {
          // 성공하면 캐시에도 저장
          const clone = res.clone();
          caches.open(APP_CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request)) // 오프라인이면 캐시 사용
    );
    return;
  }

  // 외부 요청(Worker API 등)은 그냥 통과
  event.respondWith(fetch(request));
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
