import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../js/router.js';

test('empty hash routes to dashboard', () => {
  assert.deepEqual(parseRoute(''), { view: 'dashboard', params: {} });
  assert.deepEqual(parseRoute('#/'), { view: 'dashboard', params: {} });
});

test('course route carries courseId', () => {
  assert.deepEqual(parseRoute('#/course/klados-zois'),
    { view: 'course', params: { courseId: 'klados-zois' } });
});

test('topic route carries courseId and topicId', () => {
  assert.deepEqual(parseRoute('#/topic/klados-zois/t1'),
    { view: 'topic', params: { courseId: 'klados-zois', topicId: 't1' } });
});

test('quiz route carries mode', () => {
  assert.deepEqual(parseRoute('#/quiz/klados-zois/weak'),
    { view: 'quiz', params: { courseId: 'klados-zois', mode: 'weak' } });
});

test('essay exam route carries courseId', () => {
  assert.deepEqual(parseRoute('#/essay/klados-zois'),
    { view: 'essayexam', params: { courseId: 'klados-zois' } });
  assert.equal(parseRoute('#/essay').view, 'dashboard');
});

test('essay bank route carries courseId', () => {
  assert.deepEqual(parseRoute('#/essaybank/klados-zois'),
    { view: 'essaybank', params: { courseId: 'klados-zois' } });
  assert.equal(parseRoute('#/essaybank').view, 'dashboard');
});

test('chapter test route carries courseId and chapterId', () => {
  assert.deepEqual(parseRoute('#/chaptertest/klados-zois/z-ch03'),
    { view: 'chaptertest', params: { courseId: 'klados-zois', chapterId: 'z-ch03' } });
  assert.equal(parseRoute('#/chaptertest/klados-zois').view, 'dashboard');
});

test('unknown or incomplete routes fall back to dashboard', () => {
  assert.equal(parseRoute('#/nonsense').view, 'dashboard');
  assert.equal(parseRoute('#/course').view, 'dashboard');
});
