const CACHE = 'ale-v11'; // bump on every content/app update
// Every ES module the app boots from must be precached. Without them the
// activate step (which deletes the previous cache) could leave the app
// unbootable offline if the network drops before the modules are fetched.
// Keep this list in step with js/ — addAll() rejects wholesale on a 404.
const CORE = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js',
  './js/router.js',
  './js/ui.js',
  './js/shell.js',
  './js/core/content.js',
  './js/core/format.js',
  './js/core/merge.js',
  './js/core/picker.js',
  './js/core/progress.js',
  './js/core/srs.js',
  './js/core/stats.js',
  './js/core/store.js',
  './js/edit/editor.js',
  './js/edit/github.js',
  './js/edit/overlay.js',
  './js/edit/serialize.js',
  './js/edit/sessions.js',
  './js/views/analysis.js',
  './js/views/chaptertest.js',
  './js/views/course.js',
  './js/views/dashboard.js',
  './js/views/exam.js',
  './js/views/flashcards.js',
  './js/views/quiz.js',
  './js/views/settings.js',
  './js/views/topic.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
