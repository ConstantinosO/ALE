import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, mergeState } from '../js/core/merge.js';
import { freshState } from '../js/core/store.js';

function stateWith(topics, statsOverride = {}) {
  const s = freshState();
  s.topics = topics;
  Object.assign(s.stats, statsOverride);
  return s;
}

test('validateSnapshot rejects garbage with Greek errors', () => {
  assert.equal(validateSnapshot(null).ok, false);
  assert.equal(validateSnapshot({ version: 2, topics: {}, stats: {} }).ok, false);
  assert.equal(validateSnapshot({ version: 1, stats: {} }).ok, false);
  const bad = validateSnapshot({});
  assert.match(bad.error, /[Α-Ωα-ω]/); // error message is in Greek
});

test('validateSnapshot accepts a real export', () => {
  assert.equal(validateSnapshot(freshState()).ok, true);
});

test('newer imported topic wins, older loses', () => {
  const local = stateWith({
    a: { mastery: 10, lastStudied: '2026-08-10T00:00:00.000Z' },
    b: { mastery: 90, lastStudied: '2026-08-14T00:00:00.000Z' },
  });
  const imported = stateWith({
    a: { mastery: 50, lastStudied: '2026-08-12T00:00:00.000Z' },
    b: { mastery: 20, lastStudied: '2026-08-01T00:00:00.000Z' },
    c: { mastery: 5, lastStudied: null },
  });
  const m = mergeState(local, imported);
  assert.equal(m.topics.a.mastery, 50); // imported newer
  assert.equal(m.topics.b.mastery, 90); // local newer
  assert.equal(m.topics.c.mastery, 5);  // only in import
});

test('stats take max, badges union by id', () => {
  const local = stateWith({}, {
    totalXp: 100, currentStreak: 2, longestStreak: 5,
    badges: [{ id: 'prota-vimata', earnedDate: '2026-08-01' }],
    lastStudyDate: '2026-08-14',
  });
  const imported = stateWith({}, {
    totalXp: 300, currentStreak: 1, longestStreak: 3,
    badges: [{ id: 'xp-1000', earnedDate: '2026-08-10' }],
    lastStudyDate: '2026-08-12',
  });
  const m = mergeState(local, imported);
  assert.equal(m.stats.totalXp, 300);
  assert.equal(m.stats.currentStreak, 2);
  assert.equal(m.stats.longestStreak, 5);
  assert.equal(m.stats.lastStudyDate, '2026-08-14');
  assert.deepEqual(m.stats.badges.map((b) => b.id).sort(), ['prota-vimata', 'xp-1000']);
});

test('local settings win over imported', () => {
  const local = freshState(); local.settings.examDate = '2026-10-03';
  const imported = freshState(); imported.settings.examDate = '2026-09-01';
  assert.equal(mergeState(local, imported).settings.examDate, '2026-10-03');
});

test('equal lastStudied timestamps: local wins (strict > comparison)', () => {
  const timestamp = '2026-08-10T00:00:00.000Z';
  const local = stateWith({
    a: { mastery: 10, lastStudied: timestamp },
  });
  const imported = stateWith({
    a: { mastery: 50, lastStudied: timestamp },
  });
  const m = mergeState(local, imported);
  assert.equal(m.topics.a.mastery, 10); // local wins on tie
});

test('both null lastStudied: local wins', () => {
  const local = stateWith({
    a: { mastery: 10, lastStudied: null },
  });
  const imported = stateWith({
    a: { mastery: 50, lastStudied: null },
  });
  const m = mergeState(local, imported);
  assert.equal(m.topics.a.mastery, 10); // local wins
});

test('both sides badges empty: merged badges is empty array', () => {
  const local = stateWith({}, { badges: [] });
  const imported = stateWith({}, { badges: [] });
  const m = mergeState(local, imported);
  assert.deepEqual(m.stats.badges, []);
});

test('local sessions survive merge unchanged, imported ignored', () => {
  const localSessions = [{ date: '2026-08-01', duration: 300, correct: 5 }];
  const importedSessions = [{ date: '2026-08-02', duration: 600, correct: 10 }];
  const local = freshState(); local.sessions = localSessions;
  const imported = freshState(); imported.sessions = importedSessions;
  const m = mergeState(local, imported);
  assert.deepEqual(m.sessions, localSessions);
});
