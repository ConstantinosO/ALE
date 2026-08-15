import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, loadState, saveState } from '../js/core/store.js';

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
