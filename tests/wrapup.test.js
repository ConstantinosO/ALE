import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, tally, wrapUpHtml } from '../js/core/wrapup.js';

test('topics split into solid / shaky / blank, weakest is next', () => {
  const rows = tally([
    { topicId: 'a', topicTitle: 'Α', correct: true }, { topicId: 'a', topicTitle: 'Α', correct: true },
    { topicId: 'b', topicTitle: 'Β', correct: true }, { topicId: 'b', topicTitle: 'Β', correct: false },
    { topicId: 'c', topicTitle: 'Γ', correct: false },
  ]);
  const s = summarize(rows);
  assert.deepEqual([s.solid, s.shaky, s.blank], [1, 1, 1]);
  assert.equal(s.next.topicId, 'c');
});

test('all solid → no "next" topic; empty session → no line at all', () => {
  assert.equal(summarize(tally([{ topicId: 'a', topicTitle: 'Α', correct: true }])).next, null);
  assert.match(wrapUpHtml(tally([{ topicId: 'a', topicTitle: 'Α', correct: true }]), 'x'), /όλα σίγουρα/);
  assert.equal(wrapUpHtml([], 'x'), '');
});

test('titles are escaped', () => {
  assert.doesNotMatch(wrapUpHtml(tally([{ topicId: 'a', topicTitle: '<b>', correct: false }]), 'x'), /<b>/);
});
