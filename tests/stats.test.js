import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newStats, dateStr, recordSession, evaluateBadges } from '../js/core/stats.js';

test('first session starts streak at 1', () => {
  const s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 30, timeSeconds: 120 });
  assert.equal(s.currentStreak, 1);
  assert.equal(s.longestStreak, 1);
  assert.equal(s.totalXp, 30);
  assert.equal(s.totalSessions, 1);
  assert.equal(s.lastStudyDate, '2026-08-15');
});

test('same-day second session keeps streak, adds xp', () => {
  let s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 30, timeSeconds: 120 });
  s = recordSession(s, { now: '2026-08-15T18:00:00', xp: 20, timeSeconds: 60 });
  assert.equal(s.currentStreak, 1);
  assert.equal(s.totalXp, 50);
  assert.equal(s.totalSessions, 2);
});

test('next-day session increments streak', () => {
  let s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 10, timeSeconds: 60 });
  s = recordSession(s, { now: '2026-08-16T10:00:00', xp: 10, timeSeconds: 60 });
  assert.equal(s.currentStreak, 2);
  assert.equal(s.longestStreak, 2);
});

test('gap resets streak but keeps longest', () => {
  let s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 10, timeSeconds: 60 });
  s = recordSession(s, { now: '2026-08-16T10:00:00', xp: 10, timeSeconds: 60 });
  s = recordSession(s, { now: '2026-08-20T10:00:00', xp: 10, timeSeconds: 60 });
  assert.equal(s.currentStreak, 1);
  assert.equal(s.longestStreak, 2);
});

test('badges: first session and xp milestones', () => {
  let s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 1200, timeSeconds: 60 });
  s = evaluateBadges(s, { masteredTopics: 0 }, '2026-08-15T10:00:00');
  const ids = s.badges.map((b) => b.id);
  assert.ok(ids.includes('prota-vimata'));
  assert.ok(ids.includes('xp-1000'));
  assert.ok(!ids.includes('xp-5000'));
  assert.equal(s.badges.find((b) => b.id === 'xp-1000').earnedDate, '2026-08-15');
});

test('badges are not duplicated on re-evaluation', () => {
  let s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 10, timeSeconds: 60 });
  s = evaluateBadges(s, { masteredTopics: 0 }, '2026-08-15T10:00:00');
  s = evaluateBadges(s, { masteredTopics: 0 }, '2026-08-16T10:00:00');
  assert.equal(s.badges.filter((b) => b.id === 'prota-vimata').length, 1);
});

test('dateStr uses local calendar date', () => {
  assert.equal(dateStr('2026-08-15T23:30:00'), '2026-08-15');
});
