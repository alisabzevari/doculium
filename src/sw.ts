/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname.includes('/share')) {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const fileField = formData.get('file');
    if (!fileField || !(fileField instanceof File)) {
      return Response.redirect('./?shareError=invalid', 303);
    }

    const id = crypto.randomUUID();
    const cache = await caches.open('shared-files');
    const headers = new Headers({
      'content-type': fileField.type || 'application/octet-stream',
      'x-file-name': encodeURIComponent(fileField.name),
    });
    await cache.put(id, new Response(fileField, { headers }));

    return Response.redirect(`./share/${id}`, 303);
  } catch {
    return Response.redirect('./?shareError=failed', 303);
  }
}
