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
    // chapters 5 and 6 hold a LIST of exam questions - see js/views/topic.js
    'examQuestion.0.question', 'examQuestion.1.modelAnswer',
    'flashcards.1.back']) assert.ok(validPath(p), p);
  for (const p of ['mcq.0.correctIndex', 'mcq.0.options.1', 'title', 'id',
    '__proto__', 'keyDefinitions.0.term', 'flashcards.0.front',
    'summary.constructor', 'examQuestion.0', 'examQuestion.0.marks',
    '']) assert.ok(!validPath(p), p);
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

// --- I1: the remote moving away from `base` also retires an entry -----------

test('pruneDeployed drops an entry whose remote diverged from its base', () => {
  const c = sampleContent(); // summary is 'αρχικό'
  // The PC committed 'Α-κείμενο'; the iPad has since committed 'Β-κείμενο',
  // so the fetched value matches neither the entry text nor its base.
  const edits = { t1: { summary: { text: 'Α-κείμενο', base: 'Β-κείμενο', committed: true } } };
  pruneDeployed(c, edits);
  assert.deepEqual(edits, {}, 'a stale entry must not be re-applied forever');
});

test('pruneDeployed keeps an entry whose remote still equals its base', () => {
  const c = sampleContent();
  const edits = { t1: { summary: { text: 'δικό μου', base: 'αρχικό', committed: false } } };
  pruneDeployed(c, edits);
  assert.deepEqual(Object.keys(edits.t1), ['summary'], 'a live pending edit must survive');
});

test('pruneDeployed still prunes on text match even when base also matches', () => {
  const c = sampleContent();
  const edits = { t1: { summary: { text: 'αρχικό', base: 'αρχικό', committed: true } } };
  pruneDeployed(c, edits);
  assert.deepEqual(edits, {});
});

test('pruneDeployed prunes a based entry whose path no longer resolves', () => {
  const c = sampleContent();
  const edits = { t1: { 'killerFacts.7': { text: 'χ', base: 'ψ', committed: false } } };
  pruneDeployed(c, edits);
  assert.deepEqual(edits, {});
});

test('pruneDeployed leaves legacy entries (no base) to the old rule', () => {
  const c = sampleContent();
  const edits = { t1: { summary: { text: 'δικό μου', committed: false } } };
  pruneDeployed(c, edits);
  assert.deepEqual(Object.keys(edits.t1), ['summary']);
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

test('pendingList threads base through, and omits it for legacy entries', () => {
  const data = { token: 't', edits: { kz: {
    t1: { summary: { text: 'νέο', base: 'παλιό', committed: false },
          'killerFacts.0': { text: 'χ', committed: false } },   // legacy, no base
  } } };
  assert.deepEqual(pendingList(data, 'kz'), [
    { topicId: 't1', path: 'summary', text: 'νέο', base: 'παλιό' },
    { topicId: 't1', path: 'killerFacts.0', text: 'χ' },
  ]);
});

test('pendingList keeps an empty-string base (a real baseline, not "absent")', () => {
  const data = { token: 't', edits: { kz: { t1: { summary: { text: 'ν', base: '', committed: false } } } } };
  assert.deepEqual(pendingList(data, 'kz'), [{ topicId: 't1', path: 'summary', text: 'ν', base: '' }]);
});

test('findTopic locates topics across chapters', () => {
  const c = sampleContent();
  assert.equal(findTopic(c, 't1').title, 'Θ1');
  assert.equal(findTopic(c, 'nope'), null);
});
