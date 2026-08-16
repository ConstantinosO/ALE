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

test('imported topic with garbage fields is sanitized to safe numeric/enum values', () => {
  const local = stateWith({});
  const imported = stateWith({
    a: {
      mastery: '<img src=x>', acc: 'NaNish', correct: 'x', incorrect: {},
      consecCorrect: null, consecIncorrect: undefined, xp: 'lots', intervalIndex: 'far',
      difficulty: '<script>alert(1)</script>', nextReview: 123, lastStudied: '2026-08-12T00:00:00.000Z',
      weak: 'yes',
    },
  });
  const m = mergeState(local, imported);
  const a = m.topics.a;
  assert.equal(a.mastery, 0);
  assert.equal(a.acc, 0);
  assert.equal(a.correct, 0);
  assert.equal(a.incorrect, 0);
  assert.equal(a.consecCorrect, 0);
  assert.equal(a.consecIncorrect, 0);
  assert.equal(a.xp, 0);
  assert.equal(a.intervalIndex, 0);
  assert.equal(a.difficulty, 'easy');
  assert.equal(a.nextReview, null);
  assert.equal(a.lastStudied, '2026-08-12T00:00:00.000Z');
  assert.equal(typeof a.weak, 'boolean');
  assert.equal(a.weak, true);
});

test('imported topics with a __proto__ key are skipped and Object.prototype is not polluted', () => {
  const local = stateWith({});
  const imported = JSON.parse('{"version":1,"topics":{"__proto__":{"mastery":99,"polluted":true},"constructor":{"mastery":1},"prototype":{"mastery":1}},"stats":{}}');
  const m = mergeState(local, imported);
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.deepEqual(m.topics, {});
});

test('settings merge: examDate falls back to imported when local is null, else local wins', () => {
  const local = freshState(); local.settings.examDate = null;
  const imported = freshState(); imported.settings.examDate = '2026-09-01';
  assert.equal(mergeState(local, imported).settings.examDate, '2026-09-01');

  const local2 = freshState(); local2.settings.examDate = '2026-10-03';
  const imported2 = freshState(); imported2.settings.examDate = '2026-09-01';
  assert.equal(mergeState(local2, imported2).settings.examDate, '2026-10-03');
});

// Regression: mergeState used to rebuild `settings` field-by-field from a
// hard-coded list of two keys, so every other setting was dropped on import.
// sidebarCollapsed is the key that exposed it; the test is written against an
// arbitrary key as well, because the next setting added must not have to
// remember to edit mergeState.
test('settings merge: keys mergeState does not know about survive', () => {
  const local = freshState();
  local.settings.sidebarCollapsed = true;
  local.settings.someFutureSetting = 'κρατήσου';
  const imported = freshState();
  const m = mergeState(local, imported);
  assert.equal(m.settings.sidebarCollapsed, true);
  assert.equal(m.settings.someFutureSetting, 'κρατήσου');
  // and the two fields with real merge rules still follow them
  assert.equal(m.settings.examDate, null);
  assert.deepEqual(m.settings.excludedChapters, {});
});

test('freshState carries sidebarCollapsed so a fresh export contains it', () => {
  assert.equal(freshState().settings.sidebarCollapsed, false);
  assert.equal('sidebarCollapsed' in mergeState(freshState(), freshState()).settings, true);
});

// Mirrors the sidebarCollapsed regression above: collapsedGroups rides the
// same generic settings-spread in mergeState, so it needs its own freshState
// default and its own proof it survives a merge without a dedicated rule.
test('freshState carries collapsedGroups so a fresh export contains it, and it survives a merge', () => {
  assert.equal(freshState().settings.collapsedGroups, null);
  assert.equal('collapsedGroups' in mergeState(freshState(), freshState()).settings, true);

  const local = freshState();
  local.settings.collapsedGroups = ['basikes-arxes'];
  const imported = freshState();
  assert.deepEqual(mergeState(local, imported).settings.collapsedGroups, ['basikes-arxes']);
});

test('settings merge: excludedChapters combines imported-only courses, local wins per-course on conflict', () => {
  const local = freshState();
  local.settings.excludedChapters = { courseA: ['ch1'] };
  const imported = freshState();
  imported.settings.excludedChapters = { courseA: ['ch9'], courseB: ['ch2'] };
  const m = mergeState(local, imported);
  assert.deepEqual(m.settings.excludedChapters.courseA, ['ch1']); // local wins
  assert.deepEqual(m.settings.excludedChapters.courseB, ['ch2']); // imported-only fills in
});
