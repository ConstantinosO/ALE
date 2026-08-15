import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickQuizQuestions, pickExamQuestions } from '../js/core/picker.js';
import { FIXTURE_CONTENT } from './fixtures/content.js';

const NOW = '2026-08-15T10:00:00.000Z';
const rand0 = () => 0;

test('micro mode picks from all topics, round-robin, no duplicate questions', () => {
  const qs = pickQuizQuestions({ content: FIXTURE_CONTENT, topics: {}, mode: 'micro', now: NOW, count: 5, rand: rand0 });
  assert.equal(qs.length, 5); // fixture has 5 MCQs total
  const texts = qs.map((x) => x.q.question);
  assert.equal(new Set(texts).size, texts.length);
});

test('weak mode only includes weak topics', () => {
  const topics = { t1: { ...base(), weak: true } };
  const qs = pickQuizQuestions({ content: FIXTURE_CONTENT, topics, mode: 'weak', now: NOW, count: 10, rand: rand0 });
  assert.ok(qs.length > 0);
  assert.ok(qs.every((x) => x.topicId === 't1'));
});

test('revision mode only includes due topics', () => {
  const topics = {
    t1: { ...base(), nextReview: '2026-09-01T00:00:00.000Z' }, // not due
    t2: { ...base(), nextReview: '2026-08-01T00:00:00.000Z' }, // due
    // t3 never studied -> due
  };
  const qs = pickQuizQuestions({ content: FIXTURE_CONTENT, topics, mode: 'revision', now: NOW, count: 10, rand: rand0 });
  const ids = new Set(qs.map((x) => x.topicId));
  assert.ok(!ids.has('t1'));
  assert.ok(ids.has('t2') && ids.has('t3'));
});

test('question difficulty follows topic progress difficulty when available', () => {
  const topics = { t1: { ...base(), difficulty: 'hard' } };
  const qs = pickQuizQuestions({ content: FIXTURE_CONTENT, topics, mode: 'micro', now: NOW, count: 1, rand: rand0 });
  assert.equal(qs[0].q.difficulty, 'hard');
});

test('excluded chapters are skipped', () => {
  const qs = pickQuizQuestions({ content: FIXTURE_CONTENT, topics: {}, mode: 'micro', now: NOW, excludedChapterIds: ['ch1'], count: 10, rand: rand0 });
  assert.ok(qs.every((x) => x.topicId === 't3'));
});

test('exam picker prefers non-easy questions and respects count', () => {
  const qs = pickExamQuestions({ content: FIXTURE_CONTENT, analysis: null, count: 3, rand: rand0 });
  assert.equal(qs.length, 3);
});

test('exam picker weights topics named in analysis', () => {
  const analysis = { topicFrequencies: [{ topic: 'Θέμα Τρία', count: 8, percentage: 80 }] };
  let hits = 0;
  // deterministic sweep of rand values instead of Math.random
  for (let i = 0; i < 100; i++) {
    const r = ((i * 37) % 100) / 100;
    const qs = pickExamQuestions({ content: FIXTURE_CONTENT, analysis, count: 1, rand: () => r });
    if (qs[0]?.topicId === 't3') hits++;
  }
  assert.ok(hits > 50, `t3 picked ${hits}/100 — weighting not applied`);
});

function base() {
  return {
    mastery: 0, acc: 0, correct: 0, incorrect: 0, consecCorrect: 0, consecIncorrect: 0,
    difficulty: 'easy', intervalIndex: -1, nextReview: null, lastStudied: null, xp: 0, weak: false,
  };
}
