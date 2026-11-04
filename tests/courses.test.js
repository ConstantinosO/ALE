// Every course listed in data/courses.json, checked the same way. Progress
// (ale.v1) is keyed by bare topic id across ALL courses, so an id reused by a
// second course would silently share — and corrupt — the first one's record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { validateContent } from '../js/core/content.js';
import { validateEssayBank } from '../js/core/essay.js';

const { courses } = JSON.parse(readFileSync('data/courses.json', 'utf8'));
const load = (id, f) => JSON.parse(readFileSync(`data/${id}/${f}`, 'utf8'));

test('exactly one active course, and every listed course has material', () => {
  assert.equal(courses.filter((c) => c.status === 'active').length, 1);
  for (const c of courses) assert.equal(validateContent(load(c.id, 'content.json')), null, c.id);
});

test('topic and chapter ids are unique across all courses', () => {
  const seen = new Map();
  for (const c of courses) {
    for (const ch of load(c.id, 'content.json').chapters) {
      for (const id of [ch.id, ...ch.topics.map((t) => t.id)]) {
        assert.ok(!seen.has(id), `${id} is in both ${seen.get(id)} and ${c.id}`);
        seen.set(id, c.id);
      }
    }
  }
});

test('every essay bank validates and links only to its own course\'s topics', () => {
  for (const c of courses) {
    if (!existsSync(`data/${c.id}/essay-bank.json`)) continue;
    const bank = load(c.id, 'essay-bank.json');
    assert.equal(validateEssayBank(bank), null, c.id);
    assert.equal(bank.courseId, c.id);
    const content = load(c.id, 'content.json');
    const chapters = new Set(content.chapters.map((ch) => ch.id));
    const topics = new Set(content.chapters.flatMap((ch) => ch.topics.map((t) => t.id)));
    for (const e of bank.entries) {
      assert.ok(chapters.has(e.chapterId), `${c.id}/${e.id} chapter ${e.chapterId}`);
      assert.ok(e.topicIds.length, `${c.id}/${e.id} has no topics`);
      for (const t of e.topicIds) assert.ok(topics.has(t), `${c.id}/${e.id} topic ${t}`);
      assert.ok(e.keyPoints.length && e.modelAnswer.trim(), `${c.id}/${e.id} is unanswered`);
    }
  }
});
