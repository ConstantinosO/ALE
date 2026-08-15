// tests/editor.test.js
// Covers the non-DOM half of js/edit/editor.js: retryPendingAll's storage
// discipline (never write back a pre-await snapshot).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryPendingAll } from '../js/edit/editor.js';
import { EDITS_KEY } from '../js/edit/overlay.js';
import { b64EncodeUtf8, serializeContent } from '../js/edit/github.js';

function memStorage(init = {}) {
  const m = { ...init };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _read: () => JSON.parse(m[EDITS_KEY]),
    _write: (d) => { m[EDITS_KEY] = JSON.stringify(d); },
  };
}

function contentFixture() {
  return { courseId: 'kz', chapters: [{ id: 'c1', title: 'Κ', topics: [
    { id: 't1', title: 'Θ', summary: 'παλιό', keyDefinitions: [], killerFacts: ['φ0'],
      commonTraps: [], mcq: [], shortAnswers: [], flashcards: [], examQuestion: null },
  ] }] };
}

// A fetch stub whose GET runs `onGet` first — the hook stands in for anything
// that writes to localStorage while the network round-trip is in flight.
function hookedFetch(onGet) {
  return async (url, opts = {}) => {
    if (opts.method === 'PUT') return { ok: true, status: 200, json: async () => ({}) };
    if (onGet) await onGet();
    return {
      ok: true,
      status: 200,
      json: async () => ({ sha: 'sha1', content: b64EncodeUtf8(serializeContent(contentFixture())) }),
    };
  };
}

function storeWith(edits) {
  return { token: 'TOKEN', edits: { kz: edits } };
}

test('retryPendingAll marks the sent entries committed', async () => {
  const s = memStorage();
  s._write(storeWith({ t1: { summary: { text: 'νέο', base: 'παλιό', committed: false } } }));
  const r = await retryPendingAll(s, hookedFetch());
  assert.equal(r.retried, 1);
  assert.equal(s._read().edits.kz.t1.summary.committed, true);
});

test('retryPendingAll does not clobber an edit saved during the await', async () => {
  const s = memStorage();
  s._write(storeWith({ t1: { summary: { text: 'νέο', base: 'παλιό', committed: false } } }));
  // Mid-flight, the save handler stores a brand new edit for another field.
  const onGet = async () => {
    const live = s._read();
    live.edits.kz.t1['killerFacts.0'] = { text: 'φρέσκο', base: 'φ0', committed: false };
    s._write(live);
  };
  await retryPendingAll(s, hookedFetch(onGet));
  const after = s._read().edits.kz.t1;
  assert.equal(after.summary.committed, true);            // what we sent, marked
  assert.ok(after['killerFacts.0'], 'concurrent edit must survive');
  assert.equal(after['killerFacts.0'].text, 'φρέσκο');
  assert.equal(after['killerFacts.0'].committed, false);  // never sent, still pending
});

test('retryPendingAll does not mark an entry whose text changed during the await', async () => {
  const s = memStorage();
  s._write(storeWith({ t1: { summary: { text: 'νέο', base: 'παλιό', committed: false } } }));
  const onGet = async () => {
    const live = s._read();
    live.edits.kz.t1.summary = { text: 'νεότερο', base: 'παλιό', committed: false };
    s._write(live);
  };
  const r = await retryPendingAll(s, hookedFetch(onGet));
  assert.equal(r.retried, 0);
  assert.equal(s._read().edits.kz.t1.summary.text, 'νεότερο');
  assert.equal(s._read().edits.kz.t1.summary.committed, false);
});

test('retryPendingAll does not resurrect entries pruned during the await', async () => {
  const s = memStorage();
  s._write(storeWith({ t1: { summary: { text: 'νέο', base: 'παλιό', committed: false } } }));
  const onGet = async () => { s._write({ token: 'TOKEN', edits: {} }); }; // getContent pruned
  await retryPendingAll(s, hookedFetch(onGet));
  assert.deepEqual(s._read().edits, {}, 'pruned entries must stay pruned');
});

test('retryPendingAll does not restore a token removed during the await', async () => {
  const s = memStorage();
  s._write(storeWith({ t1: { summary: { text: 'νέο', base: 'παλιό', committed: false } } }));
  const onGet = async () => {
    const live = s._read();
    live.token = '';
    s._write(live);
  };
  await retryPendingAll(s, hookedFetch(onGet));
  assert.equal(s._read().token, '', 'removed token must stay removed');
});

test('retryPendingAll is a no-op without a token', async () => {
  const s = memStorage();
  s._write({ token: '', edits: { kz: { t1: { summary: { text: 'ν', committed: false } } } } });
  let called = false;
  const r = await retryPendingAll(s, async () => { called = true; });
  assert.deepEqual(r, { retried: 0 });
  assert.equal(called, false);
});
