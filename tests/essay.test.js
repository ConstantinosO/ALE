import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEssayBank, buildPaper, scoreQuestion, scorePaper } from '../js/core/essay.js';
import { FIXTURE_ESSAY_BANK } from './fixtures/essay.js';

const rand0 = () => 0;

test('validateEssayBank accepts a well-formed bank', () => {
  assert.equal(validateEssayBank(FIXTURE_ESSAY_BANK), null);
});

test('validateEssayBank rejects a missing/malformed bank', () => {
  assert.match(validateEssayBank(null), /[Α-Ωα-ω]/);
  assert.match(validateEssayBank({}), /[Α-Ωα-ω]/);
  assert.match(validateEssayBank({ courseId: 'x', entries: [] }), /[Α-Ωα-ω]/);
});

test('validateEssayBank rejects an entry with no prompts or a bad slot', () => {
  const noPrompts = { ...FIXTURE_ESSAY_BANK, entries: [{ ...FIXTURE_ESSAY_BANK.entries[0], prompts: [] }] };
  assert.match(validateEssayBank(noPrompts), /[Α-Ωα-ω]/);
  const badSlot = { ...FIXTURE_ESSAY_BANK, entries: [{ ...FIXTURE_ESSAY_BANK.entries[0], slot: 3 }] };
  assert.match(validateEssayBank(badSlot), /[Α-Ωα-ω]/);
});

test('validateEssayBank rejects a mini-definition without a term', () => {
  const bad = { ...FIXTURE_ESSAY_BANK, miniDefinitions: [{ id: 'mini-x' }] };
  assert.match(validateEssayBank(bad), /[Α-Ωα-ω]/);
});

test('buildPaper puts the slot-1 entry first, across a rand sweep', () => {
  for (let i = 0; i < 20; i++) {
    const r = ((i * 31) % 100) / 100;
    const paper = buildPaper(FIXTURE_ESSAY_BANK, { rand: () => r });
    assert.equal(paper.questions[0].id, 'e-anagkes');
  }
});

test('buildPaper puts the slot-8 entry last, with three distinct mini-definitions', () => {
  for (let i = 0; i < 20; i++) {
    const r = ((i * 31) % 100) / 100;
    const paper = buildPaper(FIXTURE_ESSAY_BANK, { rand: () => r });
    const last = paper.questions[paper.questions.length - 1];
    assert.equal(last.id, 'e-last');
    assert.equal(last.items.length, 3);
    assert.equal(new Set(last.items.map((it) => it.id)).size, 3);
  }
});

test('buildPaper draws no duplicate entries in one paper', () => {
  const paper = buildPaper(FIXTURE_ESSAY_BANK, { rand: rand0 });
  const ids = paper.questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('buildPaper weights middle questions by frequency (deterministic rand sweep)', () => {
  const bank = {
    ...FIXTURE_ESSAY_BANK,
    entries: FIXTURE_ESSAY_BANK.entries.filter((e) => ['e-anagkes', 'e-mid-high', 'e-mid-low', 'e-last'].includes(e.id)),
  };
  let hitsHigh = 0;
  const trials = 100;
  for (let i = 0; i < trials; i++) {
    const r = ((i * 37) % 100) / 100;
    const paper = buildPaper(bank, { count: 3, rand: () => r }); // slot1 + 1 middle + slot8
    if (paper.questions[1]?.id === 'e-mid-high') hitsHigh++;
  }
  assert.ok(hitsHigh > 50, `e-mid-high (freq 7) picked ${hitsHigh}/${trials} vs e-mid-low (freq 1) — weighting not applied`);
});

test('mini-definitions are drawn weighted by times (deterministic rand sweep)', () => {
  const trials = 100;
  let hitsA = 0;
  let hitsB = 0;
  for (let i = 0; i < trials; i++) {
    const r = ((i * 37) % 100) / 100;
    const last = buildPaper(FIXTURE_ESSAY_BANK, { rand: () => r }).questions.at(-1);
    if (last.items.some((it) => it.id === 'mini-a')) hitsA++;
    if (last.items.some((it) => it.id === 'mini-b')) hitsB++;
  }
  assert.ok(hitsA > hitsB, `mini-a (times 4) picked ${hitsA}/${trials} vs mini-b (times 1) picked ${hitsB}/${trials}`);
});

test('buildPaper degrades to a shorter paper when there are fewer entries than count', () => {
  const bank = { ...FIXTURE_ESSAY_BANK, entries: FIXTURE_ESSAY_BANK.entries.slice(0, 2) }; // e-anagkes, e-mid-high only
  const paper = buildPaper(bank, { count: 8, rand: rand0 });
  assert.ok(paper.questions.length > 0 && paper.questions.length < 8);
});

test('buildPaper still produces a paper with no slot-1 or no slot-8 entry', () => {
  const noEdges = { ...FIXTURE_ESSAY_BANK, entries: FIXTURE_ESSAY_BANK.entries.filter((e) => e.slot === 0) };
  const paper = buildPaper(noEdges, { count: 3, rand: rand0 });
  assert.ok(paper.questions.length > 0);
  assert.ok(paper.questions.every((q) => !q.items));
});

test('buildPaper picks exactly one prompt variant per question', () => {
  const paper = buildPaper(FIXTURE_ESSAY_BANK, { rand: rand0 });
  const midHigh = paper.questions.find((q) => q.id === 'e-mid-high');
  assert.ok(['Ερώτηση Χ;', 'Ερώτηση Χ παραλλαγή;'].includes(midHigh.promptText));
});

test('buildPaper carries the requested answerCount through untouched', () => {
  const paper = buildPaper(FIXTURE_ESSAY_BANK, { rand: rand0, answerCount: 4 });
  assert.equal(paper.answerCount, 4);
});

test('scoreQuestion is a 0-100 percentage and never NaN/Infinity', () => {
  assert.equal(scoreQuestion(0, 0), 0);
  assert.equal(scoreQuestion(5, 0), 0);
  assert.equal(scoreQuestion(0, 4), 0);
  assert.equal(scoreQuestion(2, 4), 50);
  assert.equal(scoreQuestion(4, 4), 100);
  assert.ok(Number.isFinite(scoreQuestion(0, 0)));
  assert.ok(Number.isFinite(scoreQuestion(NaN, NaN)));
});

test('scorePaper scores the best answerCount of the answered questions', () => {
  const perQuestion = [100, 90, 20, 10, 0, 80, 60]; // 7 answered, answerCount 6
  const { pct, answered, counted } = scorePaper(perQuestion, 6);
  assert.equal(answered, 7);
  assert.equal(counted, 6);
  const best6 = [100, 90, 80, 60, 20, 10];
  assert.equal(pct, Math.round(best6.reduce((a, b) => a + b, 0) / 6));
});

test('scorePaper handles answering fewer than answerCount', () => {
  const { pct, answered, counted } = scorePaper([50, 100], 6);
  assert.equal(answered, 2);
  assert.equal(counted, 2);
  assert.equal(pct, 75);
});

test('scorePaper handles zero answered questions without NaN', () => {
  const { pct, answered, counted } = scorePaper([], 6);
  assert.equal(pct, 0);
  assert.equal(answered, 0);
  assert.equal(counted, 0);
});
