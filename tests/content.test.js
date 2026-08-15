import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCourses, loadContent, loadAnalysis, validateContent, allTopics } from '../js/core/content.js';
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
