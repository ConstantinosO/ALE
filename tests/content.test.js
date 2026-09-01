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
