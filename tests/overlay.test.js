import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadEdits, saveEdits, validPath, getPath, setPath, findTopic,
  applyEdits, pruneDeployed, pendingList, pendingCount, EDITS_KEY,
} from '../js/edit/overlay.js';

function memStorage(init = {}) {
  const m = { ...init };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _m: m,
  };
}

function sampleContent() {
  return { chapters: [{ id: 'c1', title: 'Κ1', topics: [{
    id: 't1', title: 'Θ1', summary: 'αρχικό',
    keyDefinitions: [{ term: 'Όρος', definition: 'ορισμός' }],
    killerFacts: ['γεγονός'], commonTraps: [],
    mcq: [{ question: 'q', options: ['a','b','c','d'], correctIndex: 0, explanation: 'εξήγηση', difficulty: 'easy' }],
    shortAnswers: [{ question: 'ε;', modelAnswer: 'απ' }],
    flashcards: [{ front: 'f', back: 'b' }],
    examQuestion: { question: 'εξ;', modelAnswer: 'μοντέλο', marks: 10 },
  }] }] };
}

test('loadEdits returns fresh structure on missing/corrupt data', () => {
  assert.deepEqual(loadEdits(memStorage()), { token: '', edits: {} });
  assert.deepEqual(loadEdits(memStorage({ [EDITS_KEY]: 'όχι json' })), { token: '', edits: {} });
  assert.deepEqual(loadEdits(memStorage({ [EDITS_KEY]: '{"token":5,"edits":[]}' })), { token: '', edits: {} });
});

test('saveEdits then loadEdits round-trips', () => {
  const s = memStorage();
  saveEdits(s, { token: 'tok', edits: { k: {} } });
  assert.deepEqual(loadEdits(s), { token: 'tok', edits: { k: {} } });
});

test('validPath accepts exactly the whitelist', () => {
  for (const p of ['summary', 'keyDefinitions.0.definition', 'killerFacts.3',
    'commonTraps.1', 'shortAnswers.2.question', 'shortAnswers.2.modelAnswer',
    'examQuestion.question', 'examQuestion.modelAnswer', 'mcq.5.explanation',
    'flashcards.1.back']) assert.ok(validPath(p), p);
  for (const p of ['mcq.0.correctIndex', 'mcq.0.options.1', 'title', 'id',
    '__proto__', 'keyDefinitions.0.term', 'flashcards.0.front',
    'summary.constructor', '']) assert.ok(!validPath(p), p);
});

test('getPath / setPath navigate dot-paths; setPath only overwrites strings', () => {
  const t = sampleContent().chapters[0].topics[0];
  assert.equal(getPath(t, 'keyDefinitions.0.definition'), 'ορισμός');
  assert.ok(setPath(t, 'summary', 'νέο'));
  assert.equal(t.summary, 'νέο');
  assert.ok(!setPath(t, 'mcq.0.correctIndex', 'x')); // invalid path refused
  assert.equal(t.mcq[0].correctIndex, 0);
  assert.ok(!setPath(t, 'killerFacts.9', 'x')); // missing target refused
});

test('applyEdits writes valid entries into content', () => {
  const c = sampleContent();
  applyEdits(c, { t1: { summary: { text: 'εκδοχή μου', committed: false },
                        'mcq.0.explanation': { text: 'καλύτερη', committed: true } } });
  assert.equal(c.chapters[0].topics[0].summary, 'εκδοχή μου');
  assert.equal(c.chapters[0].topics[0].mcq[0].explanation, 'καλύτερη');
});

test('pruneDeployed removes entries matching fetched content and orphans', () => {
  const c = sampleContent();
  const edits = {
    t1: { summary: { text: 'αρχικό', committed: true },          // deployed already
          'killerFacts.0': { text: 'άλλο', committed: false } },  // still differs
    tX: { summary: { text: 'ό,τι να ναι', committed: false } },   // topic gone
  };
  pruneDeployed(c, edits);
  assert.deepEqual(Object.keys(edits), ['t1']);
  assert.deepEqual(Object.keys(edits.t1), ['killerFacts.0']);
});

test('pendingList and pendingCount count committed:false only', () => {
  const data = { token: 't', edits: { kz: {
    t1: { summary: { text: 'α', committed: false },
          'killerFacts.0': { text: 'β', committed: true } },
    t2: { 'mcq.0.explanation': { text: 'γ', committed: false } },
  } } };
  assert.deepEqual(pendingList(data, 'kz'),
    [{ topicId: 't1', path: 'summary', text: 'α' },
     { topicId: 't2', path: 'mcq.0.explanation', text: 'γ' }]);
  assert.equal(pendingCount(data), 2);
  assert.equal(pendingCount(data, 'kz'), 2);
  assert.equal(pendingCount(data, 'kz', 't1'), 1);
  assert.equal(pendingCount(data, 'άλλο'), 0);
});

test('findTopic locates topics across chapters', () => {
  const c = sampleContent();
  assert.equal(findTopic(c, 't1').title, 'Θ1');
  assert.equal(findTopic(c, 'nope'), null);
});
