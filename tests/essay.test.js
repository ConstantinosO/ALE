import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEssayBank, buildPaper, scoreQuestion, scorePaper, questionTopicIds } from '../js/core/essay.js';
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

test('buildPaper drops the slot-8 question when fewer than 3 mini-definitions exist', () => {
  for (const n of [0, 1, 2]) {
    const bank = { ...FIXTURE_ESSAY_BANK, miniDefinitions: FIXTURE_ESSAY_BANK.miniDefinitions.slice(0, n) };
    const paper = buildPaper(bank, { rand: rand0 });
    assert.ok(paper.questions.every((q) => !q.items), `n=${n}`);
    assert.ok(paper.questions.every((q) => q.id !== 'e-last'), `n=${n}`);
  }
});

test('buildPaper keeps the slot-8 question when exactly 3 mini-definitions exist', () => {
  const bank = { ...FIXTURE_ESSAY_BANK, miniDefinitions: FIXTURE_ESSAY_BANK.miniDefinitions.slice(0, 3) };
  const paper = buildPaper(bank, { rand: rand0 });
  const last = paper.questions.at(-1);
  assert.equal(last.id, 'e-last');
  assert.equal(last.items.length, 3);
});

test('buildPaper still produces a paper with no slot-1 or no slot-8 entry', () => {
  const noEdges = { ...FIXTURE_ESSAY_BANK, entries: FIXTURE_ESSAY_BANK.entries.filter((e) => e.slot === 0) };
  const paper = buildPaper(noEdges, { count: 3, rand: rand0 });
  assert.ok(paper.questions.length > 0);
  assert.ok(paper.questions.every((q) => !q.items));
});

test('buildPaper picks exactly one prompt variant per question, and both variants actually occur', () => {
  // rand0 alone would pass even if variant selection were hard-wired to
  // index 0 -- it always returns the SAME index. Sweep rand instead and
  // confirm both of e-mid-high's two prompt variants are reachable.
  const bank = {
    ...FIXTURE_ESSAY_BANK,
    entries: FIXTURE_ESSAY_BANK.entries.filter((e) => ['e-anagkes', 'e-mid-high', 'e-last'].includes(e.id)),
  };
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const r = ((i * 31) % 100) / 100;
    const paper = buildPaper(bank, { count: 3, rand: () => r });
    const midHigh = paper.questions.find((q) => q.id === 'e-mid-high');
    assert.ok(['Ερώτηση Χ;', 'Ερώτηση Χ παραλλαγή;'].includes(midHigh.promptText));
    seen.add(midHigh.promptText);
  }
  assert.equal(seen.size, 2, `expected both prompt variants across the rand sweep, saw: ${[...seen]}`);
});

test('buildPaper carries the requested answerCount through untouched', () => {
  const paper = buildPaper(FIXTURE_ESSAY_BANK, { rand: rand0, answerCount: 4 });
  assert.equal(paper.answerCount, 4);
});

test('questionTopicIds returns a normal question\'s own topicIds', () => {
  const q = { topicIds: ['z3-1', 'z3-2'] };
  assert.deepEqual(questionTopicIds(q), ['z3-1', 'z3-2']);
  assert.deepEqual(questionTopicIds({}), []);
});

test('questionTopicIds for a mini-definitions question uses ONLY the drawn items\' topicIds', () => {
  // The entry's own generic topicIds (z1-2 here) were never actually
  // tested by whichever three items got drawn -- they must not leak in.
  const q = {
    topicIds: ['z1-2'],
    items: [
      { id: 'mini-thnisimotita', topicIds: ['z2-1'] },
      { id: 'mini-apa', topicIds: ['z3-6'] },
      { id: 'mini-unitlinked', topicIds: ['z3-3'] },
    ],
  };
  assert.deepEqual(questionTopicIds(q).sort(), ['z2-1', 'z3-3', 'z3-6']);
});

test('questionTopicIds de-duplicates and tolerates items with missing topicIds', () => {
  const q = { items: [{ topicIds: ['t1'] }, { topicIds: ['t1', 't2'] }, {}] };
  assert.deepEqual(questionTopicIds(q).sort(), ['t1', 't2']);
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

test('scorePaper (over-answered): pct and attemptedPct both average the best answerCount', () => {
  const perQuestion = [100, 90, 20, 10, 0, 80, 60]; // 7 answered, answerCount 6
  const { pct, attemptedPct, answered, counted } = scorePaper(perQuestion, 6);
  assert.equal(answered, 7);
  assert.equal(counted, 6);
  const best6 = [100, 90, 80, 60, 20, 10];
  const expected = Math.round(best6.reduce((a, b) => a + b, 0) / 6);
  assert.equal(pct, expected); // unaffected by the fix: counted === answerCount here
  assert.equal(attemptedPct, expected);
});

test('scorePaper (under-answered): pct counts missing slots as zero, attemptedPct does not', () => {
  // Two excellent answers is NOT 75% of a 6-question paper — it's 2/6 of it.
  const { pct, attemptedPct, answered, counted } = scorePaper([50, 100], 6);
  assert.equal(answered, 2);
  assert.equal(counted, 2);
  assert.equal(pct, 25); // (50+100)/6
  assert.equal(attemptedPct, 75); // (50+100)/2 — honest quality of what was attempted
});

test('scorePaper: pct equals attemptedPct when exactly answerCount questions are answered', () => {
  const { pct, attemptedPct } = scorePaper([80, 60, 40, 20, 100, 0], 6);
  assert.equal(pct, attemptedPct);
});

test('scorePaper handles zero answered questions without NaN', () => {
  const { pct, attemptedPct, answered, counted } = scorePaper([], 6);
  assert.equal(pct, 0);
  assert.equal(attemptedPct, 0);
  assert.equal(answered, 0);
  assert.equal(counted, 0);
});

test('scorePaper guards a zero/negative answerCount instead of dividing by zero', () => {
  for (const bad of [0, -3, NaN]) {
    const { pct, attemptedPct, answered, counted } = scorePaper([50, 80], bad);
    assert.equal(pct, 0);
    assert.equal(attemptedPct, 0);
    assert.equal(answered, 2);
    assert.equal(counted, 0);
    assert.ok(Number.isFinite(pct) && Number.isFinite(attemptedPct));
  }
});

// The fixture bank above is hand-built and always valid; it can't catch a
// real bank regeneration shipping a bad slot, an empty miniDefinitions
// array, or a topicId/chapterId that no longer exists in content.json. Only
// loading the actual shipped file catches that — see tests/content.test.js's
// "generated data files pass validation" test for the same pattern applied
// to content.json.
test('the shipped essay bank passes validation and every topic/chapter link resolves', () => {
  const bank = JSON.parse(readFileSync('data/klados-zois/essay-bank.json', 'utf8'));
  assert.equal(validateEssayBank(bank), null);

  const content = JSON.parse(readFileSync('data/klados-zois/content.json', 'utf8'));
  const validChapters = new Set(content.chapters.map((c) => c.id));
  const validTopics = new Set(content.chapters.flatMap((c) => c.topics.map((t) => t.id)));

  for (const e of bank.entries) {
    assert.ok(validChapters.has(e.chapterId), `entry ${e.id} has unknown chapterId ${e.chapterId}`);
    for (const tid of e.topicIds || []) {
      assert.ok(validTopics.has(tid), `entry ${e.id} has unknown topicId ${tid}`);
    }
  }
  for (const m of bank.miniDefinitions) {
    for (const tid of m.topicIds || []) {
      assert.ok(validTopics.has(tid), `mini-definition ${m.id} has unknown topicId ${tid}`);
    }
  }
});
