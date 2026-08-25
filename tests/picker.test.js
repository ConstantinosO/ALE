import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickQuizQuestions, pickExamQuestions, weightFor } from '../js/core/picker.js';
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

test('exam picker weights by chapterId when the analysis provides one', () => {
  // ch2 holds only t3; a 90% chapter should dominate the draw.
  const analysis = { topicFrequencies: [
    { chapterId: 'ch2', topic: 'Δεύτερο Κεφάλαιο', count: 9, percentage: 90 },
    { chapterId: 'ch1', topic: 'Πρώτο Κεφάλαιο', count: 1, percentage: 10 },
  ] };
  let hits = 0;
  for (let i = 0; i < 100; i++) {
    const r = ((i * 37) % 100) / 100;
    const qs = pickExamQuestions({ content: FIXTURE_CONTENT, analysis, count: 1, rand: () => r });
    if (qs[0]?.topicId === 't3') hits++;
  }
  assert.ok(hits > 50, `t3 picked ${hits}/100 — chapterId weighting not applied`);
});

test('chapterId matching wins over a misleading title match', () => {
  // 'Θέμα' substring-matches every topic title; the chapterId entry must win.
  const analysis = { topicFrequencies: [
    { chapterId: 'ch2', topic: 'κάτι άλλο', count: 9, percentage: 90 },
    { topic: 'Θέμα', count: 1, percentage: 10 },
  ] };
  let hits = 0;
  for (let i = 0; i < 100; i++) {
    const r = ((i * 37) % 100) / 100;
    const qs = pickExamQuestions({ content: FIXTURE_CONTENT, analysis, count: 1, rand: () => r });
    if (qs[0]?.topicId === 't3') hits++;
  }
  assert.ok(hits > 50, `t3 picked ${hits}/100 — chapterId did not take precedence`);
});

test('a 0%-frequency chapter draws a small share next to a heavily-examined one', () => {
  // ch1 (t1, t2) is 98% of the real paper; ch2 (t3) is 0%. The old
  // max(1, round(1 + pct/10)) formula compressed this into weights 11 vs 1
  // (t3 ~4.4% of the draw); the new max(1, round(pct)) formula produces
  // weights 98 vs 1 (t3 ~0.5%) -- present via the floor, but not competing
  // on anything like equal footing with material that has actually been
  // examined.
  const analysis = { topicFrequencies: [
    { chapterId: 'ch1', topic: 'Πρώτο Κεφάλαιο', count: 49, percentage: 98 },
    { chapterId: 'ch2', topic: 'Δεύτερο Κεφάλαιο', count: 0, percentage: 0 },
  ] };
  let hits = 0;
  const trials = 2000;
  for (let i = 0; i < trials; i++) {
    const r = (i % trials) / trials;
    const qs = pickExamQuestions({ content: FIXTURE_CONTENT, analysis, count: 1, rand: () => r });
    if (qs[0]?.topicId === 't3') hits++;
  }
  const share = hits / trials;
  assert.ok(share < 0.02, `t3 (0% chapter) picked ${hits}/${trials} (${(share * 100).toFixed(1)}%) — floor weight too large next to a 98% chapter`);
});

test('malformed frequency entries do not throw or skew weighting', () => {
  const analysis = { topicFrequencies: [
    null, {}, { chapterId: null }, { topic: null }, { chapterId: 'ch2' },
  ] };
  const qs = pickExamQuestions({ content: FIXTURE_CONTENT, analysis, count: 3, rand: rand0 });
  assert.equal(qs.length, 3);
});

test('exam weighting is normalised per chapter, not amplified by topic count', () => {
  // ch1 holds t1+t2, ch2 holds t3. Equal chapter percentages must give equal
  // CHAPTER pull — before normalisation ch1 drew twice as often purely for
  // having twice the topics, letting topic count decide the exam's shape.
  const analysis = { topicFrequencies: [
    { chapterId: 'ch1', topic: 'Κεφάλαιο Ένα', count: 5, percentage: 50 },
    { chapterId: 'ch2', topic: 'Κεφάλαιο Δύο', count: 5, percentage: 50 },
  ] };
  let ch1 = 0;
  let ch2 = 0;
  for (let i = 0; i < 400; i++) {
    const r = ((i * 37) % 100) / 100;
    const qs = pickExamQuestions({ content: FIXTURE_CONTENT, analysis, count: 1, rand: () => r });
    if (!qs.length) continue;
    if (qs[0].topicId === 't3') ch2++; else ch1++;
  }
  const share = ch1 / (ch1 + ch2);
  assert.ok(share > 0.35 && share < 0.65,
    `ch1 drew ${(share * 100).toFixed(0)}% of questions; equal percentages should give roughly equal chapter shares`);
});

test('a chapter measured at 0% keeps a small but non-zero share', () => {
  const analysis = { topicFrequencies: [
    { chapterId: 'ch1', topic: 'Κεφάλαιο Ένα', count: 9, percentage: 90 },
    { chapterId: 'ch2', topic: 'Κεφάλαιο Δύο', count: 0, percentage: 0 },
  ] };
  let ch2 = 0;
  const runs = 400;
  for (let i = 0; i < runs; i++) {
    const r = ((i * 37) % 100) / 100;
    const qs = pickExamQuestions({ content: FIXTURE_CONTENT, analysis, count: 1, rand: () => r });
    if (qs[0]?.topicId === 't3') ch2++;
  }
  const share = ch2 / runs;
  assert.ok(share < 0.15, `unexamined chapter took ${(share * 100).toFixed(0)}% of the exam`);
  // Reachability is asserted on the weight itself rather than by sampling: a
  // 0% chapter's real share is around 0.1%, which a coarse deterministic rand
  // sweep cannot observe even though the chapter is genuinely still in the pool.
  assert.equal(weightFor({ id: 't3', title: 'Θέμα Τρία', chapterId: 'ch2' }, analysis, 1), 1);
});

test('weightFor divides the chapter share by the topics in play', () => {
  const analysis = { topicFrequencies: [{ chapterId: 'ch1', topic: 'x', count: 3, percentage: 30 }] };
  const topic = { id: 't1', title: 'Θέμα Ένα', chapterId: 'ch1' };
  assert.equal(weightFor(topic, analysis, 1), 300);
  assert.equal(weightFor(topic, analysis, 6), 50);
  assert.equal(weightFor(topic, analysis, 0), 300); // guards a zero divisor
  assert.equal(weightFor({ ...topic, chapterId: 'nope' }, analysis, 3), 1);
  assert.equal(weightFor(topic, null, 3), 1);
});

function base() {
  return {
    mastery: 0, acc: 0, correct: 0, incorrect: 0, consecCorrect: 0, consecIncorrect: 0,
    difficulty: 'easy', intervalIndex: -1, nextReview: null, lastStudied: null, xp: 0, weak: false,
  };
}
