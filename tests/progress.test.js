import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTopicProgress, recordAnswer, XP, MASTERY_CAP } from '../js/core/progress.js';

const NOW = '2026-08-15T10:00:00.000Z';

test('constants match spec', () => {
  assert.deepEqual(XP, { easy: 10, medium: 20, hard: 30 });
  assert.deepEqual(MASTERY_CAP, { easy: 50, medium: 80, hard: 100 });
});

test('first correct easy answer', () => {
  const p = recordAnswer(newTopicProgress(), { correct: true, questionDifficulty: 'easy', now: NOW });
  assert.equal(p.correct, 1);
  assert.equal(p.consecCorrect, 1);
  assert.equal(p.acc, 0.2);
  assert.equal(p.mastery, 10); // 0.2 * 50
  assert.equal(p.xp, 10);
  assert.equal(p.difficulty, 'easy');
  assert.equal(p.intervalIndex, 0);
  assert.equal(p.nextReview, '2026-08-16T10:00:00.000Z');
  assert.equal(p.lastStudied, NOW);
  assert.equal(p.weak, false);
});

test('3 consecutive correct promotes to medium and resets streak counter', () => {
  let p = newTopicProgress();
  for (let i = 0; i < 3; i++) p = recordAnswer(p, { correct: true, questionDifficulty: 'easy', now: NOW });
  assert.equal(p.difficulty, 'medium');
  assert.equal(p.consecCorrect, 0);
  // acc = 1 - 0.8^3 = 0.488 → mastery = round(0.488 * 80) = 39
  assert.equal(p.mastery, 39);
});

test('2 consecutive incorrect demotes and flags weak, resets interval', () => {
  let p = newTopicProgress();
  for (let i = 0; i < 3; i++) p = recordAnswer(p, { correct: true, questionDifficulty: 'easy', now: NOW });
  for (let i = 0; i < 2; i++) p = recordAnswer(p, { correct: false, questionDifficulty: 'medium', now: NOW });
  assert.equal(p.difficulty, 'easy');
  assert.equal(p.weak, true);
  assert.equal(p.intervalIndex, 0);
});

test('wrong answers earn no XP', () => {
  const p = recordAnswer(newTopicProgress(), { correct: false, questionDifficulty: 'hard', now: NOW });
  assert.equal(p.xp, 0);
});

test('weak flag from low mastery after 5 answers', () => {
  let p = newTopicProgress();
  // alternate: 3 correct, then pattern keeping mastery low
  p = recordAnswer(p, { correct: false, questionDifficulty: 'easy', now: NOW });
  p = recordAnswer(p, { correct: true, questionDifficulty: 'easy', now: NOW });
  p = recordAnswer(p, { correct: false, questionDifficulty: 'easy', now: NOW });
  p = recordAnswer(p, { correct: true, questionDifficulty: 'easy', now: NOW });
  p = recordAnswer(p, { correct: true, questionDifficulty: 'easy', now: NOW });
  assert.equal(p.correct + p.incorrect >= 5, true);
  assert.equal(p.mastery < 40, true);
  assert.equal(p.weak, true);
});

test('recordAnswer does not mutate its input', () => {
  const before = newTopicProgress();
  recordAnswer(before, { correct: true, questionDifficulty: 'easy', now: NOW });
  assert.deepEqual(before, newTopicProgress());
});
