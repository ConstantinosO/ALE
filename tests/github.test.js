// tests/github.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  b64EncodeUtf8, b64DecodeUtf8, serializeContent, getFile, putFile, commitEdits,
} from '../js/edit/github.js';

test('base64 round-trips Greek text', () => {
  const s = 'Ασφάλιση Ζωής — δοκιμή «τόνων» και ϊ ΰ';
  assert.equal(b64DecodeUtf8(b64EncodeUtf8(s)), s);
});

test('b64DecodeUtf8 tolerates newlines in API base64', () => {
  const b64 = b64EncodeUtf8('αβγ');
  const withNewlines = b64.match(/.{1,4}/g).join('\n');
  assert.equal(b64DecodeUtf8(withNewlines), 'αβγ');
});

test('serializeContent: 2-space indent, no trailing newline', () => {
  const out = serializeContent({ a: 1 });
  assert.equal(out, '{\n  "a": 1\n}');
  assert.ok(!out.endsWith('\n'));
});

function contentFixture() {
  return { courseId: 'kz', chapters: [{ id: 'c1', title: 'Κ', topics: [
    { id: 't1', title: 'Θ', summary: 'παλιό', keyDefinitions: [], killerFacts: [],
      commonTraps: [], mcq: [], shortAnswers: [], flashcards: [], examQuestion: null },
  ] }] };
}

function stubFetch(script) {
  // script: array of (url, opts) => Response-like; consumed in order
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, opts });
    return script.shift()(url, opts);
  };
  fn.calls = calls;
  return fn;
}

const okGet = (json, sha = 'sha1') => () => ({
  ok: true, status: 200,
  json: async () => ({ sha, content: b64EncodeUtf8(serializeContent(json)) }),
});
const okPut = () => (url, opts) => ({ ok: true, status: 200, json: async () => ({ ok: 1 }) });
const failPut = (status) => () => ({ ok: false, status, json: async () => ({}) });

test('getFile sends token header and decodes content', async () => {
  const f = stubFetch([okGet(contentFixture())]);
  const { sha, json } = await getFile('TOKEN', 'data/kz/content.json', f);
  assert.equal(sha, 'sha1');
  assert.equal(json.chapters[0].topics[0].summary, 'παλιό');
  assert.equal(f.calls[0].opts.headers.Authorization, 'Bearer TOKEN');
  assert.ok(f.calls[0].url.includes('repos/ConstantinosO/ALE/contents/data/kz/content.json'));
});

test('putFile threads sha and base64 body', async () => {
  const f = stubFetch([okPut()]);
  await putFile('TOKEN', 'data/kz/content.json', { a: 'ά' }, 'shaX', 'μήνυμα', f);
  const body = JSON.parse(f.calls[0].opts.body);
  assert.equal(f.calls[0].opts.method, 'PUT');
  assert.equal(body.sha, 'shaX');
  assert.equal(body.message, 'μήνυμα');
  assert.equal(b64DecodeUtf8(body.content), '{\n  "a": "ά"\n}');
});

test('commitEdits applies fields to the FETCHED copy and PUTs', async () => {
  const f = stubFetch([okGet(contentFixture()), okPut()]);
  const r = await commitEdits('T', 'kz', [{ topicId: 't1', path: 'summary', text: 'νέο' }], f);
  assert.deepEqual(r, { ok: true, applied: 1 });
  const body = JSON.parse(f.calls[1].opts.body);
  const pushed = JSON.parse(b64DecodeUtf8(body.content));
  assert.equal(pushed.chapters[0].topics[0].summary, 'νέο');
  assert.ok(body.message.includes('t1'));
});

test('commitEdits skips invalid paths and missing topics', async () => {
  const f = stubFetch([okGet(contentFixture())]);
  const r = await commitEdits('T', 'kz', [
    { topicId: 't1', path: 'mcq.0.correctIndex', text: 'x' },
    { topicId: 'ghost', path: 'summary', text: 'x' },
  ], f);
  assert.deepEqual(r, { ok: true, applied: 0 });
  assert.equal(f.calls.length, 1); // no PUT when nothing applies
});

test('commitEdits retries ONCE on sha conflict, then reports failure', async () => {
  const fRetryOk = stubFetch([okGet(contentFixture()), failPut(409),
    okGet(contentFixture(), 'sha2'), okPut()]);
  const r1 = await commitEdits('T', 'kz', [{ topicId: 't1', path: 'summary', text: 'ν' }], fRetryOk);
  assert.equal(r1.ok, true);
  assert.equal(JSON.parse(fRetryOk.calls[3].opts.body).sha, 'sha2');

  const fRetryFail = stubFetch([okGet(contentFixture()), failPut(409),
    okGet(contentFixture()), failPut(409)]);
  const r2 = await commitEdits('T', 'kz', [{ topicId: 't1', path: 'summary', text: 'ν' }], fRetryFail);
  assert.equal(r2.ok, false);
  assert.equal(fRetryFail.calls.length, 4); // exactly one retry
});

test('commitEdits reports non-conflict failures without retry', async () => {
  const f = stubFetch([okGet(contentFixture()), failPut(401)]);
  const r = await commitEdits('T', 'kz', [{ topicId: 't1', path: 'summary', text: 'ν' }], f);
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('401'));
  assert.equal(f.calls.length, 2);
});
