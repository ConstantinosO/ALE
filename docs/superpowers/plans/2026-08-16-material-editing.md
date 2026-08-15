# In-App Material Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user visually edit study-material prose (bold, underline, paragraphs, lists, wording) inside the app, with edits committed straight into `data/<courseId>/content.json` on GitHub.

**Architecture:** A four-marker plain-text format rendered by escape-then-format (`formatText`); a WYSIWYG `contenteditable` editor serialized back to markers (`serializeEditor`); a localStorage overlay (`ale.edits.v1`) for instant/offline visibility; a GitHub Contents API client that rewrites the canonical file with sha-conflict retry.

**Tech Stack:** Vanilla ES modules, zero npm dependencies, Node built-in test runner, GitHub Contents API.

**Spec:** `docs/superpowers/specs/2026-08-16-material-editing-design.md`

## Global Constraints

- Zero npm dependencies; no build step; vanilla ES modules only.
- Marker set is EXACTLY: blank line = paragraph, `**text**` = bold, `__text__` = underline, consecutive lines starting `1. `/`2. `… = numbered list, consecutive lines starting `- ` = bullet list. Nothing else (no headings, links, images).
- Escape-then-format everywhere: `formatText` escapes BEFORE converting markers. Raw content must never reach `innerHTML` unescaped.
- Round-trip invariant: `serializeEditor(parseHtml(formatText(s))) === s` for canonical marker strings.
- Edits + token live under localStorage key `ale.edits.v1` — NEVER inside `ale.v1` (keeps them out of sync snapshots by construction).
- Overlay path whitelist (regex, exact): `^(summary|keyDefinitions\.\d+\.definition|killerFacts\.\d+|commonTraps\.\d+|shortAnswers\.\d+\.(question|modelAnswer)|examQuestion\.(question|modelAnswer)|mcq\.\d+\.explanation|flashcards\.\d+\.back)$`
- GitHub target: `https://api.github.com/repos/ConstantinosO/ALE/contents/data/<courseId>/content.json`, header `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`.
- Commit serialization: `JSON.stringify(json, null, 2)` with **NO trailing newline** (matches the repo file byte-for-byte apart from edited fields).
- Base64 for the API body via `TextEncoder`/`TextDecoder` (plain `btoa` corrupts Greek).
- Tests run with `node --test tests/*.test.js` (a bare directory argument fails on Node v24/Windows).
- UI copy in Greek; some English labels acceptable.
- Without a stored token the app must render byte-for-byte as today (no ✏️ buttons, no behavior change).
- Editing UI never triggers a full view re-render mid-quiz (would lose quiz progress) — the editor restores content in place.
- Final task bumps `sw.js` cache name to `ale-v10`.

---

## File map

| File | Role |
|---|---|
| Create `js/core/format.js` | `formatText(s)` — markers → safe HTML (pure) |
| Create `js/edit/serialize.js` | `serializeEditor(root)` — DOM-like tree → markers (pure) |
| Create `js/edit/overlay.js` | `ale.edits.v1` load/save, path get/set, apply/prune, pending queries (pure) |
| Create `js/edit/github.js` | Contents API client + `commitEdits` (pure w/ injectable fetch) |
| Create `js/edit/editor.js` | edit-mode UI: toolbar, contenteditable, save/cancel, retry (DOM) |
| Create `tests/helpers/fakedom.js` | minimal HTML→fake-node parser for the closed tag set |
| Create `tests/format.test.js`, `tests/serialize.test.js`, `tests/overlay.test.js`, `tests/github.test.js` | unit tests |
| Modify `js/app.js` | overlay applied in `getContent`; startup retry of pending commits |
| Modify `js/views/topic.js` | prose regions + ✏️ per card + check-feedback explanation editing + pending pill |
| Modify `js/views/quiz.js` | explanation region + ✏️ in feedback |
| Modify `js/views/flashcards.js` | `formatText` back + ✏️ on flipped card |
| Modify `js/views/chaptertest.js`, `js/views/exam.js` | `formatText` for explanations (no ✏️) |
| Modify `js/views/settings.js` | token section, pending count + retry |
| Modify `css/app.css` | `.prose`, `.editing`, `.edittoolbar`, `.editbtn` styles |
| Modify `README.md` | Greek token-creation guide |
| Modify `sw.js` | cache bump `ale-v10` |

---

### Task 1: `formatText` — markers to safe HTML

**Files:**
- Create: `js/core/format.js`
- Test: `tests/format.test.js`

**Interfaces:**
- Consumes: `escapeHtml` from `js/ui.js` (exists).
- Produces: `formatText(s) -> string` — HTML safe for `innerHTML`; returns `''` for null/blank input (so `formatText(x) || fallback` works at render sites).

- [ ] **Step 1: Write the failing tests**

```js
// tests/format.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatText } from '../js/core/format.js';

test('plain text becomes one paragraph', () => {
  assert.equal(formatText('Απλό κείμενο.'), '<p>Απλό κείμενο.</p>');
});

test('blank or nullish input returns empty string', () => {
  assert.equal(formatText(''), '');
  assert.equal(formatText('   \n '), '');
  assert.equal(formatText(null), '');
  assert.equal(formatText(undefined), '');
});

test('blank line splits paragraphs', () => {
  assert.equal(formatText('Πρώτη.\n\nΔεύτερη.'), '<p>Πρώτη.</p><p>Δεύτερη.</p>');
});

test('single newline inside a paragraph becomes <br>', () => {
  assert.equal(formatText('γραμμή1\nγραμμή2'), '<p>γραμμή1<br>γραμμή2</p>');
});

test('bold and underline markers', () => {
  assert.equal(formatText('**έντονα** και __υπογράμμιση__'),
    '<p><b>έντονα</b> και <u>υπογράμμιση</u></p>');
});

test('nested bold/underline', () => {
  assert.equal(formatText('**__x__**'), '<p><b><u>x</u></b></p>');
  assert.equal(formatText('__**x**__'), '<p><u><b>x</b></u></p>');
});

test('unclosed markers stay literal', () => {
  assert.equal(formatText('**χωρίς κλείσιμο'), '<p>**χωρίς κλείσιμο</p>');
});

test('numbered list', () => {
  assert.equal(formatText('1. Ένα\n2. Δύο **δυνατά**'),
    '<ol><li>Ένα</li><li>Δύο <b>δυνατά</b></li></ol>');
});

test('bullet list', () => {
  assert.equal(formatText('- πρώτο\n- δεύτερο'), '<ul><li>πρώτο</li><li>δεύτερο</li></ul>');
});

test('mixed block is a paragraph, not a list', () => {
  assert.equal(formatText('1. Ένα\nκείμενο'), '<p>1. Ένα<br>κείμενο</p>');
});

test('paragraphs around a list', () => {
  assert.equal(formatText('Εισαγωγή:\n\n1. βήμα\n2. βήμα\n\nΤέλος.'),
    '<p>Εισαγωγή:</p><ol><li>βήμα</li><li>βήμα</li></ol><p>Τέλος.</p>');
});

test('HTML in content is escaped — XSS stays impossible', () => {
  const out = formatText('<script>alert(1)</script> & **<img src=x>**');
  assert.ok(!out.includes('<script'));
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(out.includes('<b>&lt;img src=x&gt;</b>'));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/format.test.js`
Expected: FAIL — cannot find module `js/core/format.js`.

- [ ] **Step 3: Implement**

```js
// js/core/format.js
import { escapeHtml } from '../ui.js';

// Inline markers AFTER escaping: escapeHtml never touches * or _.
function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<u>$1</u>');
}

// Escape-then-format. Blank line = paragraph; a block whose EVERY line
// starts "N. " is an <ol>; every line "- " is a <ul>; otherwise a <p>
// with single newlines as <br>. Anything malformed renders literally.
export function formatText(s) {
  const text = String(s ?? '');
  if (!text.trim()) return '';
  return text.split(/\n{2,}/).filter((b) => b.trim() !== '').map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\d+\.\s/.test(l))) {
      return `<ol>${lines.map((l) => `<li>${inline(escapeHtml(l.replace(/^\d+\.\s*/, '')))}</li>`).join('')}</ol>`;
    }
    if (lines.every((l) => /^-\s/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(escapeHtml(l.replace(/^-\s*/, '')))}</li>`).join('')}</ul>`;
    }
    return `<p>${lines.map((l) => inline(escapeHtml(l))).join('<br>')}</p>`;
  }).join('');
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/format.test.js` then `node --test tests/*.test.js`
Expected: all pass (61 existing + new).

- [ ] **Step 5: Commit**

```bash
git add js/core/format.js tests/format.test.js
git commit -m "feat: formatText — escape-then-format marker rendering"
```

---

### Task 2: `serializeEditor` + fake-DOM test parser

**Files:**
- Create: `js/edit/serialize.js`
- Create: `tests/helpers/fakedom.js`
- Test: `tests/serialize.test.js`

**Interfaces:**
- Consumes: `formatText` from `js/core/format.js` (Task 1) — round-trip tests only.
- Produces: `serializeEditor(root) -> string` where `root` is DOM-like: nodes expose only `nodeType` (1/3), `nodeName`, `textContent` (text nodes), `childNodes`. Also `parseHtml(html) -> fakeNode` in the test helper (NOT shipped in `js/`).

- [ ] **Step 1: Write the test helper**

```js
// tests/helpers/fakedom.js
// Minimal HTML -> fake-node parser. Covers ONLY the closed tag set that
// formatText emits (p, b, u, ol, ul, li, br) plus junk-wrapper tags the
// serializer must strip (span, font). Never shipped to the app.
function el(name) { return { nodeType: 1, nodeName: name, childNodes: [] }; }

function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

export function parseHtml(html) {
  const root = el('DIV');
  const stack = [root];
  const re = /<(\/)?([a-z0-9]+)(\s[^>]*)?>|([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      stack[stack.length - 1].childNodes.push(
        { nodeType: 3, nodeName: '#text', textContent: decode(m[4]), childNodes: [] });
    } else if (m[1]) {
      stack.pop();
    } else {
      const node = el(m[2].toUpperCase());
      stack[stack.length - 1].childNodes.push(node);
      if (node.nodeName !== 'BR') stack.push(node);
    }
  }
  return root;
}
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/serialize.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeEditor } from '../js/edit/serialize.js';
import { formatText } from '../js/core/format.js';
import { parseHtml } from './helpers/fakedom.js';

const CANONICAL = [
  'Απλό κείμενο.',
  'Πρώτη παράγραφος.\n\nΔεύτερη **σημαντική** παράγραφος.',
  '__Υπογράμμιση__ και **έντονα**.',
  '1. Ένα\n2. Δύο **δυνατά**\n3. Τρία',
  '- πρώτο\n- δεύτερο',
  'Εισαγωγή:\n\n1. βήμα\n2. βήμα\n\nΚατακλείδα.',
  'γραμμή1\nγραμμή2',
  '**__διπλό__** τέλος.',
];

for (const s of CANONICAL) {
  test(`round-trip: ${JSON.stringify(s.slice(0, 30))}`, () => {
    assert.equal(serializeEditor(parseHtml(formatText(s))), s);
  });
}

test('junk wrappers (span/font) are unwrapped to text', () => {
  const root = parseHtml('<p><span style="color:red">κείμενο</span> <font>ακόμη</font></p>');
  assert.equal(serializeEditor(root), 'κείμενο ακόμη');
});

test('empty blocks (blank divs) are dropped', () => {
  const root = parseHtml('<div>α</div><div><br></div><div>β</div>');
  assert.equal(serializeEditor(root), 'α\n\nβ');
});

test('divs serialize as paragraphs (contenteditable Enter)', () => {
  const root = parseHtml('<div>πρώτη</div><div>δεύτερη</div>');
  assert.equal(serializeEditor(root), 'πρώτη\n\nδεύτερη');
});

test('strong maps to ** like b', () => {
  const root = parseHtml('<p><strong>δυνατό</strong></p>');
  assert.equal(serializeEditor(root), '**δυνατό**');
});

test('loose text nodes at root form a paragraph', () => {
  const root = parseHtml('σκέτο <b>κείμενο</b>');
  assert.equal(serializeEditor(root), 'σκέτο **κείμενο**');
});

test('list items collapse internal newlines to spaces', () => {
  const root = parseHtml('<ol><li>ένα<br>δύο</li></ol>');
  assert.equal(serializeEditor(root), '1. ένα δύο');
});

test('whole-empty input serializes to empty string', () => {
  assert.equal(serializeEditor(parseHtml('<p><br></p>')), '');
  assert.equal(serializeEditor(parseHtml('')), '');
});
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test tests/serialize.test.js`
Expected: FAIL — cannot find module `js/edit/serialize.js`.

- [ ] **Step 4: Implement**

```js
// js/edit/serialize.js
// Walks a DOM-like tree (only nodeType, nodeName, textContent, childNodes)
// and emits canonical marker text. Everything not in the known set is
// unwrapped to its text — styles/spans/fonts injected by iOS or paste
// are discarded.

function inlineText(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return '';
  const name = node.nodeName.toUpperCase();
  if (name === 'BR') return '\n';
  const inner = [...node.childNodes].map(inlineText).join('');
  if (!inner.trim()) return inner;
  if (name === 'B' || name === 'STRONG') return `**${inner}**`;
  if (name === 'U') return `__${inner}__`;
  return inner;
}

const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE']);

export function serializeEditor(root) {
  const blocks = [];
  let run = null; // loose inline nodes accumulate into an implicit paragraph
  const endRun = () => { if (run !== null) { blocks.push(run); run = null; } };

  for (const child of root.childNodes) {
    const name = child.nodeType === 1 ? child.nodeName.toUpperCase() : '';
    if (name === 'OL' || name === 'UL') {
      endRun();
      const lines = [...child.childNodes]
        .filter((n) => n.nodeType === 1 && n.nodeName.toUpperCase() === 'LI')
        .map((li, i) => (name === 'OL' ? `${i + 1}. ` : '- ')
          + inlineText(li).replace(/\n+/g, ' ').trim());
      if (lines.length) blocks.push(lines.join('\n'));
    } else if (BLOCK.has(name)) {
      endRun();
      blocks.push(inlineText(child));
    } else {
      run = (run ?? '') + inlineText(child);
    }
  }
  endRun();

  return blocks
    .map((b) => b.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n'))
    .map((b) => b.replace(/\n{2,}/g, '\n').trim())
    .filter((b) => b !== '')
    .join('\n\n')
    .trim();
}
```

Note: numbered lists are renumbered from 1 on serialize — that IS the canonical form.

- [ ] **Step 5: Run tests, full suite**

Run: `node --test tests/serialize.test.js` then `node --test tests/*.test.js`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add js/edit/serialize.js tests/helpers/fakedom.js tests/serialize.test.js
git commit -m "feat: serializeEditor — DOM tree back to canonical markers"
```

---

### Task 3: Overlay module + `getContent` integration

**Files:**
- Create: `js/edit/overlay.js`
- Modify: `js/app.js:30-33` (`getContent`)
- Test: `tests/overlay.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 4–8):
  - `EDITS_KEY = 'ale.edits.v1'`
  - `loadEdits(storage) -> {token: string, edits: object}` (never throws)
  - `saveEdits(storage, data) -> boolean`
  - `validPath(path) -> boolean` (whitelist regex from Global Constraints)
  - `getPath(topic, path) -> string|undefined`, `setPath(topic, path, text) -> boolean` (both refuse invalid paths; setPath only overwrites existing strings)
  - `findTopic(content, topicId) -> topic|null`
  - `applyEdits(content, courseEdits) -> void` (mutates content)
  - `pruneDeployed(content, courseEdits) -> void` (deletes entries whose text equals the fetched field, and orphans whose topic is gone)
  - `pendingList(data, courseId) -> [{topicId, path, text}]` (committed:false only)
  - `pendingCount(data, courseId?, topicId?) -> number`
- Edits shape: `data.edits[courseId][topicId][path] = { text: string, committed: boolean }`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/overlay.test.js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/overlay.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```js
// js/edit/overlay.js
// Local edits layer: instant/offline visibility of material edits, and the
// GitHub token. Lives under its OWN localStorage key so it can never leak
// into ale.v1 progress snapshots.
export const EDITS_KEY = 'ale.edits.v1';

const PATH_RE = /^(summary|keyDefinitions\.\d+\.definition|killerFacts\.\d+|commonTraps\.\d+|shortAnswers\.\d+\.(question|modelAnswer)|examQuestion\.(question|modelAnswer)|mcq\.\d+\.explanation|flashcards\.\d+\.back)$/;

export function validPath(path) { return PATH_RE.test(String(path ?? '')); }

export function loadEdits(storage) {
  try {
    const raw = storage.getItem(EDITS_KEY);
    if (!raw) return { token: '', edits: {} };
    const d = JSON.parse(raw);
    return {
      token: typeof d.token === 'string' ? d.token : '',
      edits: d.edits && typeof d.edits === 'object' && !Array.isArray(d.edits) ? d.edits : {},
    };
  } catch { return { token: '', edits: {} }; }
}

export function saveEdits(storage, data) {
  try { storage.setItem(EDITS_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function getPath(topic, path) {
  if (!validPath(path)) return undefined;
  let cur = topic;
  for (const seg of String(path).split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function setPath(topic, path, text) {
  if (!validPath(path)) return false;
  const segs = String(path).split('.');
  let cur = topic;
  for (const seg of segs.slice(0, -1)) {
    if (cur == null || typeof cur !== 'object') return false;
    cur = cur[seg];
  }
  const last = segs[segs.length - 1];
  if (cur == null || typeof cur !== 'object' || typeof cur[last] !== 'string') return false;
  cur[last] = String(text);
  return true;
}

export function findTopic(content, topicId) {
  for (const ch of content?.chapters || []) {
    for (const t of ch.topics || []) if (t.id === topicId) return t;
  }
  return null;
}

export function applyEdits(content, courseEdits) {
  for (const [topicId, fields] of Object.entries(courseEdits || {})) {
    const topic = findTopic(content, topicId);
    if (!topic) continue;
    for (const [path, entry] of Object.entries(fields)) {
      if (entry && typeof entry.text === 'string') setPath(topic, path, entry.text);
    }
  }
}

// Call BEFORE applyEdits, on freshly fetched content: entries whose text is
// already deployed (or whose topic no longer exists) are finished with.
export function pruneDeployed(content, courseEdits) {
  for (const [topicId, fields] of Object.entries(courseEdits || {})) {
    const topic = findTopic(content, topicId);
    for (const [path, entry] of Object.entries(fields)) {
      if (!topic || getPath(topic, path) === entry.text) delete fields[path];
    }
    if (!Object.keys(fields).length) delete courseEdits[topicId];
  }
}

export function pendingList(data, courseId) {
  const out = [];
  for (const [topicId, fields] of Object.entries(data.edits[courseId] || {})) {
    for (const [path, entry] of Object.entries(fields)) {
      if (!entry.committed) out.push({ topicId, path, text: entry.text });
    }
  }
  return out;
}

export function pendingCount(data, courseId, topicId) {
  let n = 0;
  const courses = courseId
    ? { [courseId]: data.edits[courseId] || {} }
    : data.edits;
  for (const courseEdits of Object.values(courses)) {
    for (const [tid, fields] of Object.entries(courseEdits || {})) {
      if (topicId && tid !== topicId) continue;
      n += Object.values(fields).filter((e) => !e.committed).length;
    }
  }
  return n;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/overlay.test.js` then full suite.
Expected: all pass.

- [ ] **Step 5: Wire into `getContent` in `js/app.js`**

Replace lines 30–33:

```js
async function getContent(courseId) {
  if (!contentCache[courseId]) {
    const content = await loadContent(courseId);
    const editStore = loadEdits(window.localStorage);
    if (editStore.edits[courseId]) {
      pruneDeployed(content, editStore.edits[courseId]);
      if (!Object.keys(editStore.edits[courseId] || {}).length) delete editStore.edits[courseId];
      applyEdits(content, editStore.edits[courseId]);
      saveEdits(window.localStorage, editStore);
    }
    contentCache[courseId] = content;
  }
  return contentCache[courseId];
}
```

Add to the imports at the top of `js/app.js`:

```js
import { loadEdits, saveEdits, applyEdits, pruneDeployed } from './edit/overlay.js';
```

- [ ] **Step 6: Run full suite + quick browser sanity**

Run: `node --test tests/*.test.js` — all pass.
Load `http://localhost:8000` in the preview — dashboard renders normally (no edits stored → no behavior change).

- [ ] **Step 7: Commit**

```bash
git add js/edit/overlay.js tests/overlay.test.js js/app.js
git commit -m "feat: local edits overlay applied at content load"
```

---

### Task 4: GitHub Contents API client

**Files:**
- Create: `js/edit/github.js`
- Test: `tests/github.test.js`

**Interfaces:**
- Consumes: `validPath, getPath, setPath, findTopic` from `js/edit/overlay.js` (Task 3).
- Produces (used by Tasks 6–8):
  - `b64EncodeUtf8(s) -> string`, `b64DecodeUtf8(b64) -> string`
  - `serializeContent(json) -> string` — `JSON.stringify(json, null, 2)`, no trailing newline
  - `getFile(token, path, fetchFn = fetch) -> {sha, json}` (throws `Error('GitHub GET <status>')` on non-OK)
  - `putFile(token, path, json, sha, message, fetchFn = fetch) -> object`
  - `commitEdits(token, courseId, edits, fetchFn = fetch) -> {ok: true, applied: number} | {ok: false, error: string}` where `edits = [{topicId, path, text}]`. Fetches canonical file, applies ONLY those field changes to the fetched copy (never pushes local memory wholesale), PUTs with sha; on 409/422 refetches and retries ONCE.

- [ ] **Step 1: Write the failing tests**

```js
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
```

Note: Node ≥ 18 provides global `btoa`/`atob`/`TextEncoder`/`TextDecoder` — no imports needed in tests.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/github.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```js
// js/edit/github.js
// GitHub Contents API client. Every function takes an injectable fetchFn
// for tests. commitEdits NEVER pushes local memory wholesale — it applies
// field edits to the freshly fetched canonical copy, so edits from another
// device can't be clobbered.
import { getPath, setPath, findTopic } from './overlay.js';

const API = 'https://api.github.com/repos/ConstantinosO/ALE/contents/';

export function b64EncodeUtf8(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64DecodeUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// Matches the repo file: 2-space indent, no trailing newline.
export function serializeContent(json) {
  return JSON.stringify(json, null, 2);
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
}

export async function getFile(token, path, fetchFn = fetch) {
  const res = await fetchFn(API + path, { headers: headers(token), cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub GET ${res.status}`);
  const data = await res.json();
  return { sha: data.sha, json: JSON.parse(b64DecodeUtf8(data.content)) };
}

export async function putFile(token, path, json, sha, message, fetchFn = fetch) {
  const res = await fetchFn(API + path, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ message, sha, content: b64EncodeUtf8(serializeContent(json)) }),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${res.status}`);
  return res.json();
}

export async function commitEdits(token, courseId, edits, fetchFn = fetch) {
  const path = `data/${courseId}/content.json`;
  const attempt = async () => {
    const { sha, json } = await getFile(token, path, fetchFn);
    let applied = 0;
    for (const e of edits) {
      const topic = findTopic(json, e.topicId);
      if (topic && typeof getPath(topic, e.path) === 'string'
          && setPath(topic, e.path, e.text)) applied++;
    }
    if (!applied) return { ok: true, applied: 0 };
    const ids = [...new Set(edits.map((e) => e.topicId))].join(', ');
    const n = edits.length;
    const message = `edit: ${ids} (${n} ${n === 1 ? 'πεδίο' : 'πεδία'})`;
    await putFile(token, path, json, sha, message, fetchFn);
    return { ok: true, applied };
  };
  try {
    return await attempt();
  } catch (e) {
    if (!/PUT (409|422)/.test(e.message)) return { ok: false, error: e.message };
    try { return await attempt(); }
    catch (e2) { return { ok: false, error: e2.message }; }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/github.test.js` then full suite.
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/edit/github.js tests/github.test.js
git commit -m "feat: GitHub Contents API client with sha-conflict retry"
```

---

### Task 5: Editor UI module + CSS

**Files:**
- Create: `js/edit/editor.js`
- Modify: `css/app.css` (append)

**Interfaces:**
- Consumes: `formatText` (Task 1), `serializeEditor` (Task 2), overlay functions (Task 3), `commitEdits` (Task 4).
- Produces (used by Tasks 6–8):
  - `canEdit() -> boolean` — true when a token is stored
  - `editBtn(topicId, targetId?) -> string` — HTML for the ✏️ button; `targetId` overrides the default `closest('.card')` container
  - `wireEditing(rootEl, {courseId, content}) -> void` — call after every `innerHTML` render that includes `.editbtn`; removes the buttons when no token
  - `retryPendingAll() -> Promise<{retried: number}>` — commits all pending edits across courses
- View contract: each editable prose region is `<div class="prose" data-editpath="<path>">${formatText(text)}</div>` inside the same container as its ✏️ button, which carries `data-topic="<topicId>"`.

- [ ] **Step 1: Implement `js/edit/editor.js`**

No unit tests — DOM module; behavior verified in the browser in Tasks 6–8.

```js
// js/edit/editor.js
// In-place WYSIWYG editing of prose regions. No full view re-render on
// save/cancel (a re-render mid-quiz would lose quiz progress) — regions
// are restored in place.
import { formatText } from '../core/format.js';
import { serializeEditor } from './serialize.js';
import {
  loadEdits, saveEdits, getPath, setPath, findTopic, pendingList,
} from './overlay.js';
import { commitEdits } from './github.js';

export function canEdit() {
  return !!loadEdits(window.localStorage).token;
}

export function editBtn(topicId, targetId) {
  return `<button type="button" class="editbtn" data-topic="${topicId}"`
    + `${targetId ? ` data-target="${targetId}"` : ''} title="Επεξεργασία">✏️</button>`;
}

const TOOLBAR_HTML = `
  <div class="edittoolbar">
    <button type="button" class="btn" data-cmd="bold"><b>B</b></button>
    <button type="button" class="btn" data-cmd="underline"><u>U</u></button>
    <button type="button" class="btn" data-cmd="insertOrderedList">1.</button>
    <button type="button" class="btn" data-cmd="insertUnorderedList">•</button>
    <span class="grow"></span>
    <button type="button" class="btn btn-gold" data-act="save">Αποθήκευση</button>
    <button type="button" class="btn btn-ghost" data-act="cancel">Άκυρο</button>
  </div>
  <p class="muted editstatus"></p>`;

export function wireEditing(rootEl, { courseId, content }) {
  const btns = rootEl.querySelectorAll('.editbtn');
  if (!canEdit()) { btns.forEach((b) => b.remove()); return; }
  btns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const topic = findTopic(content, btn.dataset.topic);
      const container = btn.dataset.target
        ? document.getElementById(btn.dataset.target)
        : btn.closest('.card');
      if (topic && container && !container.parentElement?.querySelector('.edittoolbar')
          && !container.querySelector('.edittoolbar')) {
        enterEditMode(container, courseId, content, topic, btn);
      }
    });
  });
}

function enterEditMode(container, courseId, content, topic, btn) {
  // The container itself may be the region (flashcards) or hold several.
  const regions = container.matches?.('[data-editpath]')
    ? [container]
    : [...container.querySelectorAll('[data-editpath]')];
  const editable = regions.filter((r) => typeof getPath(topic, r.dataset.editpath) === 'string');
  if (!editable.length) return;

  btn.style.display = 'none';
  const originals = new Map();
  for (const r of editable) {
    const orig = getPath(topic, r.dataset.editpath);
    originals.set(r, orig);
    r.innerHTML = formatText(orig) || '<p><br></p>';
    r.contentEditable = 'true';
    r.classList.add('editing');
  }
  try { document.execCommand('styleWithCSS', false, 'false'); } catch { /* older engines */ }

  const bar = document.createElement('div');
  bar.innerHTML = TOOLBAR_HTML;
  container.parentElement.insertBefore(bar, container);
  const status = bar.querySelector('.editstatus');

  bar.querySelectorAll('[data-cmd]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
    b.addEventListener('click', () => document.execCommand(b.dataset.cmd));
  });

  const leave = () => {
    for (const r of editable) { r.contentEditable = 'false'; r.classList.remove('editing'); }
    btn.style.display = '';
  };

  bar.querySelector('[data-act="cancel"]').addEventListener('click', () => {
    for (const r of editable) r.innerHTML = formatText(originals.get(r));
    bar.remove();
    leave();
  });

  bar.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const changes = [];
    for (const r of editable) {
      const text = serializeEditor(r);
      if (text !== originals.get(r)) changes.push({ topicId: topic.id, path: r.dataset.editpath, text });
      r.innerHTML = formatText(text) || '<span class="muted">—</span>';
    }
    leave();
    if (!changes.length) { bar.remove(); return; }

    const store = loadEdits(window.localStorage);
    store.edits[courseId] ??= {};
    for (const c of changes) {
      (store.edits[courseId][c.topicId] ??= {})[c.path] = { text: c.text, committed: false };
      const real = findTopic(content, c.topicId);
      if (real) setPath(real, c.path, c.text);
    }
    saveEdits(window.localStorage, store);

    status.textContent = 'Αποθηκεύτηκε τοπικά — καταχώρηση στο GitHub…';
    const result = await commitEdits(store.token, courseId, pendingList(store, courseId));
    if (result.ok) {
      const fresh = loadEdits(window.localStorage);
      for (const fields of Object.values(fresh.edits[courseId] || {})) {
        for (const entry of Object.values(fields)) entry.committed = true;
      }
      saveEdits(window.localStorage, fresh);
      status.textContent = '✅ Καταχωρήθηκε στο GitHub.';
    } else {
      status.textContent = '⚠️ Εκκρεμεί — νέα προσπάθεια στην επόμενη αποθήκευση ή από τις Ρυθμίσεις.';
    }
    setTimeout(() => bar.remove(), 2500);
  });
}

export async function retryPendingAll() {
  const store = loadEdits(window.localStorage);
  if (!store.token) return { retried: 0 };
  let retried = 0;
  for (const courseId of Object.keys(store.edits)) {
    const pending = pendingList(store, courseId);
    if (!pending.length) continue;
    const result = await commitEdits(store.token, courseId, pending);
    if (result.ok) {
      for (const p of pending) store.edits[courseId][p.topicId][p.path].committed = true;
      retried += pending.length;
    }
  }
  saveEdits(window.localStorage, store);
  return { retried };
}
```

Note on `document.execCommand`: deprecated but universally supported (Chrome, Safari incl. iOS) for bold/underline/insertOrderedList/insertUnorderedList, and the only zero-dependency way to get selection-based formatting. `styleWithCSS=false` keeps output as `<b>`/`<u>` elements, which `serializeEditor` understands; anything else a browser injects is stripped to text by design.

- [ ] **Step 2: Append CSS to `css/app.css`**

First read `css/app.css` to confirm the CSS custom-property names for card background and gold (`var(--gold)` is used in `js/views/flashcards.js:49`, so `--gold` exists; find the card background variable and use it in `.edittoolbar`). Then append:

```css
/* --- material editing --- */
.prose p { margin: 0 0 10px; }
.prose p:last-child { margin-bottom: 0; }
.prose ol, .prose ul { margin: 0 0 10px; padding-left: 22px; }
.prose ol:last-child, .prose ul:last-child { margin-bottom: 0; }
.editbtn { background: none; border: none; cursor: pointer; font-size: 15px; opacity: .55; padding: 2px 6px; }
.editbtn:hover { opacity: 1; }
.editing { outline: 2px dashed var(--gold); outline-offset: 4px; border-radius: 4px; min-height: 1.4em; }
.edittoolbar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; position: sticky; top: 0; z-index: 5; padding: 6px 0; /* background: use the card background variable found above */ }
.edittoolbar [data-cmd] { min-width: 38px; padding: 6px 8px; }
.editstatus:empty { display: none; }
```

- [ ] **Step 3: Run full suite (no regressions), commit**

Run: `node --test tests/*.test.js`

```bash
git add js/edit/editor.js css/app.css
git commit -m "feat: WYSIWYG edit-mode module (toolbar, in-place save, pending retry)"
```

---

### Task 6: Topic view integration

**Files:**
- Modify: `js/views/topic.js`

**Interfaces:**
- Consumes: `formatText` (Task 1); `editBtn`, `wireEditing` (Task 5); `loadEdits`, `pendingCount` (Task 3).
- Produces: the view contract pattern other views copy.

- [ ] **Step 1: Update imports in `js/views/topic.js`**

```js
import { escapeHtml } from '../ui.js';
import { formatText } from '../core/format.js';
import { editBtn, wireEditing } from '../edit/editor.js';
import { loadEdits, pendingCount } from '../edit/overlay.js';
```

(keep the existing `allTopics`, progress, stats imports.)

- [ ] **Step 2: Replace the static cards (current lines 38–74)**

Header row gains a pending pill; each prose card gains `editBtn(topic.id)` and `data-editpath` regions. Replace the `el.innerHTML` template with:

```js
  const pending = pendingCount(loadEdits(window.localStorage), courseId, topicId);

  el.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <a class="btn btn-ghost" href="#/course/${courseId}">← Πίσω</a>
      <span class="grow muted">${idx >= 0 ? `${idx + 1}/${topics.length}` : ''}</span>
      ${pending ? '<span class="pill">εκκρεμεί ⟳</span>' : ''}
      <span class="pill">Completion ${Number(p.mastery) || 0}%</span>
      ${p.weak ? '<span class="pill pill-bad">αδύναμο</span>' : ''}
    </div>
    <div class="card">
      <div class="row"><h2 class="grow">${escapeHtml(topic.title)}</h2>${editBtn(topic.id)}</div>
      <p class="muted">${escapeHtml(topic.chapterTitle)}</p>
      <div class="prose" data-editpath="summary">${formatText(topic.summary) || '<span class="muted">Χωρίς σύνοψη.</span>'}</div>
    </div>
    ${topic.keyDefinitions.length ? `<div class="card">
      <div class="row"><h2 class="grow">📖 Βασικοί ορισμοί</h2>${editBtn(topic.id)}</div>
      ${topic.keyDefinitions.map((d, i) => `<p style="margin-bottom:2px"><b>${escapeHtml(d.term)}:</b></p>
        <div class="prose" data-editpath="keyDefinitions.${i}.definition" style="margin-bottom:10px">${formatText(d.definition)}</div>`).join('')}
    </div>` : ''}
    ${topic.killerFacts.length ? `<div class="card">
      <div class="row"><h2 class="grow">💡 Κρίσιμα σημεία</h2>${editBtn(topic.id)}</div>
      <ul>${topic.killerFacts.map((f, i) => `<li><div class="prose" data-editpath="killerFacts.${i}">${formatText(f)}</div></li>`).join('')}</ul>
    </div>` : ''}
    ${topic.commonTraps.length ? `<div class="card">
      <div class="row"><h2 class="grow">⚠️ Συνήθεις παγίδες</h2>${editBtn(topic.id)}</div>
      <ul>${topic.commonTraps.map((f, i) => `<li><div class="prose" data-editpath="commonTraps.${i}">${formatText(f)}</div></li>`).join('')}</ul>
    </div>` : ''}
    ${(topic.shortAnswers || []).length ? `<div class="card">
      <div class="row"><h2 class="grow">✍️ Ερωτήσεις σύντομης απάντησης</h2>${editBtn(topic.id)}</div>
      ${topic.shortAnswers.map((s, i) => `<div class="prose" data-editpath="shortAnswers.${i}.question">${formatText(s.question)}</div>
      <details><summary>Υπόδειγμα απάντησης</summary><div class="prose" data-editpath="shortAnswers.${i}.modelAnswer">${formatText(s.modelAnswer)}</div></details>`).join('')}
    </div>` : ''}
    ${topic.examQuestion ? `<div class="card">
      <div class="row"><h2 class="grow">📝 Θέμα εξέτασης (${topic.examQuestion.marks} μονάδες)</h2>${editBtn(topic.id)}</div>
      <div class="prose" data-editpath="examQuestion.question">${formatText(topic.examQuestion.question)}</div>
      <details><summary>Υπόδειγμα απάντησης</summary><div class="prose" data-editpath="examQuestion.modelAnswer">${formatText(topic.examQuestion.modelAnswer)}</div></details>
    </div>` : ''}
    <div class="card" id="check">
      ... (check card and navRow UNCHANGED from current file)
    </div>
    ${navRow(true)}
  `;

  wireEditing(el, { courseId, content });
```

(The `navRow` helper, `#check` card, and everything below stay exactly as they are — only the content cards above change.)

- [ ] **Step 3: Editable explanation in the check feedback**

In `showQuestion()`, replace the feedback assignment (current lines 114–116):

```js
          document.getElementById('checkfeedback').innerHTML = `
            <p><b>${correct ? '✅ Σωστό!' : '❌ Λάθος.'}</b></p>
            <div class="row">
              <div class="grow prose" data-editpath="mcq.${topic.mcq.indexOf(q)}.explanation">${formatText(q.explanation)}</div>
              ${editBtn(topic.id)}
            </div>
            <button class="btn btn-gold btn-block" id="checknext">${i + 1 < questions.length ? 'Επόμενη' : 'Ολοκλήρωση'}</button>`;
          wireEditing(document.getElementById('checkfeedback'), { courseId, content });
```

`topic.mcq.indexOf(q)` is correct because `checkQuestions` reorders the same objects (identity preserved). The editor saves in place without re-rendering, so quiz progress is safe.

- [ ] **Step 4: Verify in browser**

Run full suite first: `node --test tests/*.test.js`.
In the preview (`http://localhost:8000/#/topic/klados-zois/<some-id>`, hard-reload with `?v=N`):
- Without a token in `ale.edits.v1`: page renders as before, NO ✏️ anywhere.
- Seed a token: `localStorage.setItem('ale.edits.v1', JSON.stringify({token:'x', edits:{}}))`, reload: ✏️ appears on each prose card.
- Click ✏️ on the summary: region outlined, toolbar shows; select a word, press **B**; add a paragraph with Enter; Save → text re-renders with bold + paragraphs; status shows "⚠️ Εκκρεμεί" (token 'x' is invalid — expected). Reload → edit persists (overlay), "εκκρεμεί ⟳" pill in header.
- Cancel path: edit, press Άκυρο → original text restored.
- Clean up: `localStorage.removeItem('ale.edits.v1')`, reload → pristine.

- [ ] **Step 5: Commit**

```bash
git add js/views/topic.js
git commit -m "feat: editable prose regions in topic view"
```

---

### Task 7: Quiz, flashcards, chapter-test, exam integration

**Files:**
- Modify: `js/views/quiz.js`, `js/views/flashcards.js`, `js/views/chaptertest.js`, `js/views/exam.js`

**Interfaces:**
- Consumes: `formatText` (Task 1); `editBtn`, `wireEditing` (Task 5); `findTopic` (Task 3).
- Produces: nothing new.

- [ ] **Step 1: `js/views/quiz.js` — editable explanation in feedback**

Add imports:

```js
import { formatText } from '../core/format.js';
import { editBtn, wireEditing } from '../edit/editor.js';
import { findTopic } from '../edit/overlay.js';
```

Replace the feedback assignment (current lines 70–72):

```js
        const qi = findTopic(content, topicId)?.mcq.indexOf(q) ?? -1;
        document.getElementById('feedback').innerHTML = `
          <p><b>${correct ? '✅ Σωστό!' : '❌ Λάθος.'}</b></p>
          <div class="row">
            <div class="grow prose"${qi >= 0 ? ` data-editpath="mcq.${qi}.explanation"` : ''}>${formatText(q.explanation)}</div>
            ${qi >= 0 ? editBtn(topicId) : ''}
          </div>
          <button class="btn btn-gold btn-block" id="next">${i + 1 < questions.length ? 'Επόμενη' : 'Ολοκλήρωση'}</button>`;
        wireEditing(document.getElementById('feedback'), { courseId, content });
```

(`qi` can be -1 only if the picker ever copies question objects; guard keeps it safe.) Keep the existing `#next` listener line right after, unchanged.

- [ ] **Step 2: `js/views/flashcards.js` — formatted back + ✏️ when flipped**

Add imports:

```js
import { formatText } from '../core/format.js';
import { editBtn, wireEditing } from '../edit/editor.js';
```

Change the cards flatMap (current line 17) to carry the original index:

```js
  const cards = ts.flatMap((t) => t.flashcards.map((f, fi) => ({ topicId: t.id, topicTitle: t.title, f, fi })));
```

Update `show()`'s destructuring to `const { topicId, topicTitle, f, fi } = cards[i];` and replace the flip handler body (current lines 45–54) with:

```js
    card.addEventListener('click', () => {
      if (flipped) return;
      flipped = true;
      card.innerHTML = formatText(f.back);
      card.classList.add('prose');
      card.dataset.editpath = `flashcards.${fi}.back`;
      card.style.borderColor = 'var(--gold)';
      document.getElementById('actions').innerHTML = `
        <div class="row">
          <button class="btn grow" id="no">❌ Δεν το ήξερα</button>
          <button class="btn btn-gold grow" id="yes">✅ Το ήξερα</button>
          ${editBtn(topicId, 'card')}
        </div>`;
      wireEditing(document.getElementById('actions'), { courseId, content });
      // ...grade handlers unchanged
```

The ✏️ uses `data-target="card"` so the edit container is the flashcard div itself (it IS the region — `enterEditMode` handles `container.matches('[data-editpath]')`). Clicking inside to edit is safe: the flip handler exits early once `flipped` is true.

- [ ] **Step 3: `js/views/chaptertest.js` and `js/views/exam.js` — formatText only, no ✏️**

In each file: add `import { formatText } from '../core/format.js';` and replace every `escapeHtml(q.explanation)` with `formatText(q.explanation)` (grep first: `grep -n "escapeHtml(q.explanation)" js/views/chaptertest.js js/views/exam.js`). Chapter tests and mock exams stay pencil-free by design.

- [ ] **Step 4: Verify**

Full suite passes. In the preview with a dummy token: quiz feedback shows ✏️ beside the explanation, editing works in place and the quiz continues afterwards (answer streak preserved); flashcard back shows ✏️ after flip; chapter test still renders explanations (formatted, no pencil).

- [ ] **Step 5: Commit**

```bash
git add js/views/quiz.js js/views/flashcards.js js/views/chaptertest.js js/views/exam.js
git commit -m "feat: formatted + editable explanations and flashcard backs"
```

---

### Task 8: Settings token section, startup retry, README, deploy

**Files:**
- Modify: `js/views/settings.js`, `js/app.js`, `README.md`, `sw.js`

**Interfaces:**
- Consumes: `loadEdits`, `saveEdits`, `pendingCount` (Task 3); `getFile` (Task 4); `retryPendingAll` (Task 5).
- Produces: user-facing token management; automatic retry on app start.

- [ ] **Step 1: Token card in `js/views/settings.js`**

Add imports:

```js
import { loadEdits, saveEdits, pendingCount } from '../edit/overlay.js';
import { getFile } from '../edit/github.js';
import { retryPendingAll } from '../edit/editor.js';
```

Insert this card into the template between the badges card and the sync card:

```js
    <div class="card">
      <h2>✏️ Επεξεργασία ύλης</h2>
      <p class="muted">Με GitHub token οι αλλαγές σου στην ύλη αποθηκεύονται μόνιμα για όλες τις συσκευές. Οδηγίες δημιουργίας: δες το README στο GitHub.</p>
      <div class="row">
        <input type="password" id="ghtoken" placeholder="github_pat_…" autocomplete="off" class="grow">
        <button class="btn" id="savetoken">Αποθήκευση</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn btn-ghost" id="testtoken">Έλεγχος σύνδεσης</button>
        <button class="btn btn-ghost" id="removetoken">Αφαίρεση token</button>
        <button class="btn btn-ghost" id="retrypending">⟳ Εκκρεμείς (<span id="pendingn"></span>)</button>
      </div>
      <p class="muted" id="tokenmsg"></p>
    </div>
```

And the handlers at the bottom of `render` (note: never render the token value back into the DOM):

```js
  const tokenMsg = document.getElementById('tokenmsg');
  const refreshTokenUi = () => {
    const store = loadEdits(window.localStorage);
    document.getElementById('ghtoken').placeholder = store.token ? '••••••• (αποθηκευμένο)' : 'github_pat_…';
    document.getElementById('removetoken').style.display = store.token ? '' : 'none';
    const n = pendingCount(store);
    document.getElementById('pendingn').textContent = n;
    document.getElementById('retrypending').style.display = n ? '' : 'none';
  };
  refreshTokenUi();

  document.getElementById('savetoken').addEventListener('click', () => {
    const v = document.getElementById('ghtoken').value.trim();
    if (!v) return;
    const store = loadEdits(window.localStorage);
    store.token = v;
    saveEdits(window.localStorage, store);
    document.getElementById('ghtoken').value = '';
    tokenMsg.textContent = '✅ Το token αποθηκεύτηκε σε αυτή τη συσκευή.';
    refreshTokenUi();
  });

  document.getElementById('testtoken').addEventListener('click', async () => {
    const store = loadEdits(window.localStorage);
    if (!store.token) { tokenMsg.textContent = 'ℹ️ Δεν υπάρχει αποθηκευμένο token.'; return; }
    tokenMsg.textContent = 'Έλεγχος…';
    try {
      await getFile(store.token, 'data/courses.json');
      tokenMsg.textContent = '✅ Η σύνδεση με το GitHub λειτουργεί.';
    } catch (e) {
      tokenMsg.textContent = `⚠️ Αποτυχία σύνδεσης (${e.message}). Έλεγξε το token.`;
    }
  });

  document.getElementById('removetoken').addEventListener('click', () => {
    const store = loadEdits(window.localStorage);
    store.token = '';
    saveEdits(window.localStorage, store);
    tokenMsg.textContent = 'Το token αφαιρέθηκε. Οι τοπικές αλλαγές παραμένουν.';
    refreshTokenUi();
  });

  document.getElementById('retrypending').addEventListener('click', async () => {
    tokenMsg.textContent = 'Καταχώρηση εκκρεμών αλλαγών…';
    const { retried } = await retryPendingAll();
    tokenMsg.textContent = retried ? `✅ Καταχωρήθηκαν ${retried} αλλαγές.` : '⚠️ Δεν καταχωρήθηκε τίποτα — έλεγξε token/σύνδεση.';
    refreshTokenUi();
  });
```

- [ ] **Step 2: Startup retry in `js/app.js`**

Add import `import { retryPendingAll } from './edit/editor.js';` and after the initial `render();` call at the bottom:

```js
render();
retryPendingAll().catch(() => {}); // fire-and-forget: commit any pending edits
```

- [ ] **Step 3: README token guide (Greek)**

Append to `README.md`:

```markdown
## Επεξεργασία ύλης από την εφαρμογή

Οι αλλαγές στην ύλη (μορφοποίηση, διορθώσεις) γίνονται μέσα από την εφαρμογή
και αποθηκεύονται μόνιμα στο αρχείο `data/<μάθημα>/content.json` αυτού του
αποθετηρίου. Χρειάζεται ένα GitHub token **μία φορά ανά συσκευή**:

1. Άνοιξε github.com → Settings → Developer settings →
   **Fine-grained personal access tokens** → Generate new token.
2. Resource owner: ο λογαριασμός σου. **Repository access: Only select
   repositories → ConstantinosO/ALE** (μόνο αυτό).
3. Permissions → Repository permissions → **Contents: Read and write**.
   Τίποτα άλλο.
4. Expiration: ό,τι προτιμάς (π.χ. 1 έτος). Generate & αντίγραψε το token.
5. Στην εφαρμογή: Ρυθμίσεις → «Επεξεργασία ύλης» → επικόλλησε το token →
   Αποθήκευση → Έλεγχος σύνδεσης.

Χωρίς token η εφαρμογή λειτουργεί κανονικά, απλώς χωρίς κουμπιά ✏️ —
ασφαλής για να τη μοιραστείς με άλλον μαθητή. Το token μένει μόνο στη
συσκευή (localStorage) και δεν μπαίνει ποτέ στα αρχεία συγχρονισμού προόδου.
```

- [ ] **Step 4: Bump SW cache**

In `sw.js` line 1: `const CACHE = 'ale-v10';`

- [ ] **Step 5: Full suite + browser verification**

Run: `node --test tests/*.test.js` — all pass.
Preview: Settings shows the token card; save a dummy token → ✏️ buttons appear across views; Έλεγχος σύνδεσης fails cleanly with the dummy token; Αφαίρεση works; no-token state hides pencils again.

- [ ] **Step 6: Commit and push**

```bash
git add js/views/settings.js js/app.js README.md sw.js
git commit -m "feat: GitHub token settings, startup retry of pending edits; SW ale-v10"
git push
```

Then verify the deployment: poll `https://constantinoso.github.io/ALE/sw.js` until it contains `ale-v10`.

- [ ] **Step 7: Real-token end-to-end test (with the user)**

This step needs the user's real fine-grained token — creating and pasting credentials is theirs to do. Once they've saved it on one device: edit one summary field, confirm a commit lands on `main` (message `edit: <topicId> (1 πεδίο)`), confirm the field diff is minimal (only the edited string changes in `content.json`), and confirm a second browser/device shows the edit after the Pages redeploy. If the user is away, leave this step pending and say so in the completion report.

---

## Verification checklist (whole feature)

- `node --test tests/*.test.js` — everything green.
- No token → app byte-identical behavior, zero pencils.
- Round-trip: edit without changing anything → Save → "no changes" path (no commit, no overlay entry).
- XSS: paste `<img src=x onerror=alert(1)>` into the editor, save → renders as literal text everywhere.
- Offline: airplane-mode save → pending pill → retry succeeds later.
- Greek text survives: commit body decodes correctly on GitHub (spot-check the diff).
- Snapshot export from Ρυθμίσεις contains NO `token` and NO `edits` keys.
