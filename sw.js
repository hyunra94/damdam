// 담담 - Service Worker
// 공유 수신 안정화 버전
// GitHub Pages는 POST를 처리할 수 없으므로, Web Share Target POST는 반드시 여기서 가로챕니다.

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

  // manifest.json의 share_target.action이 ./share.html 이므로 share.html POST를 처리
  if (path.endsWith('/share.html') && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // 예전 manifest가 ./share를 보고 있을 수 있어서 구버전 경로도 같이 처리
  if (path.endsWith('/share') && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // /share를 주소창으로 직접 열었거나 구버전 manifest가 GET으로 접근한 경우
  if (path.endsWith('/share') && event.request.method === 'GET') {
    event.respondWith(Response.redirect(new URL('./share.html', self.registration.scope).href, 303));
    return;
  }

  // 나머지 요청은 브라우저 기본 처리
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();

    const rawTitle = formData.get('title') || '';
    const rawText  = formData.get('text')  || '';
    let rawUrl     = formData.get('url')   || '';

    // 일부 앱은 url 필드가 아니라 text 필드에 링크를 넣어 공유함
    if (!rawUrl && rawText) {
      const matchedUrl = String(rawText).match(/https?:\/\/[^\s]+/);
      if (matchedUrl) rawUrl = matchedUrl[0];
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
        const file = files[i];
        const buffer = await file.arrayBuffer();

        await fileCache.put(
          shareFileKey(i),
          new Response(buffer, {
            headers: {
              'Content-Type': file.type || 'image/jpeg',
              'X-File-Name': encodeURIComponent(file.name || `image_${i}.jpg`)
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
  } catch (error) {
    const fallbackUrl = new URL('./share.html?share_error=1', self.registration.scope).href;
    return Response.redirect(fallbackUrl, 303);
  }
}
