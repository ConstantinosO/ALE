// tests/editor.test.js
// Covers the non-DOM half of js/edit/editor.js: retryPendingAll's storage
// discipline (never write back a pre-await snapshot).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  retryPendingAll, hasOpenEdit, confirmLeaveEdit, discardOpenEdits, restoreRegions,
} from '../js/edit/editor.js';
import { registerSession } from '../js/edit/sessions.js';
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
// `remote` is the canonical file the GET serves.
function hookedFetch(onGet, remote = contentFixture()) {
  return async (url, opts = {}) => {
    if (opts.method === 'PUT') return { ok: true, status: 200, json: async () => ({}) };
    if (onGet) await onGet();
    return {
      ok: true,
      status: 200,
      json: async () => ({ sha: 'sha1', content: b64EncodeUtf8(serializeContent(remote)) }),
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
  assert.deepEqual(r, { retried: 0, conflicts: 0, pending: 1 });
  assert.equal(called, false);
});

// --- I5: the dirty-state guard, its DOM lifetime and its scope -------------

// The registry only ever touches isConnected / contains() / discard(), so
// these stand-ins are the whole DOM it needs.
function node(...kids) {
  const n = {
    isConnected: true,
    kids,
    contains(x) { return x === n || n.kids.some((k) => k.contains(x)); },
  };
  return n;
}

// Registers a session and returns it; every test unregisters in a finally so
// the module-level registry cannot leak between tests.
function openSession({ bar, regions }) {
  const s = { bar, regions, discarded: 0, discard() { s.discarded++; } };
  s.unregister = registerSession(s);
  return s;
}

function withConfirm(answer, fn) {
  const real = globalThis.confirm;
  let asked = 0;
  globalThis.confirm = () => { asked++; return answer; };
  try { return fn(() => asked); } finally {
    if (real) globalThis.confirm = real; else delete globalThis.confirm;
  }
}

test('no open edit session: the guard reports clean and waves navigation through', () => {
  assert.equal(hasOpenEdit(), false);
  withConfirm(false, (asked) => {
    assert.equal(confirmLeaveEdit(), true);
    assert.equal(asked(), 0, 'must not prompt when nothing is being edited');
  });
});

test('a session whose toolbar left the document does not count as open', () => {
  const bar = node();
  const s = openSession({ bar, regions: [node()] });
  try {
    assert.equal(hasOpenEdit(), true);
    bar.isConnected = false; // an unguarded nav link / browser back wiped it
    assert.equal(hasOpenEdit(), false, 'a dead session must not keep prompting');
    discardOpenEdits();
    assert.equal(s.discarded, 0, 'a dead session must not be discarded either');
  } finally { s.unregister(); }
});

test('a session outside the replaced subtree neither prompts nor is discarded', () => {
  // The killerFacts card: open ✏️, typed, and NOT inside #check.
  const region = node();
  const bar = node();
  const elsewhere = node(bar, region);
  const check = node(); // what topic.js is about to rewrite
  const s = openSession({ bar, regions: [region] });
  try {
    assert.equal(hasOpenEdit(check), false);
    withConfirm(true, (asked) => {
      assert.equal(confirmLeaveEdit(check), true, 'navigation proceeds unprompted');
      assert.equal(asked(), 0);
    });
    assert.equal(s.discarded, 0, 'an unrelated live edit must survive intact');
    assert.equal(hasOpenEdit(elsewhere), true, 'and is still open where it lives');
  } finally { s.unregister(); }
});

test('a session inside the replaced subtree prompts and is discarded on yes', () => {
  const region = node();
  const bar = node();
  const check = node(bar, region);
  const s = openSession({ bar, regions: [region] });
  try {
    assert.equal(hasOpenEdit(check), true);
    withConfirm(true, (asked) => {
      assert.equal(confirmLeaveEdit(check), true);
      assert.equal(asked(), 1);
    });
    assert.equal(s.discarded, 1);
  } finally { s.unregister(); }
});

test('declining the prompt blocks navigation and leaves the session open', () => {
  const region = node();
  const bar = node();
  const check = node(bar, region);
  const s = openSession({ bar, regions: [region] });
  try {
    withConfirm(false, () => {
      assert.equal(confirmLeaveEdit(check), false, 'the caller must not advance');
    });
    assert.equal(s.discarded, 0);
    assert.equal(hasOpenEdit(check), true, 'still editing');
  } finally { s.unregister(); }
});

test('a root containing the region but not the toolbar is still in scope', () => {
  // The quiz explanation: the toolbar is a SIBLING of the card, so the card
  // holds the region only — it must still count as about to be destroyed.
  const region = node();
  const card = node(region);
  const bar = node();
  const view = node(bar, card);
  const s = openSession({ bar, regions: [region] });
  try {
    assert.equal(hasOpenEdit(card), true, 'region inside the root is enough');
    assert.equal(hasOpenEdit(view), true, 'and the whole view certainly is');
  } finally { s.unregister(); }
});

test('discarding restores the original rendering instead of leaving typed text', () => {
  // The defect: discard ended the session without putting the region back, so
  // typed text stayed on screen looking saved while nothing was persisted.
  const r = { innerHTML: '<p>ό,τι μόλις πληκτρολόγησα</p>' };
  restoreRegions([r], new Map([[r, '1. πρώτο\n2. δεύτερο']]));
  assert.equal(r.innerHTML, '<ol><li>πρώτο</li><li>δεύτερο</li></ol>');
});

test('restoring an originally-empty region yields empty, not stale markup', () => {
  const r = { innerHTML: '<p>κάτι</p>' };
  restoreRegions([r], new Map([[r, '']]));
  assert.equal(r.innerHTML, '');
});

// --- I2: only the edits that actually applied become committed -------------

test('retryPendingAll leaves a conflicted edit pending, marks the applied one', async () => {
  const s = memStorage();
  s._write(storeWith({ t1: {
    summary: { text: 'νέο', base: 'παλιό', committed: false },              // base matches remote
    'killerFacts.0': { text: 'χ', base: 'ΠΑΛΙΟΤΕΡΟ', committed: false },    // base diverged
  } }));
  const r = await retryPendingAll(s, hookedFetch());
  assert.equal(r.retried, 1);
  assert.equal(r.pending, 1, 'the conflicted edit is still queued');
  const after = s._read().edits.kz.t1;
  assert.equal(after.summary.committed, true);
  assert.equal(after['killerFacts.0'].committed, false, 'a refused edit must not vanish from the queue');
});

test('retryPendingAll leaves an edit pending when its path no longer resolves', async () => {
  const s = memStorage();
  s._write(storeWith({ t1: { 'shortAnswers.4.modelAnswer': { text: 'χ', committed: false } } }));
  const r = await retryPendingAll(s, hookedFetch());
  assert.equal(r.retried, 0);
  assert.equal(r.pending, 1);
  assert.equal(s._read().edits.kz.t1['shortAnswers.4.modelAnswer'].committed, false);
});

test('retryPendingAll stops when the token is removed mid-run', async () => {
  const s = memStorage();
  s._write({ token: 'TOKEN', edits: {
    kz: { t1: { summary: { text: 'νέο', base: 'παλιό', committed: false } } },
    other: { t1: { summary: { text: 'νέο2', base: 'παλιό', committed: false } } },
  } });
  let gets = 0;
  const f = hookedFetch(async () => {
    gets++;
    if (gets === 1) { const live = s._read(); live.token = ''; s._write(live); }
  });
  await retryPendingAll(s, f);
  assert.equal(gets, 1, 'the second course must not push after the token is gone');
  assert.equal(s._read().edits.other.t1.summary.committed, false);
});

test('retryPendingAll picks up a course whose first edit is saved mid-run', async () => {
  const s = memStorage();
  s._write(storeWith({ t1: { summary: { text: 'νέο', base: 'παλιό', committed: false } } }));
  let gets = 0;
  const f = hookedFetch(async () => {
    gets++;
    if (gets === 1) {
      const live = s._read();
      live.edits.late = { t1: { summary: { text: 'αργοπορημένο', base: 'παλιό', committed: false } } };
      s._write(live);
    }
  });
  const r = await retryPendingAll(s, f);
  assert.equal(gets, 2, 'the course list is re-read after the await');
  assert.equal(r.retried, 2);
  assert.equal(s._read().edits.late.t1.summary.committed, true);
});

test('retryPendingAll reports conflicts separately from a dead connection', async () => {
  const s = memStorage();
  s._write(storeWith({ t1: { summary: { text: 'νέο', base: 'ΞΕΠΕΡΑΣΜΕΝΟ', committed: false } } }));
  const r = await retryPendingAll(s, hookedFetch());
  assert.equal(r.retried, 0);
  assert.equal(r.conflicts, 1, 'Settings needs this to avoid blaming the token');
  assert.equal(r.pending, 1);
});

test('retryPendingAll settles an edit the remote already holds, without a PUT', async () => {
  const s = memStorage();
  s._write(storeWith({ t1: { summary: { text: 'παλιό', base: 'παλιό', committed: false } } }));
  let puts = 0;
  const f = hookedFetch();
  const counting = async (url, opts = {}) => { if (opts.method === 'PUT') puts++; return f(url, opts); };
  const r = await retryPendingAll(s, counting);
  assert.equal(r.retried, 1, 'already-deployed text must not stay pending forever');
  assert.equal(r.pending, 0);
  assert.equal(puts, 0, 'no pointless 852 KB PUT');
  assert.equal(s._read().edits.kz.t1.summary.committed, true);
});
