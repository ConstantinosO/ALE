# ALE HTML Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the ALE insurance-exam learning platform as a pure static HTML/CSS/JS app (Greek UI, adaptive quizzes, spaced repetition, manual sync), deployable to GitHub Pages.

**Architecture:** Single-page app: `index.html` shell + hash router; pure-logic core modules (`js/core/`) tested with Node's built-in test runner; DOM views (`js/views/`) verified in browser preview. Study content is static JSON under `data/`, generated offline by Claude Code. Progress lives in localStorage with export/import merge.

**Tech Stack:** Vanilla ES modules, CSS custom properties, `node --test` for logic tests, Python `http.server` for local preview, GitHub Pages for hosting. **Zero npm dependencies, no build step.**

**Spec:** `docs/superpowers/specs/2026-08-15-ale-html-rebuild-design.md` (approved 2026-08-15).

## Global Constraints

- All UI strings in **Greek**. No English UI.
- Spaced-repetition intervals exactly `[1, 3, 7, 10, 14, 19]` days; wrong answer resets to index 0 (1 day).
- XP per correct answer: `{easy: 10, medium: 20, hard: 30}`.
- Mastery: EMA of correctness with α = 0.2, scaled by difficulty cap `{easy: 50, medium: 80, hard: 100}`, rounded.
- Difficulty ladder: 3 consecutive correct promotes (easy→medium→hard); 2 consecutive incorrect demotes.
- Weak flag: `consecIncorrect >= 2` OR (≥5 answers AND mastery < 40).
- Default exam date `2026-10-03`, user-editable in Ρυθμίσεις (stored in localStorage settings, overrides `courses.json`).
- Courses: `klados-zois` (Κλάδος Ζωής, status `active`), `basikes-arxes` (Βασικές Αρχές Ασφαλίσεων, status `passed`). Passed courses: excluded from dashboard due-review queue, fully studyable on demand.
- Colors: navy `#111228`, gold `#F5B818` (Servtech palette); light + dark themes via `prefers-color-scheme`.
- localStorage key: `ale.v1`. Snapshot/export format version: `1`.
- Tests run with `node --test tests/` — requires Node ≥ 18. **If `node` is not on PATH**, use the portable Node used by the UBUCO project (check `C:\Users\constantinos.o\UBUCO` tooling or ask the user) via its full path.
- Local preview: static server on port 8000 (`python -m http.server 8000` via `.claude/launch.json`). `fetch()` of JSON fails on `file://` — always preview through the server.
- Commit after every task (git repo already initialized at `C:\Users\constantinos.o\ALE`, branch `main`). Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Mutating state: views mutate the shared `state` object then call `ctx.save()`. Core modules stay pure (no DOM, no localStorage, no `Date.now()` defaults — time is always a parameter).

---

### Task 1: Scaffold + hash router

**Files:**
- Create: `package.json`, `.gitignore`, `.nojekyll`, `index.html`, `css/app.css`, `js/app.js`, `js/router.js`, `js/ui.js`, `.claude/launch.json`
- Test: `tests/router.test.js`

**Interfaces:**
- Produces: `parseRoute(hash) -> {view: string, params: object}` (js/router.js); `escapeHtml(s) -> string` (js/ui.js); app shell with `<main id="view">` and bottom nav; CSS custom properties consumed by all later views.

- [ ] **Step 1: Verify Node is available**

Run: `node --version`
Expected: v18+ printed. If not found, locate the UBUCO portable node and use its full path for all `node` commands in this plan.

- [ ] **Step 2: Write config files**

`package.json`:
```json
{
  "name": "ale",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/" }
}
```

`.gitignore`:
```
Thumbs.db
Desktop.ini
```

`.nojekyll`: empty file (prevents GitHub Pages Jekyll processing).

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "ale", "runtimeExecutable": "python", "runtimeArgs": ["-m", "http.server", "8000"], "port": 8000 }
  ]
}
```

- [ ] **Step 3: Write the failing router test**

`tests/router.test.js`:
```js
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

test('unknown or incomplete routes fall back to dashboard', () => {
  assert.equal(parseRoute('#/nonsense').view, 'dashboard');
  assert.equal(parseRoute('#/course').view, 'dashboard');
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test tests/` — Expected: FAIL (cannot find `../js/router.js`).

- [ ] **Step 5: Implement router and ui helpers**

`js/router.js`:
```js
export function parseRoute(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, a, b] = parts;
  switch (head) {
    case undefined: return { view: 'dashboard', params: {} };
    case 'course': return a ? { view: 'course', params: { courseId: a } } : { view: 'dashboard', params: {} };
    case 'topic': return (a && b) ? { view: 'topic', params: { courseId: a, topicId: b } } : { view: 'dashboard', params: {} };
    case 'quiz': return (a && b) ? { view: 'quiz', params: { courseId: a, mode: b } } : { view: 'dashboard', params: {} };
    case 'flashcards': return a ? { view: 'flashcards', params: { courseId: a } } : { view: 'dashboard', params: {} };
    case 'exam': return a ? { view: 'exam', params: { courseId: a } } : { view: 'dashboard', params: {} };
    case 'analysis': return a ? { view: 'analysis', params: { courseId: a } } : { view: 'dashboard', params: {} };
    case 'settings': return { view: 'settings', params: {} };
    default: return { view: 'dashboard', params: {} };
  }
}
```

`js/ui.js`:
```js
export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/` — Expected: all PASS.

- [ ] **Step 7: Write the app shell**

`index.html`:
```html
<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>ALE — Μηχανή Προσαρμοστικής Μάθησης</title>
  <meta name="theme-color" content="#111228">
  <link rel="stylesheet" href="css/app.css">
</head>
<body>
  <header class="topbar">
    <a href="#/" class="brand">ALE</a>
    <span id="countdown" class="countdown"></span>
  </header>
  <main id="view" class="view"></main>
  <nav class="bottomnav">
    <a href="#/">🏠 Αρχική</a>
    <a href="#/settings">⚙️ Ρυθμίσεις</a>
  </nav>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

`js/app.js` (this task's minimal version — views wired in later tasks):
```js
import { parseRoute } from './router.js';

const container = document.getElementById('view');

async function render() {
  const route = parseRoute(location.hash);
  container.innerHTML = `<p class="muted">Προβολή: ${route.view}</p>`;
}

window.addEventListener('hashchange', render);
render();
```

`css/app.css` — full stylesheet used by every later view:
```css
:root {
  --navy: #111228; --gold: #F5B818;
  --bg: #f6f7fb; --card: #ffffff; --text: #1a1c2e; --muted: #6a6f85;
  --border: #e3e5ee; --ok: #1f9d55; --bad: #d64545;
  --radius: 14px; --shadow: 0 1px 4px rgba(17, 18, 40, .08);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d0e1c; --card: #191b30; --text: #eceef8; --muted: #9aa0b8;
    --border: #2a2d47; --shadow: 0 1px 4px rgba(0, 0, 0, .4);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  padding-bottom: 76px;
}
.topbar {
  position: sticky; top: 0; z-index: 10; display: flex; align-items: center;
  justify-content: space-between; padding: 12px 16px; background: var(--navy);
  color: #fff; padding-top: max(12px, env(safe-area-inset-top));
}
.brand { color: var(--gold); font-weight: 800; font-size: 20px; text-decoration: none; letter-spacing: 1px; }
.countdown { font-size: 13px; color: #cfd2e4; }
.countdown b { color: var(--gold); }
.view { max-width: 720px; margin: 0 auto; padding: 16px; }
.bottomnav {
  position: fixed; bottom: 0; left: 0; right: 0; display: flex; z-index: 10;
  background: var(--card); border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom);
}
.bottomnav a {
  flex: 1; text-align: center; padding: 12px 0; text-decoration: none;
  color: var(--muted); font-size: 14px; font-weight: 600;
}
.card {
  background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 16px; margin-bottom: 12px;
}
.card h2 { margin: 0 0 8px; font-size: 17px; }
.card h3 { margin: 12px 0 6px; font-size: 15px; }
.muted { color: var(--muted); }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.grow { flex: 1; }
button, .btn {
  display: inline-block; border: 0; border-radius: 10px; padding: 10px 16px;
  background: var(--navy); color: #fff; font-weight: 700; font-size: 15px;
  cursor: pointer; text-decoration: none; text-align: center;
}
.btn-gold { background: var(--gold); color: var(--navy); }
.btn-ghost { background: transparent; color: var(--text); border: 1px solid var(--border); }
.btn-block { display: block; width: 100%; margin-bottom: 8px; }
.bar { height: 8px; border-radius: 4px; background: var(--border); overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--gold); }
.bar.hi > span { background: var(--ok); }
.pill {
  display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px;
  font-weight: 700; background: var(--border); color: var(--muted);
}
.pill-gold { background: var(--gold); color: var(--navy); }
.pill-bad { background: var(--bad); color: #fff; }
.pill-ok { background: var(--ok); color: #fff; }
.stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.stat { text-align: center; padding: 10px 4px; }
.stat b { display: block; font-size: 22px; }
.stat span { font-size: 12px; color: var(--muted); }
.qopt {
  display: block; width: 100%; text-align: left; margin-bottom: 8px;
  background: var(--card); color: var(--text); border: 1px solid var(--border);
  font-weight: 500;
}
.qopt.correct { border-color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, var(--card)); }
.qopt.wrong { border-color: var(--bad); background: color-mix(in srgb, var(--bad) 12%, var(--card)); }
.flashcard {
  min-height: 220px; display: flex; align-items: center; justify-content: center;
  text-align: center; font-size: 18px; padding: 24px; cursor: pointer;
}
.list-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 0;
  border-bottom: 1px solid var(--border); text-decoration: none; color: var(--text);
}
.list-item:last-child { border-bottom: 0; }
input[type="date"], input[type="file"] {
  padding: 8px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--card); color: var(--text); font-size: 15px;
}
.timer { font-variant-numeric: tabular-nums; font-weight: 800; font-size: 18px; }
.badgegrid { display: flex; gap: 10px; flex-wrap: wrap; }
.badge { text-align: center; width: 84px; opacity: .35; }
.badge.earned { opacity: 1; }
.badge .icon { font-size: 30px; }
.badge .name { font-size: 11px; }
table.freq { width: 100%; border-collapse: collapse; font-size: 14px; }
table.freq td, table.freq th { padding: 6px 4px; border-bottom: 1px solid var(--border); text-align: left; }
```

- [ ] **Step 8: Verify shell in browser preview**

Start the `ale` preview server (launch.json). Open `http://localhost:8000`. Expected: navy top bar with gold "ALE", bottom nav, "Προβολή: dashboard" text. Clicking Ρυθμίσεις shows "Προβολή: settings".

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: app shell, hash router, base stylesheet"
```

---

### Task 2: Safe localStorage store

**Files:**
- Create: `js/core/store.js`, `js/core/stats.js` (only `newStats` here; rest of stats in Task 5)
- Test: `tests/store.test.js`

**Interfaces:**
- Produces: `freshState() -> state`, `loadState(storage) -> state`, `saveState(state, storage) -> boolean` (js/core/store.js); `newStats() -> stats` (js/core/stats.js).
- State shape (used by every later task): `{version: 1, topics: {[topicId]: progress}, stats, sessions: [], settings: {examDate: null, excludedChapters: {}}}`.
- Stats shape: `{totalXp, currentStreak, longestStreak, lastStudyDate, badges: [], totalSessions, totalTimeSeconds}`.

- [ ] **Step 1: Write the failing test**

`tests/store.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, loadState, saveState } from '../js/core/store.js';

function fakeStorage(initial = {}) {
  const m = { ...initial };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _dump: () => m,
  };
}

test('freshState has expected shape', () => {
  const s = freshState();
  assert.equal(s.version, 1);
  assert.deepEqual(s.topics, {});
  assert.deepEqual(s.sessions, []);
  assert.equal(s.settings.examDate, null);
  assert.deepEqual(s.settings.excludedChapters, {});
  assert.equal(s.stats.totalXp, 0);
});

test('loadState returns fresh state when storage empty', () => {
  assert.deepEqual(loadState(fakeStorage()), freshState());
});

test('save then load round-trips', () => {
  const st = fakeStorage();
  const s = freshState();
  s.topics.t1 = { mastery: 42 };
  assert.equal(saveState(s, st), true);
  assert.equal(loadState(st).topics.t1.mastery, 42);
});

test('corrupt JSON falls back to fresh state', () => {
  const st = fakeStorage({ 'ale.v1': '{not json' });
  assert.deepEqual(loadState(st), freshState());
});

test('wrong version falls back to fresh state', () => {
  const st = fakeStorage({ 'ale.v1': JSON.stringify({ version: 99 }) });
  assert.deepEqual(loadState(st), freshState());
});

test('saveState returns false when storage throws', () => {
  const st = { setItem: () => { throw new Error('quota'); } };
  assert.equal(saveState(freshState(), st), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`js/core/stats.js` (initial):
```js
export function newStats() {
  return {
    totalXp: 0, currentStreak: 0, longestStreak: 0, lastStudyDate: null,
    badges: [], totalSessions: 0, totalTimeSeconds: 0,
  };
}
```

`js/core/store.js`:
```js
import { newStats } from './stats.js';

const KEY = 'ale.v1';

export function freshState() {
  return {
    version: 1,
    topics: {},
    stats: newStats(),
    sessions: [],
    settings: { examDate: null, excludedChapters: {} },
  };
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.topics !== 'object') return freshState();
    const base = freshState();
    return {
      ...base, ...parsed,
      stats: { ...base.stats, ...parsed.stats },
      settings: { ...base.settings, ...parsed.settings },
    };
  } catch {
    return freshState();
  }
}

export function saveState(state, storage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: localStorage store with corruption fallback"
```

---

### Task 3: Spaced repetition (SRS)

**Files:**
- Create: `js/core/srs.js`
- Test: `tests/srs.test.js`

**Interfaces:**
- Produces: `INTERVALS = [1,3,7,10,14,19]`, `nextIntervalIndex(current, wasCorrect) -> number`, `nextReviewDate(intervalIndex, fromIso) -> isoString`, `isDue(nextReviewIso|null, nowIso) -> boolean`.

- [ ] **Step 1: Write the failing test**

`tests/srs.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERVALS, nextIntervalIndex, nextReviewDate, isDue } from '../js/core/srs.js';

test('intervals are exactly 1,3,7,10,14,19', () => {
  assert.deepEqual(INTERVALS, [1, 3, 7, 10, 14, 19]);
});

test('correct answer advances interval, capped at last', () => {
  assert.equal(nextIntervalIndex(-1, true), 0);
  assert.equal(nextIntervalIndex(0, true), 1);
  assert.equal(nextIntervalIndex(5, true), 5);
});

test('wrong answer resets to index 0', () => {
  assert.equal(nextIntervalIndex(4, false), 0);
});

test('nextReviewDate adds the interval days', () => {
  assert.equal(nextReviewDate(0, '2026-08-15T10:00:00.000Z'), '2026-08-16T10:00:00.000Z');
  assert.equal(nextReviewDate(5, '2026-08-15T10:00:00.000Z'), '2026-09-03T10:00:00.000Z');
});

test('isDue', () => {
  assert.equal(isDue(null, '2026-08-15T10:00:00.000Z'), true);
  assert.equal(isDue('2026-08-15T09:00:00.000Z', '2026-08-15T10:00:00.000Z'), true);
  assert.equal(isDue('2026-08-16T10:00:00.000Z', '2026-08-15T10:00:00.000Z'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`js/core/srs.js`:
```js
export const INTERVALS = [1, 3, 7, 10, 14, 19];

export function nextIntervalIndex(current, wasCorrect) {
  if (!wasCorrect) return 0;
  return Math.min(current + 1, INTERVALS.length - 1);
}

export function nextReviewDate(intervalIndex, fromIso) {
  const d = new Date(fromIso);
  d.setUTCDate(d.getUTCDate() + INTERVALS[intervalIndex]);
  return d.toISOString();
}

export function isDue(nextReviewIso, nowIso) {
  if (!nextReviewIso) return true;
  return Date.parse(nextReviewIso) <= Date.parse(nowIso);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: spaced repetition intervals 1-3-7-10-14-19"
```

---

### Task 4: Adaptive progress engine

**Files:**
- Create: `js/core/progress.js`
- Test: `tests/progress.test.js`

**Interfaces:**
- Consumes: `nextIntervalIndex`, `nextReviewDate` from `js/core/srs.js`.
- Produces: `XP = {easy:10, medium:20, hard:30}`, `MASTERY_CAP = {easy:50, medium:80, hard:100}`, `newTopicProgress() -> progress`, `recordAnswer(progress, {correct, questionDifficulty, now}) -> progress` (pure — returns a new object).
- Progress shape: `{mastery, acc, correct, incorrect, consecCorrect, consecIncorrect, difficulty, intervalIndex, nextReview, lastStudied, xp, weak}`.

- [ ] **Step 1: Write the failing test**

`tests/progress.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTopicProgress, recordAnswer, XP, MASTERY_CAP } from '../js/core/progress.js';

const NOW = '2026-08-15T10:00:00.000Z';

test('constants match spec', () => {
  assert.deepEqual(XP, { easy: 10, medium: 20, hard: 30 });
  assert.deepEqual(MASTERY_CAP, { easy: 50, medium: 80, hard: 100 });
});

test('first correct easy answer', () => {
  const p = recordAnswer(newTopicProgress(), { correct: true, questionDifficulty: 'easy', now: NOW });
  assert.equal(p.correct, 1);
  assert.equal(p.consecCorrect, 1);
  assert.equal(p.acc, 0.2);
  assert.equal(p.mastery, 10); // 0.2 * 50
  assert.equal(p.xp, 10);
  assert.equal(p.difficulty, 'easy');
  assert.equal(p.intervalIndex, 0);
  assert.equal(p.nextReview, '2026-08-16T10:00:00.000Z');
  assert.equal(p.lastStudied, NOW);
  assert.equal(p.weak, false);
});

test('3 consecutive correct promotes to medium and resets streak counter', () => {
  let p = newTopicProgress();
  for (let i = 0; i < 3; i++) p = recordAnswer(p, { correct: true, questionDifficulty: 'easy', now: NOW });
  assert.equal(p.difficulty, 'medium');
  assert.equal(p.consecCorrect, 0);
  // acc = 1 - 0.8^3 = 0.488 → mastery = round(0.488 * 80) = 39
  assert.equal(p.mastery, 39);
});

test('2 consecutive incorrect demotes and flags weak, resets interval', () => {
  let p = newTopicProgress();
  for (let i = 0; i < 3; i++) p = recordAnswer(p, { correct: true, questionDifficulty: 'easy', now: NOW });
  for (let i = 0; i < 2; i++) p = recordAnswer(p, { correct: false, questionDifficulty: 'medium', now: NOW });
  assert.equal(p.difficulty, 'easy');
  assert.equal(p.weak, true);
  assert.equal(p.intervalIndex, 0);
});

test('wrong answers earn no XP', () => {
  const p = recordAnswer(newTopicProgress(), { correct: false, questionDifficulty: 'hard', now: NOW });
  assert.equal(p.xp, 0);
});

test('weak flag from low mastery after 5 answers', () => {
  let p = newTopicProgress();
  // alternate: 3 correct, then pattern keeping mastery low
  p = recordAnswer(p, { correct: false, questionDifficulty: 'easy', now: NOW });
  p = recordAnswer(p, { correct: true, questionDifficulty: 'easy', now: NOW });
  p = recordAnswer(p, { correct: false, questionDifficulty: 'easy', now: NOW });
  p = recordAnswer(p, { correct: true, questionDifficulty: 'easy', now: NOW });
  p = recordAnswer(p, { correct: true, questionDifficulty: 'easy', now: NOW });
  assert.equal(p.correct + p.incorrect >= 5, true);
  assert.equal(p.mastery < 40, true);
  assert.equal(p.weak, true);
});

test('recordAnswer does not mutate its input', () => {
  const before = newTopicProgress();
  recordAnswer(before, { correct: true, questionDifficulty: 'easy', now: NOW });
  assert.deepEqual(before, newTopicProgress());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`js/core/progress.js`:
```js
import { nextIntervalIndex, nextReviewDate } from './srs.js';

export const XP = { easy: 10, medium: 20, hard: 30 };
export const MASTERY_CAP = { easy: 50, medium: 80, hard: 100 };
const EMA_ALPHA = 0.2;

export function newTopicProgress() {
  return {
    mastery: 0, acc: 0, correct: 0, incorrect: 0,
    consecCorrect: 0, consecIncorrect: 0, difficulty: 'easy',
    intervalIndex: -1, nextReview: null, lastStudied: null,
    xp: 0, weak: false,
  };
}

export function recordAnswer(p, { correct, questionDifficulty, now }) {
  const n = { ...p };
  if (correct) { n.correct += 1; n.consecCorrect += 1; n.consecIncorrect = 0; }
  else { n.incorrect += 1; n.consecIncorrect += 1; n.consecCorrect = 0; }

  n.acc = +(n.acc * (1 - EMA_ALPHA) + (correct ? EMA_ALPHA : 0)).toFixed(4);

  if (n.consecCorrect >= 3 && n.difficulty !== 'hard') {
    n.difficulty = n.difficulty === 'easy' ? 'medium' : 'hard';
    n.consecCorrect = 0;
  }
  if (n.consecIncorrect >= 2 && n.difficulty !== 'easy') {
    n.difficulty = n.difficulty === 'hard' ? 'medium' : 'easy';
  }

  n.mastery = Math.round(n.acc * MASTERY_CAP[n.difficulty]);
  n.weak = n.consecIncorrect >= 2 || (n.correct + n.incorrect >= 5 && n.mastery < 40);

  if (correct) n.xp += XP[questionDifficulty] ?? 10;

  n.intervalIndex = nextIntervalIndex(n.intervalIndex, correct);
  n.nextReview = nextReviewDate(n.intervalIndex, now);
  n.lastStudied = new Date(now).toISOString();
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/` — Expected: all PASS. If the low-mastery weak-flag test's arithmetic disagrees with the implementation, recompute the expected EMA by hand (α = 0.2) and fix the **test's answer pattern**, not the engine formula.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: adaptive progress engine (mastery EMA, difficulty ladder, weak flag)"
```

---

### Task 5: Stats — streaks, badges, sessions

**Files:**
- Modify: `js/core/stats.js`
- Test: `tests/stats.test.js`

**Interfaces:**
- Produces (added to existing `newStats`): `dateStr(dateLike) -> 'YYYY-MM-DD'` (local time), `recordSession(stats, {now, xp, timeSeconds}) -> stats`, `BADGES` (array of `{id, name, icon, test(stats, extras)}`), `evaluateBadges(stats, extras, now) -> stats` where `extras = {masteredTopics: number}` (count of topics with mastery ≥ 80).

- [ ] **Step 1: Write the failing test**

`tests/stats.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newStats, dateStr, recordSession, evaluateBadges } from '../js/core/stats.js';

test('first session starts streak at 1', () => {
  const s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 30, timeSeconds: 120 });
  assert.equal(s.currentStreak, 1);
  assert.equal(s.longestStreak, 1);
  assert.equal(s.totalXp, 30);
  assert.equal(s.totalSessions, 1);
  assert.equal(s.lastStudyDate, '2026-08-15');
});

test('same-day second session keeps streak, adds xp', () => {
  let s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 30, timeSeconds: 120 });
  s = recordSession(s, { now: '2026-08-15T18:00:00', xp: 20, timeSeconds: 60 });
  assert.equal(s.currentStreak, 1);
  assert.equal(s.totalXp, 50);
  assert.equal(s.totalSessions, 2);
});

test('next-day session increments streak', () => {
  let s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 10, timeSeconds: 60 });
  s = recordSession(s, { now: '2026-08-16T10:00:00', xp: 10, timeSeconds: 60 });
  assert.equal(s.currentStreak, 2);
  assert.equal(s.longestStreak, 2);
});

test('gap resets streak but keeps longest', () => {
  let s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 10, timeSeconds: 60 });
  s = recordSession(s, { now: '2026-08-16T10:00:00', xp: 10, timeSeconds: 60 });
  s = recordSession(s, { now: '2026-08-20T10:00:00', xp: 10, timeSeconds: 60 });
  assert.equal(s.currentStreak, 1);
  assert.equal(s.longestStreak, 2);
});

test('badges: first session and xp milestones', () => {
  let s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 1200, timeSeconds: 60 });
  s = evaluateBadges(s, { masteredTopics: 0 }, '2026-08-15T10:00:00');
  const ids = s.badges.map((b) => b.id);
  assert.ok(ids.includes('prota-vimata'));
  assert.ok(ids.includes('xp-1000'));
  assert.ok(!ids.includes('xp-5000'));
  assert.equal(s.badges.find((b) => b.id === 'xp-1000').earnedDate, '2026-08-15');
});

test('badges are not duplicated on re-evaluation', () => {
  let s = recordSession(newStats(), { now: '2026-08-15T10:00:00', xp: 10, timeSeconds: 60 });
  s = evaluateBadges(s, { masteredTopics: 0 }, '2026-08-15T10:00:00');
  s = evaluateBadges(s, { masteredTopics: 0 }, '2026-08-16T10:00:00');
  assert.equal(s.badges.filter((b) => b.id === 'prota-vimata').length, 1);
});

test('dateStr uses local calendar date', () => {
  assert.equal(dateStr('2026-08-15T23:30:00'), '2026-08-15');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/` — Expected: FAIL (`dateStr` not exported).

- [ ] **Step 3: Implement (append to `js/core/stats.js`)**

```js
export function dateStr(dateLike) {
  const d = new Date(dateLike);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function recordSession(stats, { now, xp, timeSeconds }) {
  const s = { ...stats, badges: [...stats.badges] };
  const today = dateStr(now);
  if (s.lastStudyDate !== today) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    s.currentStreak = s.lastStudyDate === dateStr(y) ? s.currentStreak + 1 : 1;
    s.lastStudyDate = today;
  }
  s.longestStreak = Math.max(s.longestStreak, s.currentStreak);
  s.totalXp += xp;
  s.totalSessions += 1;
  s.totalTimeSeconds += timeSeconds;
  return s;
}

export const BADGES = [
  { id: 'prota-vimata', name: 'Πρώτα Βήματα', icon: '🎯', test: (s) => s.totalSessions >= 1 },
  { id: 'seri-7', name: 'Σερί 7 Ημερών', icon: '🔥', test: (s) => s.currentStreak >= 7 },
  { id: 'seri-14', name: 'Σερί 14 Ημερών', icon: '⚡', test: (s) => s.currentStreak >= 14 },
  { id: 'xp-1000', name: '1.000 XP', icon: '🏅', test: (s) => s.totalXp >= 1000 },
  { id: 'xp-5000', name: '5.000 XP', icon: '🏆', test: (s) => s.totalXp >= 5000 },
  { id: 'mastered-10', name: '10 Θέματα σε Κυριαρχία', icon: '🎓', test: (s, x) => (x?.masteredTopics ?? 0) >= 10 },
];

export function evaluateBadges(stats, extras, now) {
  const s = { ...stats, badges: [...stats.badges] };
  for (const b of BADGES) {
    if (!s.badges.some((e) => e.id === b.id) && b.test(s, extras)) {
      s.badges.push({ id: b.id, name: b.name, icon: b.icon, earnedDate: dateStr(now) });
    }
  }
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: streaks, badges, session stats"
```

---

### Task 6: Export/import merge

**Files:**
- Create: `js/core/merge.js`
- Test: `tests/merge.test.js`

**Interfaces:**
- Produces: `validateSnapshot(obj) -> {ok: boolean, error?: string}` (Greek error strings), `mergeState(local, imported) -> state`.
- Merge rules (from spec): per topic latest `lastStudied` wins (missing/null loses); stats take max per numeric field; badges union by id; `lastStudyDate` takes the later; local `sessions` log kept as-is (device-local history); settings: local wins, imported fills gaps.

- [ ] **Step 1: Write the failing test**

`tests/merge.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, mergeState } from '../js/core/merge.js';
import { freshState } from '../js/core/store.js';

function stateWith(topics, statsOverride = {}) {
  const s = freshState();
  s.topics = topics;
  Object.assign(s.stats, statsOverride);
  return s;
}

test('validateSnapshot rejects garbage with Greek errors', () => {
  assert.equal(validateSnapshot(null).ok, false);
  assert.equal(validateSnapshot({ version: 2, topics: {}, stats: {} }).ok, false);
  assert.equal(validateSnapshot({ version: 1, stats: {} }).ok, false);
  const bad = validateSnapshot({});
  assert.match(bad.error, /[Α-Ωα-ω]/); // error message is in Greek
});

test('validateSnapshot accepts a real export', () => {
  assert.equal(validateSnapshot(freshState()).ok, true);
});

test('newer imported topic wins, older loses', () => {
  const local = stateWith({
    a: { mastery: 10, lastStudied: '2026-08-10T00:00:00.000Z' },
    b: { mastery: 90, lastStudied: '2026-08-14T00:00:00.000Z' },
  });
  const imported = stateWith({
    a: { mastery: 50, lastStudied: '2026-08-12T00:00:00.000Z' },
    b: { mastery: 20, lastStudied: '2026-08-01T00:00:00.000Z' },
    c: { mastery: 5, lastStudied: null },
  });
  const m = mergeState(local, imported);
  assert.equal(m.topics.a.mastery, 50); // imported newer
  assert.equal(m.topics.b.mastery, 90); // local newer
  assert.equal(m.topics.c.mastery, 5);  // only in import
});

test('stats take max, badges union by id', () => {
  const local = stateWith({}, {
    totalXp: 100, currentStreak: 2, longestStreak: 5,
    badges: [{ id: 'prota-vimata', earnedDate: '2026-08-01' }],
    lastStudyDate: '2026-08-14',
  });
  const imported = stateWith({}, {
    totalXp: 300, currentStreak: 1, longestStreak: 3,
    badges: [{ id: 'xp-1000', earnedDate: '2026-08-10' }],
    lastStudyDate: '2026-08-12',
  });
  const m = mergeState(local, imported);
  assert.equal(m.stats.totalXp, 300);
  assert.equal(m.stats.currentStreak, 2);
  assert.equal(m.stats.longestStreak, 5);
  assert.equal(m.stats.lastStudyDate, '2026-08-14');
  assert.deepEqual(m.stats.badges.map((b) => b.id).sort(), ['prota-vimata', 'xp-1000']);
});

test('local settings win over imported', () => {
  const local = freshState(); local.settings.examDate = '2026-10-03';
  const imported = freshState(); imported.settings.examDate = '2026-09-01';
  assert.equal(mergeState(local, imported).settings.examDate, '2026-10-03');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`js/core/merge.js`:
```js
export function validateSnapshot(o) {
  if (!o || typeof o !== 'object') return { ok: false, error: 'Μη έγκυρο αρχείο.' };
  if (o.version !== 1) return { ok: false, error: 'Μη υποστηριζόμενη έκδοση αρχείου.' };
  if (!o.topics || typeof o.topics !== 'object') return { ok: false, error: 'Λείπουν τα δεδομένα προόδου.' };
  if (!o.stats || typeof o.stats !== 'object') return { ok: false, error: 'Λείπουν τα στατιστικά.' };
  return { ok: true };
}

export function mergeState(local, imported) {
  const topics = { ...local.topics };
  for (const [id, imp] of Object.entries(imported.topics)) {
    const loc = topics[id];
    if (!loc) { topics[id] = imp; continue; }
    const locT = loc.lastStudied ? Date.parse(loc.lastStudied) : 0;
    const impT = imp.lastStudied ? Date.parse(imp.lastStudied) : 0;
    topics[id] = impT > locT ? imp : loc;
  }

  const badgeMap = new Map();
  for (const b of [...(imported.stats.badges || []), ...(local.stats.badges || [])]) badgeMap.set(b.id, b);

  const stats = {
    totalXp: Math.max(local.stats.totalXp || 0, imported.stats.totalXp || 0),
    currentStreak: Math.max(local.stats.currentStreak || 0, imported.stats.currentStreak || 0),
    longestStreak: Math.max(local.stats.longestStreak || 0, imported.stats.longestStreak || 0),
    lastStudyDate: [local.stats.lastStudyDate, imported.stats.lastStudyDate].filter(Boolean).sort().pop() || null,
    badges: [...badgeMap.values()],
    totalSessions: Math.max(local.stats.totalSessions || 0, imported.stats.totalSessions || 0),
    totalTimeSeconds: Math.max(local.stats.totalTimeSeconds || 0, imported.stats.totalTimeSeconds || 0),
  };

  return {
    ...local,
    topics,
    stats,
    settings: { ...imported.settings, ...local.settings },
  };
}
```

Note: `{...imported.settings, ...local.settings}` makes local settings win; imported only fills keys local lacks. `null` local values still override — that is acceptable because `freshState()` defaults match.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: snapshot validation and merge (latest-wins topics, max stats)"
```

---

### Task 7: Content loader

**Files:**
- Create: `js/core/content.js`, `tests/fixtures/content.js`
- Test: `tests/content.test.js`

**Interfaces:**
- Produces: `loadCourses(fetchFn) -> Promise<{examDate, courses:[{id,title,status}]}>`, `loadContent(courseId, fetchFn) -> Promise<content>`, `loadAnalysis(courseId, fetchFn) -> Promise<analysis|null>`, `validateContent(content) -> string|null` (Greek error or null), `allTopics(content, excludedChapterIds=[]) -> [{...topic, chapterId, chapterTitle}]`.
- Content JSON shape (also the contract for all generated data): `{courseId, chapters: [{id, title, order, topics: [{id, title, order, summary, keyDefinitions:[{term,definition}], killerFacts:[string], mcq:[{question, options:[4 strings], correctIndex, explanation, difficulty}], shortAnswers:[{question, modelAnswer, difficulty}], flashcards:[{front,back}], examQuestion:{question, modelAnswer, marks}|null, commonTraps:[string]}]}]}`.
- Analysis JSON shape: `{courseId, sourcePapers:[string], topicFrequencies:[{topic, count, percentage}], questionTypes:[{type, count, percentage}], difficulty:{easy, medium, hard}, killerFacts:[{fact, topic, frequency}], recommendations:[string]}`.
- Test fixture `tests/fixtures/content.js` exports `FIXTURE_CONTENT` reused by picker tests in Task 11.

- [ ] **Step 1: Write the fixture**

`tests/fixtures/content.js`:
```js
export const FIXTURE_CONTENT = {
  courseId: 'demo',
  chapters: [
    {
      id: 'ch1', title: 'Κεφάλαιο 1', order: 1,
      topics: [
        {
          id: 't1', title: 'Θέμα Ένα', order: 1, summary: 'Σύνοψη 1.',
          keyDefinitions: [{ term: 'Όρος', definition: 'Ορισμός' }],
          killerFacts: ['Γεγονός 1'],
          mcq: [
            { question: 'Ε1;', options: ['α', 'β', 'γ', 'δ'], correctIndex: 0, explanation: 'εξ.', difficulty: 'easy' },
            { question: 'Ε2;', options: ['α', 'β', 'γ', 'δ'], correctIndex: 1, explanation: 'εξ.', difficulty: 'medium' },
            { question: 'Ε3;', options: ['α', 'β', 'γ', 'δ'], correctIndex: 2, explanation: 'εξ.', difficulty: 'hard' },
          ],
          shortAnswers: [{ question: 'ΣΕ1;', modelAnswer: 'Απάντηση', difficulty: 'medium' }],
          flashcards: [{ front: 'Μπρος', back: 'Πίσω' }],
          examQuestion: { question: 'Θέμα εξέτασης', modelAnswer: 'Υπόδειγμα', marks: 10 },
          commonTraps: ['Παγίδα 1'],
        },
        {
          id: 't2', title: 'Θέμα Δύο', order: 2, summary: 'Σύνοψη 2.',
          keyDefinitions: [], killerFacts: [],
          mcq: [
            { question: 'Ε4;', options: ['α', 'β', 'γ', 'δ'], correctIndex: 3, explanation: 'εξ.', difficulty: 'easy' },
          ],
          shortAnswers: [], flashcards: [{ front: 'Α', back: 'Β' }],
          examQuestion: null, commonTraps: [],
        },
      ],
    },
    {
      id: 'ch2', title: 'Κεφάλαιο 2', order: 2,
      topics: [
        {
          id: 't3', title: 'Θέμα Τρία', order: 1, summary: 'Σύνοψη 3.',
          keyDefinitions: [], killerFacts: [],
          mcq: [
            { question: 'Ε5;', options: ['α', 'β', 'γ', 'δ'], correctIndex: 0, explanation: 'εξ.', difficulty: 'medium' },
          ],
          shortAnswers: [], flashcards: [], examQuestion: null, commonTraps: [],
        },
      ],
    },
  ],
};
```

- [ ] **Step 2: Write the failing test**

`tests/content.test.js`:
```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

`js/core/content.js`:
```js
export async function loadCourses(fetchFn = fetch) {
  const res = await fetchFn('data/courses.json');
  if (!res.ok) throw new Error('Αποτυχία φόρτωσης της λίστας μαθημάτων.');
  return res.json();
}

export async function loadContent(courseId, fetchFn = fetch) {
  const res = await fetchFn(`data/${courseId}/content.json`);
  if (!res.ok) throw new Error('Αποτυχία φόρτωσης της ύλης.');
  const content = await res.json();
  const err = validateContent(content);
  if (err) throw new Error(err);
  return content;
}

export async function loadAnalysis(courseId, fetchFn = fetch) {
  try {
    const res = await fetchFn(`data/${courseId}/exam-analysis.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function validateContent(c) {
  if (!c || !Array.isArray(c.chapters)) return 'Μη έγκυρη δομή ύλης.';
  for (const ch of c.chapters) {
    if (!ch.id || !ch.title || !Array.isArray(ch.topics)) {
      return `Μη έγκυρο κεφάλαιο στην ύλη: ${ch.title || '(χωρίς τίτλο)'}`;
    }
  }
  return null;
}

export function allTopics(content, excludedChapterIds = []) {
  const out = [];
  for (const ch of content.chapters) {
    if (excludedChapterIds.includes(ch.id)) continue;
    for (const t of ch.topics) out.push({ ...t, chapterId: ch.id, chapterTitle: ch.title });
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/` — Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: content loader with validation"
```

---

### Task 8: Convert Base44 export to app data

**Files:**
- Create: `scripts/convert-base44.mjs`, `data/courses.json` (by hand), `data/klados-zois/content.json` + `data/basikes-arxes/content.json` (by running the script)

**Interfaces:**
- Consumes: `reference/base44-export/topics.json` and `reference/base44-export/chapters.json` (Base44 entity dumps), content shape from Task 7.
- Produces: real Greek study content for both courses so every view has data. **This data is provisional** — it will be regenerated when the user provides source files; the converter also serves as the template for how generated content is structured.

- [ ] **Step 1: Write `data/courses.json` by hand**

```json
{
  "examDate": "2026-10-03",
  "courses": [
    { "id": "klados-zois", "title": "Κλάδος Ζωής", "status": "active" },
    { "id": "basikes-arxes", "title": "Βασικές Αρχές Ασφαλίσεων", "status": "passed" }
  ]
}
```

- [ ] **Step 2: Write the converter**

`scripts/convert-base44.mjs`:
```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CURRICULUM_TO_COURSE = {
  '698f3a767e4bbfee6bd1e362': 'basikes-arxes',
  '69919e89a0734edeb516f7cb': 'klados-zois',
  // The current Ζωής curriculum record has a different id but its chapters
  // still reference the old one; both map to klados-zois.
  '6991ae79a3f13975b89860c2': 'klados-zois',
};

const topics = JSON.parse(readFileSync('reference/base44-export/topics.json', 'utf8')).entities;
const chapters = JSON.parse(readFileSync('reference/base44-export/chapters.json', 'utf8')).entities;

const chapterById = Object.fromEntries(chapters.map((c) => [c.id, c]));

function mapTopic(t, order) {
  return {
    id: t.id,
    title: (t.title || '').trim(),
    order,
    summary: t.summary || '',
    keyDefinitions: (t.key_definitions || []).map((d) => ({ term: d.term || '', definition: d.definition || '' })),
    killerFacts: t.killer_facts || [],
    mcq: (t.mcq_questions || []).map((q) => ({
      question: q.question || '', options: q.options || [],
      correctIndex: q.correct_index ?? 0, explanation: q.explanation || '',
      difficulty: q.difficulty || 'medium',
    })),
    shortAnswers: (t.short_answer_questions || []).map((q) => ({
      question: q.question || '', modelAnswer: q.model_answer || '', difficulty: q.difficulty || 'medium',
    })),
    flashcards: (t.flashcards || []).map((f) => ({ front: f.front || '', back: f.back || '' })),
    examQuestion: t.exam_question && t.exam_question.question
      ? { question: t.exam_question.question, modelAnswer: t.exam_question.model_answer || '', marks: t.exam_question.marks ?? 10 }
      : null,
    commonTraps: t.common_traps || [],
  };
}

const byCourse = {};
for (const t of topics) {
  const ch = chapterById[t.chapter_id];
  const courseId = ch
    ? CURRICULUM_TO_COURSE[ch.curriculum_id]
    : CURRICULUM_TO_COURSE[t.curriculum_id];
  if (!courseId) { console.warn(`Άγνωστο μάθημα για θέμα: ${t.title}`); continue; }
  byCourse[courseId] ??= {};
  const chKey = t.chapter_id;
  byCourse[courseId][chKey] ??= {
    id: chKey,
    title: ch ? ch.title : 'Λοιπά θέματα',
    order: ch ? (ch.order ?? 99) : 0,
    topics: [],
  };
  byCourse[courseId][chKey].topics.push(t);
}

for (const [courseId, chMap] of Object.entries(byCourse)) {
  const chaptersOut = Object.values(chMap)
    .sort((a, b) => a.order - b.order)
    .map((ch) => ({
      ...ch,
      topics: ch.topics
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.created_date.localeCompare(b.created_date))
        .map((t, i) => mapTopic(t, i + 1)),
    }));
  const out = { courseId, chapters: chaptersOut };
  mkdirSync(`data/${courseId}`, { recursive: true });
  writeFileSync(`data/${courseId}/content.json`, JSON.stringify(out, null, 2), 'utf8');
  const nTopics = chaptersOut.reduce((n, c) => n + c.topics.length, 0);
  console.log(`${courseId}: ${chaptersOut.length} κεφάλαια, ${nTopics} θέματα`);
}
```

- [ ] **Step 3: Run the converter**

Run: `node scripts/convert-base44.mjs`
Expected: prints chapter/topic counts for both courses (22 topics total across them). Inspect both output files — Greek text intact (no mojibake), MCQs have 4 options, `correctIndex` in range.

- [ ] **Step 4: Validate outputs against the loader**

Add to `tests/content.test.js`:
```js
import { readFileSync } from 'node:fs';

test('generated data files pass validation', () => {
  for (const id of ['klados-zois', 'basikes-arxes']) {
    const c = JSON.parse(readFileSync(`data/${id}/content.json`, 'utf8'));
    assert.equal(validateContent(c), null, id);
    assert.ok(allTopics(c).length > 0, id);
  }
});
```

Run: `node --test tests/` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: convert Base44 export into app content for both courses"
```

---

### Task 9: Dashboard view (Αρχική)

**Files:**
- Create: `js/views/dashboard.js`
- Modify: `js/app.js` (full rewrite below — later view tasks only add imports/entries)

**Interfaces:**
- Consumes: everything from `js/core/*`, `parseRoute`, `escapeHtml`.
- Produces: `render(el, ctx)` in each view module. `ctx` contract (fixed here, used by ALL views): `{state, save(), courses, getContent(courseId) -> Promise<content>, getAnalysis(courseId) -> Promise<analysis|null>, navigate(hash), params, examDateIso()}`. Views mutate `ctx.state` then call `ctx.save()`.

- [ ] **Step 1: Rewrite `js/app.js` with the real ctx**

```js
import { parseRoute } from './router.js';
import { loadState, saveState } from './core/store.js';
import { loadCourses, loadContent, loadAnalysis } from './core/content.js';
import * as dashboard from './views/dashboard.js';

const VIEWS = { dashboard };

const container = document.getElementById('view');
const state = loadState(window.localStorage);
let courses = null;
const contentCache = {};
const analysisCache = {};

function save() {
  if (!saveState(state, window.localStorage)) {
    alert('Προσοχή: η πρόοδος δεν αποθηκεύτηκε (ο χώρος του προγράμματος περιήγησης είναι πλήρης).');
  }
}

async function getContent(courseId) {
  contentCache[courseId] ??= await loadContent(courseId);
  return contentCache[courseId];
}

async function getAnalysis(courseId) {
  if (!(courseId in analysisCache)) analysisCache[courseId] = await loadAnalysis(courseId);
  return analysisCache[courseId];
}

function examDateIso() {
  return state.settings.examDate || courses?.examDate || '2026-10-03';
}

function renderCountdown() {
  const days = Math.ceil((new Date(examDateIso()) - new Date()) / 86400000);
  document.getElementById('countdown').innerHTML =
    days >= 0 ? `Εξετάσεις σε <b>${days}</b> ημέρες` : 'Οι εξετάσεις πέρασαν';
}

async function render() {
  try {
    courses ??= await loadCourses();
  } catch (e) {
    container.innerHTML = `<div class="card"><h2>Σφάλμα</h2><p>${e.message}</p>
      <button onclick="location.reload()">Δοκιμή ξανά</button></div>`;
    return;
  }
  renderCountdown();
  const route = parseRoute(location.hash);
  const view = VIEWS[route.view] || VIEWS.dashboard;
  const ctx = {
    state, save, courses, getContent, getAnalysis,
    navigate: (h) => { location.hash = h; },
    params: route.params, examDateIso,
  };
  container.innerHTML = '<p class="muted">Φόρτωση…</p>';
  await view.render(container, ctx);
}

window.addEventListener('hashchange', render);
render();
```

- [ ] **Step 2: Implement the dashboard**

`js/views/dashboard.js`:
```js
import { escapeHtml } from '../ui.js';
import { allTopics } from '../core/content.js';
import { isDue } from '../core/srs.js';
import { newTopicProgress } from '../core/progress.js';

export async function render(el, ctx) {
  const now = new Date().toISOString();
  const active = ctx.courses.courses.filter((c) => c.status === 'active');
  const passed = ctx.courses.courses.filter((c) => c.status === 'passed');

  const perCourse = [];
  let dueCount = 0;
  const weak = [];
  for (const c of ctx.courses.courses) {
    let content;
    try { content = await ctx.getContent(c.id); } catch { perCourse.push({ c, error: true }); continue; }
    const excluded = ctx.state.settings.excludedChapters[c.id] || [];
    const ts = allTopics(content, excluded);
    const progs = ts.map((t) => ctx.state.topics[t.id] || newTopicProgress());
    const mastery = ts.length ? Math.round(progs.reduce((s, p) => s + p.mastery, 0) / ts.length) : 0;
    const due = c.status === 'active'
      ? ts.filter((t, i) => isDue(progs[i].nextReview, now)).length : 0;
    dueCount += due;
    if (c.status === 'active') {
      for (let i = 0; i < ts.length; i++) {
        if (progs[i].weak) weak.push({ course: c, topic: ts[i] });
      }
    }
    perCourse.push({ c, mastery, due, topicCount: ts.length });
  }

  const s = ctx.state.stats;
  el.innerHTML = `
    <div class="card stat-row">
      <div class="stat"><b>🔥 ${s.currentStreak}</b><span>Σερί ημερών</span></div>
      <div class="stat"><b>${s.totalXp}</b><span>XP</span></div>
      <div class="stat"><b>${s.badges.length}</b><span>Παράσημα</span></div>
    </div>
    ${dueCount > 0 ? `<div class="card"><h2>📅 Επαναλήψεις για σήμερα</h2>
      <p><b>${dueCount}</b> θέματα περιμένουν επανάληψη.</p>
      ${active.map((c) => `<a class="btn btn-gold btn-block" href="#/quiz/${c.id}/revision">Επανάληψη — ${escapeHtml(c.title)}</a>`).join('')}
    </div>` : ''}
    ${perCourse.map(({ c, mastery, due, topicCount, error }) => error
      ? `<div class="card"><h2>${escapeHtml(c.title)}</h2><p class="muted">Η ύλη δεν είναι διαθέσιμη ακόμη.</p></div>`
      : `<div class="card">
        <div class="row"><h2 class="grow">${escapeHtml(c.title)}</h2>
          ${c.status === 'passed' ? '<span class="pill pill-ok">✓ Επιτυχία</span>' : `<span class="pill">${topicCount} θέματα</span>`}
        </div>
        <div class="bar ${mastery >= 80 ? 'hi' : ''}"><span style="width:${mastery}%"></span></div>
        <p class="muted">Κυριαρχία ${mastery}%${due ? ` · ${due} για επανάληψη` : ''}</p>
        <div class="row">
          <a class="btn" href="#/course/${c.id}">Ύλη</a>
          <a class="btn btn-ghost" href="#/quiz/${c.id}/micro">Κουίζ</a>
          <a class="btn btn-ghost" href="#/flashcards/${c.id}">Κάρτες</a>
          <a class="btn btn-ghost" href="#/exam/${c.id}">Εξέταση</a>
        </div>
      </div>`).join('')}
    ${weak.length ? `<div class="card"><h2>⚠️ Αδύναμα σημεία (${weak.length})</h2>
      ${weak.slice(0, 5).map((w) => `<a class="list-item" href="#/topic/${w.course.id}/${w.topic.id}">
        <span class="grow">${escapeHtml(w.topic.title)}</span><span class="pill pill-bad">αδύναμο</span></a>`).join('')}
      ${active.map((c) => `<a class="btn btn-block" href="#/quiz/${c.id}/weak">Εξάσκηση αδύναμων — ${escapeHtml(c.title)}</a>`).join('')}
    </div>` : ''}
    ${passed.length && !weak.length ? '' : ''}
  `;
}
```

- [ ] **Step 3: Verify in browser preview**

Reload `http://localhost:8000`. Expected: stat row (streak 0, 0 XP), a card per course — Κλάδος Ζωής with topic count pill, Βασικές Αρχές with «✓ Επιτυχία» pill — mastery bars at 0%, countdown in the top bar showing days until 3/10/2026. No console errors. Also check iPhone viewport (390×844): cards stack cleanly, bottom nav visible.

- [ ] **Step 4: Run tests still pass**

Run: `node --test tests/` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: dashboard with countdown, due reviews, course cards, weak topics"
```

---

### Task 10: Course + topic study views

**Files:**
- Create: `js/views/course.js`, `js/views/topic.js`
- Modify: `js/app.js` (add imports + `VIEWS` entries: `course`, `topic`)

**Interfaces:**
- Consumes: ctx contract from Task 9; content shape from Task 7.
- Produces: chapter exclusion toggles persist to `state.settings.excludedChapters[courseId]` (array of chapter ids) — already read by dashboard (Task 9) and picker (Task 11).

- [ ] **Step 1: Implement course view**

`js/views/course.js`:
```js
import { escapeHtml } from '../ui.js';
import { newTopicProgress } from '../core/progress.js';

export async function render(el, ctx) {
  const course = ctx.courses.courses.find((c) => c.id === ctx.params.courseId);
  if (!course) { ctx.navigate('#/'); return; }
  const content = await ctx.getContent(course.id);
  const excluded = new Set(ctx.state.settings.excludedChapters[course.id] || []);

  el.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <a class="btn btn-ghost" href="#/">← Πίσω</a>
      <h2 class="grow" style="margin:0">${escapeHtml(course.title)}</h2>
      ${course.status === 'passed' ? '<span class="pill pill-ok">✓ Επιτυχία</span>' : ''}
    </div>
    <div class="row" style="margin-bottom:12px">
      <a class="btn" href="#/quiz/${course.id}/micro">Κουίζ</a>
      <a class="btn btn-ghost" href="#/flashcards/${course.id}">Κάρτες</a>
      <a class="btn btn-ghost" href="#/exam/${course.id}">Εξέταση</a>
      <a class="btn btn-ghost" href="#/analysis/${course.id}">Ανάλυση</a>
    </div>
    ${content.chapters.map((ch) => `
      <div class="card">
        <div class="row">
          <h2 class="grow">${escapeHtml(ch.title)}</h2>
          <label class="muted" style="font-size:13px">
            <input type="checkbox" data-chapter="${ch.id}" ${excluded.has(ch.id) ? '' : 'checked'}> στη μελέτη
          </label>
        </div>
        ${ch.topics.map((t) => {
          const p = ctx.state.topics[t.id] || newTopicProgress();
          return `<a class="list-item" href="#/topic/${course.id}/${t.id}">
            <span class="grow">${escapeHtml(t.title)}</span>
            ${p.weak ? '<span class="pill pill-bad">αδύναμο</span>' : ''}
            <span class="pill">${p.mastery}%</span>
          </a>`;
        }).join('') || '<p class="muted">Χωρίς θέματα ακόμη.</p>'}
      </div>`).join('')}
  `;

  el.querySelectorAll('input[data-chapter]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const list = new Set(ctx.state.settings.excludedChapters[course.id] || []);
      if (cb.checked) list.delete(cb.dataset.chapter); else list.add(cb.dataset.chapter);
      ctx.state.settings.excludedChapters[course.id] = [...list];
      ctx.save();
    });
  });
}
```

- [ ] **Step 2: Implement topic study view**

`js/views/topic.js`:
```js
import { escapeHtml } from '../ui.js';
import { allTopics } from '../core/content.js';
import { newTopicProgress } from '../core/progress.js';

export async function render(el, ctx) {
  const { courseId, topicId } = ctx.params;
  const content = await ctx.getContent(courseId);
  const topic = allTopics(content).find((t) => t.id === topicId);
  if (!topic) { ctx.navigate(`#/course/${courseId}`); return; }
  const p = ctx.state.topics[topicId] || newTopicProgress();

  el.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <a class="btn btn-ghost" href="#/course/${courseId}">← Πίσω</a>
      <span class="pill">${p.mastery}% κυριαρχία</span>
      ${p.weak ? '<span class="pill pill-bad">αδύναμο</span>' : ''}
    </div>
    <div class="card">
      <h2>${escapeHtml(topic.title)}</h2>
      <p class="muted">${escapeHtml(topic.chapterTitle)}</p>
      <p>${escapeHtml(topic.summary) || '<span class="muted">Χωρίς σύνοψη.</span>'}</p>
    </div>
    ${topic.keyDefinitions.length ? `<div class="card"><h2>📖 Βασικοί ορισμοί</h2>
      ${topic.keyDefinitions.map((d) => `<p><b>${escapeHtml(d.term)}:</b> ${escapeHtml(d.definition)}</p>`).join('')}
    </div>` : ''}
    ${topic.killerFacts.length ? `<div class="card"><h2>💡 Κρίσιμα σημεία</h2>
      <ul>${topic.killerFacts.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
    </div>` : ''}
    ${topic.commonTraps.length ? `<div class="card"><h2>⚠️ Συνήθεις παγίδες</h2>
      <ul>${topic.commonTraps.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
    </div>` : ''}
    ${topic.examQuestion ? `<div class="card"><h2>📝 Θέμα εξέτασης (${topic.examQuestion.marks} μονάδες)</h2>
      <p>${escapeHtml(topic.examQuestion.question)}</p>
      <details><summary>Υπόδειγμα απάντησης</summary><p>${escapeHtml(topic.examQuestion.modelAnswer)}</p></details>
    </div>` : ''}
  `;
}
```

- [ ] **Step 3: Wire into app.js**

In `js/app.js`, add:
```js
import * as course from './views/course.js';
import * as topic from './views/topic.js';
```
and extend: `const VIEWS = { dashboard, course, topic };`

- [ ] **Step 4: Verify in browser preview**

From the dashboard click Κλάδος Ζωής → Ύλη. Expected: chapters with topic lists and 0% pills. Uncheck a chapter's «στη μελέτη», reload page — checkbox stays unchecked (persisted). Open a topic: summary/definitions/killer facts render with Greek text intact. Tests still pass (`node --test tests/`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: course view with chapter exclusion, topic study view"
```

---

### Task 11: Question picker + quiz view (micro/weak/revision)

**Files:**
- Create: `js/core/picker.js`, `js/views/quiz.js`
- Modify: `js/app.js` (add `quiz` to imports/VIEWS)
- Test: `tests/picker.test.js`

**Interfaces:**
- Consumes: `allTopics`, `isDue`, `newTopicProgress`, fixture from Task 7.
- Produces: `pickQuizQuestions({content, topics, mode, now, excludedChapterIds, count, rand}) -> [{topicId, topicTitle, q}]` and `pickExamQuestions({content, analysis, excludedChapterIds, count, rand}) -> same` (used by Task 13). Quiz view: answer flow that calls `recordAnswer`, `recordSession`, `evaluateBadges` and appends to `state.sessions` (`{date, mode, courseId, total, correct, timeSeconds, xp}`, keep last 50).

- [ ] **Step 1: Write the failing picker test**

`tests/picker.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickQuizQuestions, pickExamQuestions } from '../js/core/picker.js';
import { FIXTURE_CONTENT } from './fixtures/content.js';

const NOW = '2026-08-15T10:00:00.000Z';
const rand0 = () => 0;

test('micro mode picks from all topics, round-robin, no duplicate questions', () => {
  const qs = pickQuizQuestions({ content: FIXTURE_CONTENT, topics: {}, mode: 'micro', now: NOW, count: 5, rand: rand0 });
  assert.equal(qs.length, 5); // fixture has 5 MCQs total
  const texts = qs.map((x) => x.q.question);
  assert.equal(new Set(texts).size, texts.length);
});

test('weak mode only includes weak topics', () => {
  const topics = { t1: { ...base(), weak: true } };
  const qs = pickQuizQuestions({ content: FIXTURE_CONTENT, topics, mode: 'weak', now: NOW, count: 10, rand: rand0 });
  assert.ok(qs.length > 0);
  assert.ok(qs.every((x) => x.topicId === 't1'));
});

test('revision mode only includes due topics', () => {
  const topics = {
    t1: { ...base(), nextReview: '2026-09-01T00:00:00.000Z' }, // not due
    t2: { ...base(), nextReview: '2026-08-01T00:00:00.000Z' }, // due
    // t3 never studied -> due
  };
  const qs = pickQuizQuestions({ content: FIXTURE_CONTENT, topics, mode: 'revision', now: NOW, count: 10, rand: rand0 });
  const ids = new Set(qs.map((x) => x.topicId));
  assert.ok(!ids.has('t1'));
  assert.ok(ids.has('t2') && ids.has('t3'));
});

test('question difficulty follows topic progress difficulty when available', () => {
  const topics = { t1: { ...base(), difficulty: 'hard' } };
  const qs = pickQuizQuestions({ content: FIXTURE_CONTENT, topics, mode: 'micro', now: NOW, count: 1, rand: rand0 });
  assert.equal(qs[0].q.difficulty, 'hard');
});

test('excluded chapters are skipped', () => {
  const qs = pickQuizQuestions({ content: FIXTURE_CONTENT, topics: {}, mode: 'micro', now: NOW, excludedChapterIds: ['ch1'], count: 10, rand: rand0 });
  assert.ok(qs.every((x) => x.topicId === 't3'));
});

test('exam picker prefers non-easy questions and respects count', () => {
  const qs = pickExamQuestions({ content: FIXTURE_CONTENT, analysis: null, count: 3, rand: rand0 });
  assert.equal(qs.length, 3);
});

test('exam picker weights topics named in analysis', () => {
  const analysis = { topicFrequencies: [{ topic: 'Θέμα Τρία', count: 8, percentage: 80 }] };
  let hits = 0;
  // deterministic sweep of rand values instead of Math.random
  for (let i = 0; i < 100; i++) {
    const r = ((i * 37) % 100) / 100;
    const qs = pickExamQuestions({ content: FIXTURE_CONTENT, analysis, count: 1, rand: () => r });
    if (qs[0]?.topicId === 't3') hits++;
  }
  assert.ok(hits > 50, `t3 picked ${hits}/100 — weighting not applied`);
});

function base() {
  return {
    mastery: 0, acc: 0, correct: 0, incorrect: 0, consecCorrect: 0, consecIncorrect: 0,
    difficulty: 'easy', intervalIndex: -1, nextReview: null, lastStudied: null, xp: 0, weak: false,
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement the picker**

`js/core/picker.js`:
```js
import { allTopics } from './content.js';
import { isDue } from './srs.js';
import { newTopicProgress } from './progress.js';

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function questionsFor(topic, prog) {
  const pool = (topic.mcq || []).filter((q) => q.difficulty === prog.difficulty);
  return pool.length ? pool : (topic.mcq || []);
}

export function pickQuizQuestions({ content, topics, mode, now, excludedChapterIds = [], count = 10, rand = Math.random }) {
  const prog = (id) => topics[id] || newTopicProgress();
  let ts = allTopics(content, excludedChapterIds).filter((t) => (t.mcq || []).length);
  if (mode === 'weak') ts = ts.filter((t) => prog(t.id).weak);
  if (mode === 'revision') ts = ts.filter((t) => isDue(prog(t.id).nextReview, now));
  if (mode === 'micro') {
    ts = [...ts].sort((a, b) =>
      Number(isDue(prog(b.id).nextReview, now)) - Number(isDue(prog(a.id).nextReview, now)));
  }
  const pools = ts.map((t) => ({ topic: t, pool: shuffle(questionsFor(t, prog(t.id)), rand) }));
  const picked = [];
  let round = 0;
  while (picked.length < count) {
    let took = false;
    for (const p of pools) {
      if (picked.length >= count) break;
      if (p.pool.length > round) {
        picked.push({ topicId: p.topic.id, topicTitle: p.topic.title, q: p.pool[round] });
        took = true;
      }
    }
    if (!took) break;
    round++;
  }
  return picked;
}

function weightFor(topic, analysis) {
  if (!analysis || !Array.isArray(analysis.topicFrequencies)) return 1;
  const hit = analysis.topicFrequencies.find(
    (f) => topic.title.includes(f.topic) || f.topic.includes(topic.title));
  return hit ? Math.max(1, Math.round(1 + hit.percentage / 10)) : 1;
}

export function pickExamQuestions({ content, analysis, excludedChapterIds = [], count = 20, rand = Math.random }) {
  const ts = allTopics(content, excludedChapterIds).filter((t) => (t.mcq || []).length);
  if (!ts.length) return [];
  const weighted = [];
  for (const t of ts) {
    for (let i = 0; i < weightFor(t, analysis); i++) weighted.push(t);
  }
  const picked = [];
  const used = new Set();
  let guard = 0;
  while (picked.length < count && guard < count * 20) {
    guard++;
    const t = weighted[Math.floor(rand() * weighted.length)];
    const nonEasy = t.mcq.filter((q) => q.difficulty !== 'easy' && !used.has(q));
    const pool = nonEasy.length ? nonEasy : t.mcq.filter((q) => !used.has(q));
    if (!pool.length) continue;
    const q = pool[Math.floor(rand() * pool.length)];
    used.add(q);
    picked.push({ topicId: t.id, topicTitle: t.title, q });
  }
  return picked;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/` — Expected: all PASS.

- [ ] **Step 5: Implement the quiz view**

`js/views/quiz.js`:
```js
import { escapeHtml } from '../ui.js';
import { pickQuizQuestions } from '../core/picker.js';
import { recordAnswer, newTopicProgress, XP } from '../core/progress.js';
import { recordSession, evaluateBadges } from '../core/stats.js';
import { allTopics } from '../core/content.js';

const MODE_TITLES = {
  micro: '⚡ Γρήγορο Κουίζ',
  weak: '⚠️ Αδύναμα Σημεία',
  revision: '📅 Επανάληψη',
};

export async function render(el, ctx) {
  const { courseId, mode } = ctx.params;
  const content = await ctx.getContent(courseId);
  const excluded = ctx.state.settings.excludedChapters[courseId] || [];
  const questions = pickQuizQuestions({
    content, topics: ctx.state.topics, mode,
    now: new Date().toISOString(), excludedChapterIds: excluded, count: 10,
  });

  if (!questions.length) {
    el.innerHTML = `<div class="card"><h2>${MODE_TITLES[mode] || 'Κουίζ'}</h2>
      <p class="muted">${mode === 'weak'
        ? 'Κανένα αδύναμο θέμα — μπράβο! 🎉'
        : mode === 'revision'
          ? 'Καμία επανάληψη δεν εκκρεμεί σήμερα. 🎉'
          : 'Δεν υπάρχουν διαθέσιμες ερωτήσεις.'}</p>
      <a class="btn" href="#/course/${courseId}">Πίσω στην ύλη</a></div>`;
    return;
  }

  const startedAt = Date.now();
  let i = 0;
  let correctCount = 0;
  let xpEarned = 0;

  const showQuestion = () => {
    const { topicId, topicTitle, q } = questions[i];
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <a class="btn btn-ghost" href="#/course/${courseId}">✕</a>
        <span class="grow muted">${MODE_TITLES[mode] || 'Κουίζ'} · ${i + 1}/${questions.length}</span>
        <span class="pill pill-gold">+${xpEarned} XP</span>
      </div>
      <div class="card">
        <p class="muted" style="font-size:13px">${escapeHtml(topicTitle)} · ${q.difficulty === 'easy' ? 'εύκολη' : q.difficulty === 'hard' ? 'δύσκολη' : 'μέτρια'}</p>
        <h2>${escapeHtml(q.question)}</h2>
        ${q.options.map((o, idx) => `<button class="qopt" data-idx="${idx}">${escapeHtml(o)}</button>`).join('')}
        <div id="feedback"></div>
      </div>`;

    el.querySelectorAll('.qopt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = Number(btn.dataset.idx);
        const correct = chosen === q.correctIndex;
        if (correct) { correctCount++; xpEarned += XP[q.difficulty] ?? 10; }

        const prev = ctx.state.topics[topicId] || newTopicProgress();
        ctx.state.topics[topicId] = recordAnswer(prev, {
          correct, questionDifficulty: q.difficulty, now: new Date().toISOString(),
        });
        ctx.save();

        el.querySelectorAll('.qopt').forEach((b) => {
          b.disabled = true;
          const bi = Number(b.dataset.idx);
          if (bi === q.correctIndex) b.classList.add('correct');
          else if (bi === chosen) b.classList.add('wrong');
        });
        document.getElementById('feedback').innerHTML = `
          <p><b>${correct ? '✅ Σωστό!' : '❌ Λάθος.'}</b> ${escapeHtml(q.explanation)}</p>
          <button class="btn btn-gold btn-block" id="next">${i + 1 < questions.length ? 'Επόμενη' : 'Ολοκλήρωση'}</button>`;
        document.getElementById('next').addEventListener('click', () => {
          i++;
          if (i < questions.length) showQuestion(); else finish();
        });
      });
    });
  };

  const finish = () => {
    const timeSeconds = Math.round((Date.now() - startedAt) / 1000);
    const now = new Date().toISOString();
    ctx.state.stats = recordSession(ctx.state.stats, { now, xp: xpEarned, timeSeconds });
    const masteredTopics = Object.values(ctx.state.topics).filter((p) => p.mastery >= 80).length;
    ctx.state.stats = evaluateBadges(ctx.state.stats, { masteredTopics }, now);
    ctx.state.sessions.push({
      date: now, mode, courseId,
      total: questions.length, correct: correctCount, timeSeconds, xp: xpEarned,
    });
    ctx.state.sessions = ctx.state.sessions.slice(-50);
    ctx.save();

    const pct = Math.round((correctCount / questions.length) * 100);
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>${pct >= 80 ? '🎉 Εξαιρετικά!' : pct >= 50 ? '💪 Καλή δουλειά!' : '📚 Χρειάζεται μελέτη.'}</h2>
        <div class="stat-row">
          <div class="stat"><b>${correctCount}/${questions.length}</b><span>Σωστές</span></div>
          <div class="stat"><b>${pct}%</b><span>Επίδοση</span></div>
          <div class="stat"><b>+${xpEarned}</b><span>XP</span></div>
        </div>
        <a class="btn btn-gold btn-block" href="#/quiz/${courseId}/${mode}">Νέο κουίζ</a>
        <a class="btn btn-ghost btn-block" href="#/">Αρχική</a>
      </div>`;
  };

  showQuestion();
}
```

Note: `allTopics` import is unused in the final version — remove it if the linter of your conscience objects.

- [ ] **Step 6: Wire into app.js**

Add `import * as quiz from './views/quiz.js';` and `quiz` to `VIEWS`.

- [ ] **Step 7: Verify in browser preview**

Take a full 10-question quiz on Κλάδος Ζωής. Expected: Greek questions render; picking wrong shows red + correct in green + explanation; results screen shows score and XP; dashboard afterwards shows streak 1, XP > 0, topic mastery pills changed; localStorage `ale.v1` contains updated topics. Weak mode with no weak topics shows the 🎉 message.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: question picker and quiz view (micro/weak/revision)"
```

---

### Task 12: Flashcards view

**Files:**
- Create: `js/views/flashcards.js`
- Modify: `js/app.js` (add `flashcards` to imports/VIEWS)

**Interfaces:**
- Consumes: ctx contract; flashcards field from content shape; `recordAnswer` (self-graded answers use the topic's current progress difficulty as `questionDifficulty`); `recordSession`/`evaluateBadges` on finish (same as quiz).

- [ ] **Step 1: Implement**

`js/views/flashcards.js`:
```js
import { escapeHtml } from '../ui.js';
import { allTopics } from '../core/content.js';
import { isDue } from '../core/srs.js';
import { recordAnswer, newTopicProgress } from '../core/progress.js';
import { recordSession, evaluateBadges } from '../core/stats.js';

export async function render(el, ctx) {
  const { courseId } = ctx.params;
  const content = await ctx.getContent(courseId);
  const excluded = ctx.state.settings.excludedChapters[courseId] || [];
  const now = new Date().toISOString();
  const prog = (id) => ctx.state.topics[id] || newTopicProgress();

  // due topics first, then the rest; flatten all their flashcards
  const ts = allTopics(content, excluded).filter((t) => (t.flashcards || []).length);
  ts.sort((a, b) => Number(isDue(prog(b.id).nextReview, now)) - Number(isDue(prog(a.id).nextReview, now)));
  const cards = ts.flatMap((t) => t.flashcards.map((f) => ({ topicId: t.id, topicTitle: t.title, f })));

  if (!cards.length) {
    el.innerHTML = `<div class="card"><h2>🗂️ Κάρτες</h2>
      <p class="muted">Δεν υπάρχουν κάρτες για αυτό το μάθημα.</p>
      <a class="btn" href="#/course/${courseId}">Πίσω</a></div>`;
    return;
  }

  const startedAt = Date.now();
  let i = 0;
  let knew = 0;
  let xpEarned = 0;
  let flipped = false;

  const show = () => {
    const { topicId, topicTitle, f } = cards[i];
    flipped = false;
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <a class="btn btn-ghost" href="#/course/${courseId}">✕</a>
        <span class="grow muted">🗂️ Κάρτες · ${i + 1}/${cards.length}</span>
      </div>
      <p class="muted" style="font-size:13px">${escapeHtml(topicTitle)}</p>
      <div class="card flashcard" id="card">${escapeHtml(f.front)}</div>
      <div id="actions"><p class="muted" style="text-align:center">Πάτησε την κάρτα για την απάντηση</p></div>`;

    const card = document.getElementById('card');
    card.addEventListener('click', () => {
      if (flipped) return;
      flipped = true;
      card.innerHTML = escapeHtml(f.back);
      card.style.borderColor = 'var(--gold)';
      document.getElementById('actions').innerHTML = `
        <div class="row">
          <button class="btn grow" id="no">❌ Δεν το ήξερα</button>
          <button class="btn btn-gold grow" id="yes">✅ Το ήξερα</button>
        </div>`;
      const grade = (correct) => {
        const prev = prog(topicId);
        if (correct) { knew++; xpEarned += 10; }
        ctx.state.topics[topicId] = recordAnswer(prev, {
          correct, questionDifficulty: prev.difficulty, now: new Date().toISOString(),
        });
        ctx.save();
        i++;
        if (i < cards.length) show(); else finish();
      };
      document.getElementById('yes').addEventListener('click', () => grade(true));
      document.getElementById('no').addEventListener('click', () => grade(false));
    });
  };

  const finish = () => {
    const timeSeconds = Math.round((Date.now() - startedAt) / 1000);
    const nowIso = new Date().toISOString();
    ctx.state.stats = recordSession(ctx.state.stats, { now: nowIso, xp: xpEarned, timeSeconds });
    const masteredTopics = Object.values(ctx.state.topics).filter((p) => p.mastery >= 80).length;
    ctx.state.stats = evaluateBadges(ctx.state.stats, { masteredTopics }, nowIso);
    ctx.state.sessions.push({ date: nowIso, mode: 'flashcard', courseId, total: cards.length, correct: knew, timeSeconds, xp: xpEarned });
    ctx.state.sessions = ctx.state.sessions.slice(-50);
    ctx.save();
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>🗂️ Τέλος καρτών</h2>
        <div class="stat-row">
          <div class="stat"><b>${knew}/${cards.length}</b><span>Τις ήξερες</span></div>
          <div class="stat"><b>+${xpEarned}</b><span>XP</span></div>
          <div class="stat"><b>${Math.round(timeSeconds / 60)}′</b><span>Χρόνος</span></div>
        </div>
        <a class="btn btn-gold btn-block" href="#/flashcards/${courseId}">Ξανά</a>
        <a class="btn btn-ghost btn-block" href="#/">Αρχική</a>
      </div>`;
  };

  show();
}
```

- [ ] **Step 2: Wire into app.js, verify in preview**

Add import + `flashcards` to `VIEWS`. In preview: open Κάρτες on Κλάδος Ζωής, tap card (flips to back, border goes gold), grade a few, finish screen shows counts, XP lands in dashboard. Note: cards from due topics must appear before non-due ones after some quiz history exists.

- [ ] **Step 3: Run tests, commit**

Run: `node --test tests/` — all PASS, then:
```bash
git add -A && git commit -m "feat: flashcards with self-grading tied to adaptive engine"
```

---

### Task 13: Mock exam view (Προσομοίωση Εξέτασης)

**Files:**
- Create: `js/views/exam.js`
- Modify: `js/app.js` (add `exam` to imports/VIEWS)

**Interfaces:**
- Consumes: `pickExamQuestions` (Task 11), analysis via `ctx.getAnalysis(courseId)`, progress/stats recording same as quiz.
- Behavior: 20 questions (or as many as the bank allows), 30-minute countdown, **no per-question feedback** — answers collected, everything graded at the end; per-topic breakdown on the results screen; progress recorded per answer at the end; timer expiry auto-submits.

- [ ] **Step 1: Implement**

`js/views/exam.js`:
```js
import { escapeHtml } from '../ui.js';
import { pickExamQuestions } from '../core/picker.js';
import { recordAnswer, newTopicProgress } from '../core/progress.js';
import { recordSession, evaluateBadges } from '../core/stats.js';

const EXAM_MINUTES = 30;
const EXAM_QUESTIONS = 20;

export async function render(el, ctx) {
  const { courseId } = ctx.params;
  const content = await ctx.getContent(courseId);
  const analysis = await ctx.getAnalysis(courseId);
  const excluded = ctx.state.settings.excludedChapters[courseId] || [];
  const questions = pickExamQuestions({ content, analysis, excludedChapterIds: excluded, count: EXAM_QUESTIONS });

  if (!questions.length) {
    el.innerHTML = `<div class="card"><h2>📝 Προσομοίωση Εξέτασης</h2>
      <p class="muted">Δεν υπάρχουν διαθέσιμες ερωτήσεις.</p>
      <a class="btn" href="#/course/${courseId}">Πίσω</a></div>`;
    return;
  }

  // intro screen
  el.innerHTML = `
    <div class="card" style="text-align:center">
      <h2>📝 Προσομοίωση Εξέτασης</h2>
      <p>${questions.length} ερωτήσεις · ${EXAM_MINUTES} λεπτά · χωρίς βοήθεια ανά ερώτηση</p>
      ${analysis ? '<p class="muted">Οι ερωτήσεις σταθμίζονται με βάση την ανάλυση παλαιών θεμάτων.</p>' : ''}
      <button class="btn btn-gold btn-block" id="start">Έναρξη</button>
      <a class="btn btn-ghost btn-block" href="#/course/${courseId}">Άκυρο</a>
    </div>`;
  document.getElementById('start').addEventListener('click', run);

  function run() {
    const answers = new Array(questions.length).fill(null);
    let i = 0;
    const startedAt = Date.now();
    const deadline = startedAt + EXAM_MINUTES * 60 * 1000;
    let timerId = null;

    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      const mm = String(Math.floor(left / 60000)).padStart(2, '0');
      const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
      const t = document.getElementById('timer');
      if (t) t.textContent = `${mm}:${ss}`;
      if (left <= 0) { clearInterval(timerId); finish(); }
    };

    const show = () => {
      const { topicTitle, q } = questions[i];
      el.innerHTML = `
        <div class="row" style="margin-bottom:12px">
          <span class="grow muted">Ερώτηση ${i + 1}/${questions.length}</span>
          <span class="timer" id="timer">--:--</span>
        </div>
        <div class="card">
          <p class="muted" style="font-size:13px">${escapeHtml(topicTitle)}</p>
          <h2>${escapeHtml(q.question)}</h2>
          ${q.options.map((o, idx) => `
            <button class="qopt ${answers[i] === idx ? 'correct' : ''}" data-idx="${idx}">${escapeHtml(o)}</button>`).join('')}
          <div class="row">
            <button class="btn btn-ghost grow" id="prev" ${i === 0 ? 'disabled' : ''}>← Προηγούμενη</button>
            ${i + 1 < questions.length
              ? '<button class="btn grow" id="nextq">Επόμενη →</button>'
              : '<button class="btn btn-gold grow" id="submit">Υποβολή</button>'}
          </div>
        </div>`;
      tick();
      el.querySelectorAll('.qopt').forEach((btn) => {
        btn.addEventListener('click', () => {
          answers[i] = Number(btn.dataset.idx);
          el.querySelectorAll('.qopt').forEach((b) => b.classList.remove('correct'));
          btn.classList.add('correct');
        });
      });
      const prev = document.getElementById('prev');
      if (prev) prev.addEventListener('click', () => { if (i > 0) { i--; show(); } });
      const nextq = document.getElementById('nextq');
      if (nextq) nextq.addEventListener('click', () => { i++; show(); });
      const submit = document.getElementById('submit');
      if (submit) submit.addEventListener('click', () => {
        const blank = answers.filter((a) => a === null).length;
        if (!blank || confirm(`Έχεις ${blank} αναπάντητες ερωτήσεις. Υποβολή;`)) { clearInterval(timerId); finish(); }
      });
    };

    const finish = () => {
      const nowIso = new Date().toISOString();
      const timeSeconds = Math.round((Date.now() - startedAt) / 1000);
      let correctCount = 0;
      let xpEarned = 0;
      const perTopic = {};
      questions.forEach(({ topicId, topicTitle, q }, idx) => {
        const correct = answers[idx] === q.correctIndex;
        if (correct) { correctCount++; xpEarned += 20; }
        const prev = ctx.state.topics[topicId] || newTopicProgress();
        ctx.state.topics[topicId] = recordAnswer(prev, { correct, questionDifficulty: q.difficulty, now: nowIso });
        perTopic[topicTitle] ??= { correct: 0, total: 0 };
        perTopic[topicTitle].total++;
        if (correct) perTopic[topicTitle].correct++;
      });
      ctx.state.stats = recordSession(ctx.state.stats, { now: nowIso, xp: xpEarned, timeSeconds });
      const masteredTopics = Object.values(ctx.state.topics).filter((p) => p.mastery >= 80).length;
      ctx.state.stats = evaluateBadges(ctx.state.stats, { masteredTopics }, nowIso);
      ctx.state.sessions.push({ date: nowIso, mode: 'exam', courseId, total: questions.length, correct: correctCount, timeSeconds, xp: xpEarned });
      ctx.state.sessions = ctx.state.sessions.slice(-50);
      ctx.save();

      const pct = Math.round((correctCount / questions.length) * 100);
      el.innerHTML = `
        <div class="card" style="text-align:center">
          <h2>${pct >= 70 ? '🎉 Επιτυχία!' : '📚 Θέλει δουλειά ακόμη'}</h2>
          <div class="stat-row">
            <div class="stat"><b>${correctCount}/${questions.length}</b><span>Σωστές</span></div>
            <div class="stat"><b>${pct}%</b><span>Επίδοση</span></div>
            <div class="stat"><b>${Math.round(timeSeconds / 60)}′</b><span>Χρόνος</span></div>
          </div>
        </div>
        <div class="card">
          <h2>Ανά θέμα</h2>
          ${Object.entries(perTopic).map(([title, r]) => `
            <div class="list-item"><span class="grow">${escapeHtml(title)}</span>
              <span class="pill ${r.correct === r.total ? 'pill-ok' : r.correct === 0 ? 'pill-bad' : ''}">${r.correct}/${r.total}</span></div>`).join('')}
          <a class="btn btn-gold btn-block" href="#/exam/${courseId}">Νέα προσομοίωση</a>
          <a class="btn btn-ghost btn-block" href="#/">Αρχική</a>
        </div>`;
    };

    timerId = setInterval(tick, 500);
    show();
  }
}
```

- [ ] **Step 2: Wire into app.js, verify in preview**

Add import + `exam` to `VIEWS`. In preview: start an exam, answer some questions (navigation ← → keeps selections), submit with blanks triggers the Greek confirm, results show per-topic breakdown, dashboard XP/mastery updated. The selected-option highlight uses the `correct` class purely as "selected" styling before grading — acceptable reuse.

- [ ] **Step 3: Run tests, commit**

```bash
git add -A && git commit -m "feat: timed mock exam with per-topic results"
```

---

### Task 14: Analysis + Settings views

**Files:**
- Create: `js/views/analysis.js`, `js/views/settings.js`
- Modify: `js/app.js` (add `analysis`, `settings` to imports/VIEWS)

**Interfaces:**
- Consumes: analysis shape (Task 7), `validateSnapshot`/`mergeState` (Task 6), `freshState` (Task 2), `BADGES` (Task 5).
- Produces: export file named `ale-progress-YYYY-MM-DD.json` with contents `{...state, exportedAt}` (a valid snapshot per `validateSnapshot`).

- [ ] **Step 1: Implement analysis view**

`js/views/analysis.js`:
```js
import { escapeHtml } from '../ui.js';

export async function render(el, ctx) {
  const { courseId } = ctx.params;
  const course = ctx.courses.courses.find((c) => c.id === courseId);
  const a = await ctx.getAnalysis(courseId);

  if (!a) {
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px"><a class="btn btn-ghost" href="#/course/${courseId}">← Πίσω</a></div>
      <div class="card"><h2>📊 Ανάλυση Εξετάσεων</h2>
      <p class="muted">Δεν υπάρχει ακόμη ανάλυση παλαιών θεμάτων για το μάθημα «${escapeHtml(course?.title || courseId)}».
      Θα προστεθεί όταν αναλυθούν τα past papers.</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="row" style="margin-bottom:12px"><a class="btn btn-ghost" href="#/course/${courseId}">← Πίσω</a>
      <h2 class="grow" style="margin:0">📊 Ανάλυση Εξετάσεων</h2></div>
    ${a.sourcePapers?.length ? `<div class="card"><p class="muted">Πηγές: ${a.sourcePapers.map(escapeHtml).join(', ')}</p></div>` : ''}
    <div class="card">
      <h2>Συχνότητα θεμάτων</h2>
      <table class="freq">
        ${(a.topicFrequencies || []).map((f) => `
          <tr><td>${escapeHtml(f.topic)}</td><td style="width:45%">
            <div class="bar"><span style="width:${f.percentage}%"></span></div></td>
            <td>${f.percentage}%</td></tr>`).join('')}
      </table>
    </div>
    ${a.questionTypes?.length ? `<div class="card"><h2>Τύποι ερωτήσεων</h2>
      <table class="freq">${a.questionTypes.map((t) => `
        <tr><td>${escapeHtml(t.type)}</td><td>${t.count}</td><td>${t.percentage}%</td></tr>`).join('')}</table>
    </div>` : ''}
    ${a.killerFacts?.length ? `<div class="card"><h2>💡 Σημεία που επανέρχονται</h2>
      <ul>${a.killerFacts.map((k) => `<li>${escapeHtml(k.fact)} <span class="pill">×${k.frequency}</span></li>`).join('')}</ul>
    </div>` : ''}
    ${a.recommendations?.length ? `<div class="card"><h2>🎯 Συστάσεις</h2>
      <ul>${a.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    </div>` : ''}
  `;
}
```

- [ ] **Step 2: Implement settings view**

`js/views/settings.js`:
```js
import { fmtDate } from '../ui.js';
import { validateSnapshot, mergeState } from '../core/merge.js';
import { freshState, saveState } from '../core/store.js';
import { dateStr, BADGES } from '../core/stats.js';

export async function render(el, ctx) {
  const s = ctx.state.stats;
  el.innerHTML = `
    <div class="card">
      <h2>📆 Ημερομηνία εξετάσεων</h2>
      <p class="muted">Τρέχουσα: ${fmtDate(ctx.examDateIso())}</p>
      <div class="row">
        <input type="date" id="examdate" value="${ctx.examDateIso()}">
        <button class="btn" id="savedate">Αποθήκευση</button>
      </div>
    </div>
    <div class="card">
      <h2>🏆 Παράσημα</h2>
      <div class="badgegrid">
        ${BADGES.map((b) => {
          const earned = s.badges.find((e) => e.id === b.id);
          return `<div class="badge ${earned ? 'earned' : ''}">
            <div class="icon">${b.icon}</div><div class="name">${b.name}</div>
            ${earned ? `<div class="name muted">${earned.earnedDate}</div>` : ''}</div>`;
        }).join('')}
      </div>
    </div>
    <div class="card">
      <h2>🔄 Συγχρονισμός συσκευών</h2>
      <p class="muted">Η πρόοδος αποθηκεύεται μόνο σε αυτή τη συσκευή. Για μεταφορά: Εξαγωγή εδώ → Εισαγωγή στην άλλη συσκευή.</p>
      <button class="btn btn-block" id="export">⬇️ Εξαγωγή προόδου</button>
      <label class="btn btn-ghost btn-block" style="cursor:pointer">⬆️ Εισαγωγή προόδου
        <input type="file" id="import" accept=".json,application/json" style="display:none"></label>
      <p id="syncmsg" class="muted"></p>
    </div>
    <div class="card">
      <h2>🗑️ Επαναφορά</h2>
      <p class="muted">Διαγράφει όλη την πρόοδο σε αυτή τη συσκευή. Η ύλη δεν επηρεάζεται.</p>
      <button class="btn btn-block" style="background:var(--bad)" id="reset">Διαγραφή προόδου</button>
    </div>`;

  document.getElementById('savedate').addEventListener('click', () => {
    const v = document.getElementById('examdate').value;
    if (v) { ctx.state.settings.examDate = v; ctx.save(); ctx.navigate('#/'); }
  });

  document.getElementById('export').addEventListener('click', () => {
    const blob = new Blob(
      [JSON.stringify({ ...ctx.state, exportedAt: new Date().toISOString() }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ale-progress-${dateStr(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('import').addEventListener('change', async (e) => {
    const msg = document.getElementById('syncmsg');
    const file = e.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      const v = validateSnapshot(imported);
      if (!v.ok) { msg.textContent = `⚠️ ${v.error}`; return; }
      const merged = mergeState(ctx.state, imported);
      Object.assign(ctx.state, merged);
      ctx.save();
      msg.textContent = '✅ Η εισαγωγή ολοκληρώθηκε. Η πρόοδος συγχωνεύτηκε.';
    } catch {
      msg.textContent = '⚠️ Το αρχείο δεν είναι έγκυρο JSON.';
    }
  });

  document.getElementById('reset').addEventListener('click', () => {
    if (confirm('Σίγουρα; Όλη η πρόοδος σε αυτή τη συσκευή θα διαγραφεί.')) {
      const fresh = freshState();
      Object.keys(ctx.state).forEach((k) => { delete ctx.state[k]; });
      Object.assign(ctx.state, fresh);
      saveState(ctx.state, window.localStorage);
      ctx.navigate('#/');
    }
  });
}
```

- [ ] **Step 3: Wire into app.js, verify in preview**

Add imports + `analysis`, `settings` to `VIEWS`. In preview: Ανάλυση shows the "no analysis yet" message (no analysis files exist yet). Ρυθμίσεις: change exam date → countdown updates; export downloads `ale-progress-2026-08-15.json`; re-import the same file → success message; import a text file → Greek error; reset clears progress after confirm.

- [ ] **Step 4: Run tests, commit**

```bash
git add -A && git commit -m "feat: exam analysis view, settings with export/import/reset"
```

---

### Task 15: PWA — manifest, icons, service worker

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `scripts/make_icons.py`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`
- Modify: `index.html` (manifest link, iOS meta, SW registration)

**Interfaces:**
- Produces: installable PWA; offline capability via network-first cache. Cache name `ale-v1` — **bump this string on every future content update** so devices refresh.

- [ ] **Step 1: Generate icons (stdlib-only Python, no Pillow)**

`scripts/make_icons.py`:
```python
"""Generate flat PNG icons (navy background, gold rounded square) with stdlib only."""
import struct, zlib, os

NAVY = (17, 18, 40)
GOLD = (245, 184, 24)

def make_png(path, size):
    inset = size // 5
    r2 = (size // 2 - inset) ** 2
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter byte
        for x in range(size):
            dx, dy = x - size // 2, y - size // 2
            row += bytes(GOLD if dx * dx + dy * dy <= r2 else NAVY)
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(path, os.path.getsize(path), 'bytes')

os.makedirs('icons', exist_ok=True)
make_png('icons/icon-192.png', 192)
make_png('icons/icon-512.png', 512)
make_png('icons/apple-touch-icon.png', 180)
```

Run: `python scripts/make_icons.py` — Expected: three PNGs created (navy square, gold disc).

- [ ] **Step 2: Write manifest**

`manifest.webmanifest`:
```json
{
  "name": "ALE — Μηχανή Προσαρμοστικής Μάθησης",
  "short_name": "ALE",
  "lang": "el",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#111228",
  "theme_color": "#111228",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 3: Write the service worker**

`sw.js`:
```js
const CACHE = 'ale-v1'; // bump on every content/app update
const CORE = ['./', './index.html', './css/app.css', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
```

- [ ] **Step 4: Update index.html**

In `<head>`, after the theme-color meta, add:
```html
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

At the end of `<body>`, after the app script:
```html
  <script>
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js');
    }
  </script>
```

- [ ] **Step 5: Verify in preview**

Reload twice on `http://localhost:8000`. Expected: no console errors, `navigator.serviceWorker.controller` non-null on second load. Network tab shows JSON served (network-first). App still fully works.

- [ ] **Step 6: Run tests, commit**

```bash
git add -A && git commit -m "feat: PWA manifest, generated icons, offline service worker"
```

---

### Task 16: Full verification pass + deployment docs

**Files:**
- Create: `README.md`
- Modify: anything the verification pass flushes out

**Interfaces:**
- Consumes: the complete app.
- Produces: verified app + README with GitHub Pages deployment and iPhone install steps.

- [ ] **Step 1: Run the whole test suite**

Run: `node --test tests/` — Expected: all PASS, zero failures.

- [ ] **Step 2: Full browser walkthrough (desktop viewport)**

In the preview: dashboard → course → topic → quiz (complete one) → flashcards (complete a few) → exam (complete one) → analysis → settings (change date, export, import, reset, then re-import the export to restore). Expected: no console errors anywhere; Greek text renders correctly throughout; XP/streak/mastery numbers consistent between views.

- [ ] **Step 3: Mobile + dark-mode pass**

Resize preview to mobile (375×812): every view usable, no horizontal scroll, bottom nav reachable, quiz buttons comfortably tappable. Switch color scheme to dark: readable contrast everywhere (cards, pills, bars).

- [ ] **Step 4: Write README.md**

```markdown
# ALE — Μηχανή Προσαρμοστικής Μάθησης

Προσωπική πλατφόρμα μελέτης για τις ασφαλιστικές εξετάσεις (3 Οκτωβρίου 2026).
Στατική εφαρμογή HTML/CSS/JS — χωρίς backend, χωρίς build.

## Τοπική εκτέλεση

    python -m http.server 8000

Άνοιξε http://localhost:8000 (το άνοιγμα του index.html απευθείας ΔΕΝ δουλεύει —
τα JSON της ύλης θέλουν server).

## Δοκιμές

    node --test tests/

## Ανάπτυξη στο GitHub Pages

1. `gh repo create ALE --private --source . --push` (ή δημιουργία repo + push χειροκίνητα)
2. GitHub → Settings → Pages → Source: `main`, φάκελος `/ (root)` → Save
3. Η εφαρμογή σερβίρεται στο `https://<username>.github.io/ALE/`

**Σημείωση:** ιδιωτικά repos έχουν Pages μόνο με GitHub Pro. Εναλλακτικά: δημόσιο repo
(η ύλη είναι δημόσια ορατή) ή Cloudflare Pages / Netlify (δωρεάν, ιδιωτικό repo).

## Εγκατάσταση σε iPhone/iPad

1. Άνοιξε το URL στο Safari
2. Κουμπί Κοινοποίησης → «Προσθήκη στην οθόνη Αφετηρίας»
3. Η εφαρμογή δουλεύει και offline μετά την πρώτη φόρτωση

## Συγχρονισμός συσκευών

Ρυθμίσεις → Εξαγωγή προόδου (κατεβάζει JSON) → στείλε το αρχείο στην άλλη συσκευή
(AirDrop/email) → Ρυθμίσεις → Εισαγωγή προόδου. Η συγχώνευση κρατά πάντα το πιο
πρόσφατο ανά θέμα και τα μέγιστα στατιστικά.

## Ενημέρωση ύλης

Η ύλη ζει σε `data/<course>/content.json` και παράγεται από το Claude Code από τα
αρχεία ύλης (PDF/DOCX). Μετά από κάθε ενημέρωση ύλης: bump το `CACHE` στο `sw.js`
(π.χ. `ale-v2`) και push.
```

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "docs: README with deployment and device-sync instructions"
```

- [ ] **Step 6: Offer deployment**

Ask the user whether to create the GitHub repo now (`gh repo create` if `gh` is authenticated, otherwise walk them through it) and enable Pages — public repo (free Pages, content visible) vs private (needs Pro) vs Cloudflare/Netlify is **their call**; surface the trade-off from the README note.

---

## Post-plan follow-ups (separate work, not part of this plan)

1. **Real content generation:** user provides Κλάδος Ζωής source files + the third course + past papers with context notes → Claude Code generates full `content.json` (every topic: summary, ≥6 MCQs across difficulties, ≥3 flashcards, definitions, killer facts, traps, exam question) and `exam-analysis.json`, replacing the provisional Base44 conversion.
2. **Deployment execution** if not done in Task 16 Step 6.

## Self-Review (done at authoring time)

- **Spec coverage:** every spec section maps to a task — architecture (1), storage/sync (2, 6, 14), SRS with exact 1-3-7-10-14-19 intervals (3), adaptive engine + mastery formula + XP values (4), gamification (5), content pipeline shape (7, 8), all six page groups (9, 10, 11, 12, 13, 14), passed-course handling (8 data + 9 dashboard due-queue exclusion), error handling in Greek (2, 6, 7, 9, 14), PWA/offline (15), verification + GitHub Pages (16). Exam-analysis *generation* is intentionally post-plan (needs user's past papers) — the app-side consumption (14) and weighting (11, 13) are in scope.
- **Placeholder scan:** no TBDs; all steps carry real code or exact commands.
- **Type consistency:** progress fields (`consecCorrect`, `intervalIndex`, `nextReview`, `lastStudied`), state shape (`topics`, `stats`, `sessions`, `settings.excludedChapters`), ctx contract (`getContent`, `getAnalysis`, `examDateIso`), and content field names (`keyDefinitions`, `mcq`, `correctIndex`) are used identically across Tasks 2–14.
