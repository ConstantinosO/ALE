import { test } from 'node:test';
import assert from 'node:assert/strict';
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
