import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCourses, loadContent, loadAnalysis, loadEssayBank, validateContent, allTopics } from '../js/core/content.js';
import { FIXTURE_CONTENT } from './fixtures/content.js';

function fakeFetch(map) {
  return async (url) => {
    if (!(url in map)) return { ok: false, status: 404 };
    return { ok: true, json: async () => map[url] };
  };
}

test('loadCourses fetches data/courses.json', async () => {
  const f = fakeFetch({ 'data/courses.json': { examDate: '2026-10-03', courses: [] } });
  const c = await loadCourses(f);
  assert.equal(c.examDate, '2026-10-03');
});

test('loadCourses throws Greek error on failure', async () => {
  await assert.rejects(() => loadCourses(fakeFetch({})), /[Α-Ωα-ω]/);
});

test('loadContent validates structure', async () => {
  const f = fakeFetch({ 'data/demo/content.json': FIXTURE_CONTENT });
  const c = await loadContent('demo', f);
  assert.equal(c.chapters.length, 2);
  const bad = fakeFetch({ 'data/demo/content.json': { chapters: [{ title: 'x' }] } });
  await assert.rejects(() => loadContent('demo', bad), /[Α-Ωα-ω]/);
});

test('loadAnalysis returns null when file missing', async () => {
  assert.equal(await loadAnalysis('demo', fakeFetch({})), null);
});

test('loadEssayBank returns null when file missing', async () => {
  assert.equal(await loadEssayBank('demo', fakeFetch({})), null);
});

test('loadEssayBank returns the parsed bank when present', async () => {
  const bank = { courseId: 'demo', entries: [], miniDefinitions: [] };
  const f = fakeFetch({ 'data/demo/essay-bank.json': bank });
  assert.deepEqual(await loadEssayBank('demo', f), bank);
});

test('loadEssayBank throws on malformed JSON, unlike loadAnalysis', async () => {
  const f = async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } });
  await assert.rejects(() => loadEssayBank('demo', f), SyntaxError);
});

test('validateContent', () => {
  assert.equal(validateContent(FIXTURE_CONTENT), null);
  assert.match(validateContent({}), /[Α-Ωα-ω]/);
});

test('allTopics flattens and respects exclusions', () => {
  assert.equal(allTopics(FIXTURE_CONTENT).length, 3);
  assert.equal(allTopics(FIXTURE_CONTENT)[0].chapterTitle, 'Κεφάλαιο 1');
  assert.deepEqual(allTopics(FIXTURE_CONTENT, ['ch1']).map((t) => t.id), ['t3']);
});

test('generated data files pass validation', () => {
  for (const id of ['klados-zois', 'basikes-arxes']) {
    const c = JSON.parse(readFileSync(`data/${id}/content.json`, 'utf8'));
    assert.equal(validateContent(c), null, id);
    assert.ok(allTopics(c).length > 0, id);
  }
});

test('generated data files use canonical difficulty values', () => {
  const allowed = new Set(['easy', 'medium', 'hard']);
  for (const id of ['klados-zois', 'basikes-arxes']) {
    const c = JSON.parse(readFileSync(`data/${id}/content.json`, 'utf8'));
    for (const topic of allTopics(c)) {
      for (const q of topic.mcq) assert.ok(allowed.has(q.difficulty), `${id}/${topic.id} mcq: ${q.difficulty}`);
      for (const q of topic.shortAnswers) assert.ok(allowed.has(q.difficulty), `${id}/${topic.id} shortAnswer: ${q.difficulty}`);
    }
  }
});

// Chapters 5 and 6 were collapsed to one topic each. Their two exam
// questions came along as a list, so the shipped material must exercise the
// array shape js/views/topic.js and the editor's PATH_RE both allow.
test('chapters 5 and 6 are a single topic each, carrying both exam questions', () => {
  const content = JSON.parse(readFileSync('data/klados-zois/content.json', 'utf8'));
  for (const chId of ['z-ch05', 'z-ch06']) {
    const ch = content.chapters.find((c) => c.id === chId);
    assert.equal(ch.topics.length, 1, `${chId} should hold one topic`);
    const qs = [].concat(ch.topics[0].examQuestion ?? []);
    assert.equal(qs.length, 2, `${chId} should keep both exam questions`);
    for (const q of qs) {
      assert.ok(q.question?.trim() && q.modelAnswer?.trim(), `${chId} exam question is incomplete`);
    }
  }
});

test('no retired topic id survives anywhere in the shipped material', () => {
  const content = JSON.parse(readFileSync('data/klados-zois/content.json', 'utf8'));
  const bank = JSON.parse(readFileSync('data/klados-zois/essay-bank.json', 'utf8'));
  const ids = new Set(content.chapters.flatMap((c) => c.topics.map((t) => t.id)));
  for (const gone of ['z5-2', 'z6-2']) assert.ok(!ids.has(gone), `${gone} still in content`);
  for (const holder of [...bank.entries, ...bank.miniDefinitions]) {
    for (const tid of holder.topicIds || []) {
      assert.ok(ids.has(tid), `${holder.id} points at missing topic ${tid}`);
    }
  }
});

// καθορισμένων συνεισφορών = Defined Contribution, καθορισμένων ωφελημάτων =
// Defined Benefit. The two English labels were once added swapped during an
// in-app edit of z6-1; nothing else in the material uses them.
test('Greek and English pension-plan terms are paired correctly', () => {
  const s = readFileSync('data/klados-zois/content.json', 'utf8');
  assert.doesNotMatch(s, /συνεισφορ\S*\s*\(Defined Benefits?\)/i);
  assert.doesNotMatch(s, /ωφελημάτων\s*\(Defined Contributions?\)/i);
});

// A trust over a life policy is not made "before a court": the only court in
// the source notes is disputed claims (Κεφ. 10), which had leaked into the
// καταπίστευμα definitions. The trustee and the beneficiary are also distinct
// roles - the trustee completes the claim form on the beneficiaries' behalf.
test('the trust (καταπίστευμα) definitions carry no court and keep roles apart', () => {
  const blobs = ['data/klados-zois/content.json', 'data/klados-zois/essay-bank.json']
    .map((f) => readFileSync(f, 'utf8'));
  for (const s of blobs) {
    assert.doesNotMatch(s, /αταπίστευμα[^"]{0,300}δικαστ/);
    assert.doesNotMatch(s, /δικαιούχο πρόσωπο[^"]{0,80}ενεργεί ως καταπιστευματοδόχος/);
  }
});

// Slide Κεφ. 4, απαράγραπτες επιλογές 1(α)/(β): Μειωμένο Αποπληρωμένο keeps
// cover for a REDUCED amount; Ελεύθερο Περαιτέρω Πληρωμών (paid-up) KEEPS the
// original sum assured, with charges taken from the units. The material once
// gave paid-up the reduced amount and "cancelled covers", contradicting its
// own definition card. The user chose to follow the slide.
test('paid-up is never given the reduced amount or cancelled covers', () => {
  for (const f of ['data/klados-zois/content.json', 'data/klados-zois/essay-bank.json']) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /(Paid.?up|Ελεύθερο Περαιτέρω Πληρωμών)(?:(?!Μειωμένο Αποπληρωμένο|\(α\))[^.·"]){0,140}μειωμένο ποσό/i, f);
    assert.doesNotMatch(s, /(Paid.?up|Ελεύθερο Περαιτέρω)(?:(?!Μειωμένο Αποπληρωμένο|\(α\))[^.·"]){0,100}καταργ/i, f);
  }
});

// Group life: the minimum group of 10 and the 75%-full-time condition for
// skipping individual evidence are both on the slides and z5-1's summary,
// and must reach the exam answers and the bank, not just the topic page.
test('group-life answers carry the 10-person and 75% full-time conditions', () => {
  const c = JSON.parse(readFileSync('data/klados-zois/content.json', 'utf8'));
  const b = JSON.parse(readFileSync('data/klados-zois/essay-bank.json', 'utf8'));
  const z = c.chapters.flatMap((ch) => ch.topics).find((t) => t.id === 'z5-1');
  const texts = [...[].concat(z.examQuestion).map((q) => q.modelAnswer),
    b.entries.find((e) => e.id === 'e-omadiki').modelAnswer];
  for (const s of texts) {
    assert.match(s, /τουλάχιστον 10 άτομα/);
    assert.match(s, /75%[^.]*πλήρες ωράριο/);
  }
  // and nothing broke «π.χ.» while being edited (a lone «π.» before a capital;
  // «συμπ. Πρόσοδοι» in a chapter title is a different, legitimate abbreviation)
  for (const s of [JSON.stringify(c), JSON.stringify(b)]) assert.doesNotMatch(s, /(?<![πΠ])\.χ\.|(?<![α-ωά-ώΑ-ΩΆ-Ώ])π\.\s+[Α-ΩΆ-Ώ]/);
});
