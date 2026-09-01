import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, loadState, saveState, migrateTopics } from '../js/core/store.js';

function fakeStorage(initial = {}) {
  const m = { ...initial };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _dump: () => m,
  };
}

test('freshState has expected shape', () => {
  const s = freshState();
  assert.equal(s.version, 1);
  assert.deepEqual(s.topics, {});
  assert.deepEqual(s.sessions, []);
  assert.equal(s.settings.examDate, null);
  assert.deepEqual(s.settings.excludedChapters, {});
  assert.equal(s.stats.totalXp, 0);
});

test('loadState returns fresh state when storage empty', () => {
  assert.deepEqual(loadState(fakeStorage()), freshState());
});

test('save then load round-trips', () => {
  const st = fakeStorage();
  const s = freshState();
  s.topics.t1 = { mastery: 42 };
  assert.equal(saveState(s, st), true);
  assert.equal(loadState(st).topics.t1.mastery, 42);
});

test('corrupt JSON falls back to fresh state', () => {
  const st = fakeStorage({ 'ale.v1': '{not json' });
  assert.deepEqual(loadState(st), freshState());
});

test('wrong version falls back to fresh state', () => {
  const st = fakeStorage({ 'ale.v1': JSON.stringify({ version: 99 }) });
  assert.deepEqual(loadState(st), freshState());
});

test('saveState returns false when storage throws', () => {
  const st = { setItem: () => { throw new Error('quota'); } };
  assert.equal(saveState(freshState(), st), false);
});

test('topics as null falls back to fresh state', () => {
  const st = fakeStorage({ 'ale.v1': JSON.stringify({ version: 1, topics: null }) });
  assert.deepEqual(loadState(st), freshState());
});

test('topics as array falls back to fresh state', () => {
  const st = fakeStorage({ 'ale.v1': JSON.stringify({ version: 1, topics: [] }) });
  assert.deepEqual(loadState(st), freshState());
});

// --- retired topic ids ----------------------------------------------------
// Chapters 5 and 6 became one topic each, so z5-2 / z6-2 no longer exist in
// content.json. Progress lives in the browser, not the repo, so without this
// fold a study record under a retired id would be invisible on every screen
// while still inflating the masteredTopics badge counts.

test('migrateTopics folds a retired topic into its survivor', () => {
  const out = migrateTopics({ 'z5-2': { mastery: 70, lastStudied: '2026-08-01T00:00:00.000Z' } });
  assert.deepEqual(Object.keys(out), ['z5-1']);
  assert.equal(out['z5-1'].mastery, 70);
});

test('migrateTopics keeps the more recently studied of the two', () => {
  const older = { mastery: 10, lastStudied: '2026-07-01T00:00:00.000Z' };
  const newer = { mastery: 90, lastStudied: '2026-08-01T00:00:00.000Z' };
  assert.equal(migrateTopics({ 'z5-1': older, 'z5-2': newer })['z5-1'].mastery, 90);
  assert.equal(migrateTopics({ 'z5-1': newer, 'z5-2': older })['z5-1'].mastery, 90);
});

test('migrateTopics adopts a retired record when the survivor has none', () => {
  const out = migrateTopics({ 'z6-2': { mastery: 40, lastStudied: null } });
  assert.equal(out['z6-1'].mastery, 40);
});

test('migrateTopics leaves untouched ids alone and is idempotent', () => {
  const once = migrateTopics({ 'z1-1': { mastery: 5 }, 'z5-2': { mastery: 6 } });
  assert.deepEqual(migrateTopics(once), once);
  assert.equal(once['z1-1'].mastery, 5);
});

test('migrateTopics drops prototype-polluting keys', () => {
  const out = migrateTopics(JSON.parse('{"__proto__":{"x":1},"z1-1":{"mastery":1}}'));
  assert.deepEqual(Object.keys(out), ['z1-1']);
});

test('loadState migrates retired ids off stored state', () => {
  const s = fakeStorage();
  s.setItem('ale.v1', JSON.stringify({
    version: 1, topics: { 'z5-2': { mastery: 55, lastStudied: null } },
    stats: {}, sessions: [], settings: {},
  }));
  const st = loadState(s);
  assert.equal(st.topics['z5-2'], undefined);
  assert.equal(st.topics['z5-1'].mastery, 55);
});
