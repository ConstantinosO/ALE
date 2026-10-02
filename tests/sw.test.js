// tests/sw.test.js
// sw.js can't be imported (it needs `self`), so read it as text. The point of
// this test is drift: a new module that never reaches CORE leaves the app
// unbootable offline after the activate step wipes the previous cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const CORE = [...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);

function allJs(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) allJs(rel, out);
    else if (e.name.endsWith('.js')) out.push(`./${rel.split(sep).join('/')}`);
  }
  return out;
}

test('every app JS module is precached in CORE', () => {
  const missing = allJs('js').filter((f) => !CORE.includes(f));
  assert.deepEqual(missing, [], `add these to CORE in sw.js: ${missing.join(', ')}`);
});

test('CORE lists no JS file that does not exist', () => {
  const onDisk = new Set(allJs('js'));
  const ghosts = CORE.filter((f) => f.startsWith('./js/') && !onDisk.has(f));
  assert.deepEqual(ghosts, [], 'addAll() rejects wholesale on a 404');
});

test('CORE still covers the shell and keeps the ale-v29 cache name', () => {
  for (const f of ['./', './index.html', './css/app.css', './manifest.webmanifest']) {
    assert.ok(CORE.includes(f), f);
  }
  assert.ok(/const CACHE = 'ale-v29'/.test(sw));
});

// Pages sends max-age=600; without these the worker served (and even
// precached) copies up to ten minutes stale after a deploy.
test('the worker bypasses the HTTP cache when precaching and revalidates at runtime', () => {
  const sw = readFileSync('sw.js', 'utf8');
  assert.match(sw, /new Request\(u, \{ cache: 'reload' \}\)/);
  assert.match(sw, /cache: 'no-cache'/);
  assert.match(sw, /mode === 'navigate'/);
});
