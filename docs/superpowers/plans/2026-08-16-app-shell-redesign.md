# App Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ALE's single-column mobile-only layout with a responsive app shell — collapsible sidebar on desktop, icon rail on tablet, off-canvas drawer plus the existing bottom nav on mobile — and a livelier dashboard with stat cards, progress rings, and a recent-activity panel.

**Architecture:** A new `js/shell.js` renders persistent chrome once at startup outside `#view` and exposes pure model functions (`sidebarNavItems`, `recentActivity`, `readinessPct`) that are unit-tested. `js/app.js` calls into it on every route change to refresh active-state and stat chips. Views keep owning `#view.innerHTML` exactly as today; only their header rows change to a shared helper.

**Tech Stack:** Vanilla ES modules, hand-written CSS with custom properties, Node built-in test runner. Zero dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-08-16-app-shell-redesign-design.md`

## Global Constraints

- Zero npm dependencies; no build step; vanilla ES modules only.
- `<main id="view">` keeps that exact id — `js/app.js` renders into it and binds the same-hash delegated click handler to it.
- An element with id `countdown` must exist in the DOM at all times — `renderCountdown()` in `js/app.js` writes to it via `getElementById`. Exactly ONE element may carry that id.
- `ctx.onCleanup` / single-slot `viewCleanup` behaviour is untouched (`js/views/exam.js`'s timer depends on it firing before `#view` is replaced).
- Breakpoints: mobile `< 768px`, tablet `768–1023px`, desktop `≥ 1024px`. Declared once as a comment convention; CSS uses `@media (min-width: 768px)` and `@media (min-width: 1024px)` only (mobile-first).
- Sidebar widths: expanded `260px`, rail `72px`. Declared as `--sidebar-w` and `--sidebar-rail-w`.
- Chrome heights come from `--topbar-h` and `--bottomnav-h`; nothing may hard-code `76px` again.
- Safe-area insets (`env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`) must remain on whatever element is the top and bottom chrome in each band.
- `.edittoolbar` (material editing, `position: sticky`) must offset by `--topbar-h` where the top bar is visible, and `0` where it is not.
- No change to learning logic: SRS, mastery, difficulty, XP, badges, picker, exam simulation, and the material-editing feature stay behaviourally identical.
- Existing tests must stay green at every commit (148 passing at plan time).
- UI copy in Greek; English labels acceptable where clearer.
- The final task bumps `sw.js` to `ale-v11` and adds any new JS file to the `CORE` precache list (there is a `tests/sw.test.js` drift check that will fail otherwise).

---

## File map

| File | Role |
|---|---|
| Create `js/shell.js` | Renders sidebar/topbar/drawer; pure model fns `sidebarNavItems`, `recentActivity`, `readinessPct`, `MODE_LABELS` |
| Create `tests/shell.test.js` | Unit tests for the three pure functions |
| Modify `index.html` | New shell DOM, favicon link |
| Modify `css/app.css` | Shell layout, three bands, sidebar, drawer, stat cards, rings, activity panel, header helper |
| Modify `js/app.js` | Mount shell once; refresh it per route |
| Modify `js/ui.js` | `pageHeader()` helper |
| Modify `js/views/dashboard.js` | Stat cards, progress rings, activity panel |
| Modify `js/views/{course,topic,quiz,flashcards,exam,analysis,chaptertest,settings}.js` | Use `pageHeader()`; drop ad-hoc inline header styles |
| Modify `sw.js` | `ale-v11`, precache new JS |

---

### Task 1: Shell model functions

Pure logic first, so the DOM work in Task 2 has a tested model to render.

**Files:**
- Create: `js/shell.js`
- Test: `tests/shell.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MODE_LABELS` — `{topic_check, chapter_test, flashcard, exam, micro, weak, revision}` → Greek label
  - `sidebarNavItems(courses, hash) -> [{label, href, icon, active, group}]`
  - `recentActivity(sessions, n = 5) -> [{label, detail, xp, date}]`
  - `readinessPct(courses, topicsByCourse, progressByTopicId) -> number`

- [ ] **Step 1: Write the failing tests**

```js
// tests/shell.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sidebarNavItems, recentActivity, readinessPct, MODE_LABELS } from '../js/shell.js';

const COURSES = { examDate: '2026-10-03', courses: [
  { id: 'klados-zois', title: 'Κλάδος Ζωής', status: 'active' },
  { id: 'basikes-arxes', title: 'Βασικές Αρχές Ασφαλίσεων', status: 'passed' },
] };

test('nav starts with dashboard and ends with settings', () => {
  const items = sidebarNavItems(COURSES, '#/');
  assert.equal(items[0].href, '#/');
  assert.equal(items[items.length - 1].href, '#/settings');
});

test('every course contributes its five destinations', () => {
  const items = sidebarNavItems(COURSES, '#/');
  const zois = items.filter((i) => i.group === 'klados-zois');
  assert.deepEqual(zois.map((i) => i.href), [
    '#/course/klados-zois', '#/quiz/klados-zois/micro', '#/flashcards/klados-zois',
    '#/exam/klados-zois', '#/analysis/klados-zois',
  ]);
});

test('passed courses appear too, and carry a passed flag', () => {
  const items = sidebarNavItems(COURSES, '#/');
  assert.ok(items.some((i) => i.group === 'basikes-arxes'));
  assert.equal(items.find((i) => i.group === 'basikes-arxes').passed, true);
  assert.equal(items.find((i) => i.group === 'klados-zois').passed, false);
});

test('active flag matches the current route exactly', () => {
  const items = sidebarNavItems(COURSES, '#/quiz/klados-zois/micro');
  const active = items.filter((i) => i.active);
  assert.equal(active.length, 1);
  assert.equal(active[0].href, '#/quiz/klados-zois/micro');
});

test('a topic route activates its course entry', () => {
  const items = sidebarNavItems(COURSES, '#/topic/klados-zois/z3-1');
  const active = items.filter((i) => i.active);
  assert.equal(active.length, 1);
  assert.equal(active[0].href, '#/course/klados-zois');
});

test('a chapter-test route activates its course entry', () => {
  const items = sidebarNavItems(COURSES, '#/chaptertest/klados-zois/z-ch03');
  assert.equal(items.filter((i) => i.active)[0].href, '#/course/klados-zois');
});

test('an empty or unknown hash activates the dashboard', () => {
  for (const h of ['', '#/', '#/nonsense']) {
    const items = sidebarNavItems(COURSES, h);
    assert.equal(items.filter((i) => i.active).length, 1, h);
    assert.equal(items.find((i) => i.active).href, '#/', h);
  }
});

test('missing or malformed courses yields dashboard + settings only', () => {
  for (const c of [null, undefined, {}, { courses: null }]) {
    const items = sidebarNavItems(c, '#/');
    assert.deepEqual(items.map((i) => i.href), ['#/', '#/settings']);
  }
});

test('recentActivity returns the newest first, capped at n', () => {
  const sessions = [
    { date: '2026-08-10T10:00:00.000Z', mode: 'micro', total: 10, correct: 8, xp: 120 },
    { date: '2026-08-12T10:00:00.000Z', mode: 'exam', total: 40, correct: 30, xp: 400 },
    { date: '2026-08-11T10:00:00.000Z', mode: 'flashcard', total: 12, correct: 9, xp: 90 },
  ];
  const out = recentActivity(sessions, 2);
  assert.equal(out.length, 2);
  assert.equal(out[0].date, '2026-08-12T10:00:00.000Z');
  assert.equal(out[0].label, MODE_LABELS.exam);
  assert.equal(out[0].detail, '30/40 σωστές');
  assert.equal(out[0].xp, 400);
  assert.equal(out[1].label, MODE_LABELS.flashcard);
});

test('recentActivity tolerates empty, missing and unknown modes', () => {
  assert.deepEqual(recentActivity([], 5), []);
  assert.deepEqual(recentActivity(null, 5), []);
  assert.deepEqual(recentActivity(undefined), []);
  const out = recentActivity([{ date: '2026-08-12T10:00:00.000Z', mode: 'ΑΓΝΩΣΤΟ', total: 1, correct: 1, xp: 5 }], 5);
  assert.equal(out[0].label, 'Μελέτη');
});

test('readinessPct averages mastery over active-course topics only', () => {
  const courses = { courses: [
    { id: 'a', status: 'active' }, { id: 'b', status: 'passed' },
  ] };
  const topicsByCourse = { a: [{ id: 't1' }, { id: 't2' }], b: [{ id: 't3' }] };
  const progress = { t1: { mastery: 100 }, t2: { mastery: 50 }, t3: { mastery: 0 } };
  assert.equal(readinessPct(courses, topicsByCourse, progress), 75);
});

test('readinessPct treats untracked topics as zero and never divides by zero', () => {
  const courses = { courses: [{ id: 'a', status: 'active' }] };
  assert.equal(readinessPct(courses, { a: [{ id: 't1' }, { id: 't2' }] }, { t1: { mastery: 80 } }), 40);
  assert.equal(readinessPct(courses, { a: [] }, {}), 0);
  assert.equal(readinessPct({ courses: [] }, {}, {}), 0);
  assert.equal(readinessPct(null, null, null), 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/shell.test.js`
Expected: FAIL — cannot find module `js/shell.js`.

- [ ] **Step 3: Implement the pure half of `js/shell.js`**

```js
// js/shell.js
// Persistent app chrome: sidebar, top bar, mobile drawer. The model
// functions below are pure so they can be tested without a DOM; the
// rendering half (added in Task 2) consumes them.

export const MODE_LABELS = {
  topic_check: 'Έλεγχος θέματος',
  chapter_test: 'Τεστ κεφαλαίου',
  flashcard: 'Κάρτες',
  exam: 'Εξομοίωση εξέτασης',
  micro: 'Γρήγορο κουίζ',
  weak: 'Αδύναμα σημεία',
  revision: 'Επανάληψη',
};

const COURSE_LINKS = [
  { suffix: (id) => `#/course/${id}`, label: 'Ύλη', icon: '📚' },
  { suffix: (id) => `#/quiz/${id}/micro`, label: 'Κουίζ', icon: '⚡' },
  { suffix: (id) => `#/flashcards/${id}`, label: 'Κάρτες', icon: '🗂️' },
  { suffix: (id) => `#/exam/${id}`, label: 'Εξέταση', icon: '📝' },
  { suffix: (id) => `#/analysis/${id}`, label: 'Ανάλυση', icon: '📊' },
];

// Routes that have no sidebar entry of their own activate their course's
// Ύλη entry instead, so the user is never left with nothing highlighted.
function activeHref(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/');
  const [view, courseId] = parts;
  if (!view) return '#/';
  if (view === 'settings') return '#/settings';
  if (!courseId) return '#/';
  if (view === 'topic' || view === 'chaptertest' || view === 'course') return `#/course/${courseId}`;
  if (view === 'quiz') return `#/quiz/${courseId}/micro`;
  if (view === 'flashcards' || view === 'exam' || view === 'analysis') return `#/${view}/${courseId}`;
  return '#/';
}

export function sidebarNavItems(courses, hash) {
  const target = activeHref(hash);
  const list = Array.isArray(courses?.courses) ? courses.courses : [];
  const items = [{ label: 'Αρχική', href: '#/', icon: '🏠', group: null, passed: false }];
  for (const c of list) {
    for (const l of COURSE_LINKS) {
      items.push({
        label: l.label, href: l.suffix(c.id), icon: l.icon,
        group: c.id, groupTitle: c.title, passed: c.status === 'passed',
      });
    }
  }
  items.push({ label: 'Ρυθμίσεις', href: '#/settings', icon: '⚙️', group: null, passed: false });
  let matched = false;
  for (const i of items) {
    i.active = !matched && i.href === target;
    if (i.active) matched = true;
  }
  if (!matched) items[0].active = true;
  return items;
}

export function recentActivity(sessions, n = 5) {
  const list = Array.isArray(sessions) ? sessions : [];
  return [...list]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, n)
    .map((s) => ({
      label: MODE_LABELS[s.mode] || 'Μελέτη',
      detail: `${s.correct}/${s.total} σωστές`,
      xp: s.xp,
      date: s.date,
    }));
}

export function readinessPct(courses, topicsByCourse, progressByTopicId) {
  const list = Array.isArray(courses?.courses) ? courses.courses : [];
  let sum = 0;
  let count = 0;
  for (const c of list) {
    if (c.status !== 'active') continue;
    for (const t of topicsByCourse?.[c.id] || []) {
      sum += Number(progressByTopicId?.[t.id]?.mastery) || 0;
      count++;
    }
  }
  return count ? Math.round(sum / count) : 0;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/shell.test.js` then `node --test tests/*.test.js`
Expected: all pass (148 existing + 12 new).

- [ ] **Step 5: Commit**

```bash
git add js/shell.js tests/shell.test.js
git commit -m "feat: shell model functions (nav items, recent activity, readiness)"
```

---

### Task 2: Shell DOM and three-band layout

**Files:**
- Modify: `index.html`
- Modify: `css/app.css`
- Modify: `js/shell.js` (add the rendering half)
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `sidebarNavItems` (Task 1).
- Produces: `mountShell({courses, state, hash}) -> void` (idempotent; builds chrome once, then updates), `refreshShell({courses, state, hash}) -> void`, both exported from `js/shell.js`.

- [ ] **Step 1: Restructure `index.html`**

Keep `<head>` as it is apart from adding a favicon link. Replace the body's children with:

```html
<body>
  <div class="shell">
    <aside id="sidebar" class="sidebar" aria-label="Κύρια πλοήγηση"></aside>
    <div class="shell-main">
      <header class="topbar">
        <button id="drawertoggle" class="iconbtn" aria-label="Μενού" aria-expanded="false">☰</button>
        <a href="#/" class="brand">ALE</a>
        <span class="grow"></span>
      </header>
      <main id="view" class="view"></main>
    </div>
  </div>
  <div id="scrim" class="scrim" hidden></div>
  <nav class="bottomnav">
    <a href="#/">🏠 Αρχική</a>
    <a href="#/settings">⚙️ Ρυθμίσεις</a>
  </nav>
  <script type="module" src="js/app.js"></script>
  <!-- existing service-worker registration script unchanged -->
</body>
```

Add to `<head>`: `<link rel="icon" href="icons/icon-192.png">`.

Note the `#countdown` element is NOT here — Task 2 Step 2 renders it inside the sidebar, keeping exactly one element with that id.

- [ ] **Step 2: Add the rendering half to `js/shell.js`**

```js
// --- rendering (appended to js/shell.js) ---
import { escapeHtml } from './ui.js';

let built = false;

function sidebarHtml(courses, state, hash) {
  const items = sidebarNavItems(courses, hash);
  const groups = [];
  for (const i of items) {
    const key = i.group || '';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(i);
    else groups.push({ key, title: i.groupTitle, passed: i.passed, items: [i] });
  }
  return `
    <div class="sidebar-brand">
      <span class="sidebar-logo">🎓</span>
      <span class="sidebar-brandtext"><b>ALE</b><small>ΠΡΟΣΑΡΜΟΣΤΙΚΗ ΜΑΘΗΣΗ</small></span>
    </div>
    <div class="sidebar-chips">
      <span class="chip">⚡ ${Number(state.stats.totalXp) || 0} XP</span>
      <span class="chip">🔥 ${Number(state.stats.currentStreak) || 0}</span>
    </div>
    <nav class="sidebar-nav">
      ${groups.map((g) => `
        ${g.key ? `<p class="sidebar-group">${escapeHtml(g.title)}${g.passed ? ' ✓' : ''}</p>` : ''}
        ${g.items.map((i) => `<a class="sidebar-link${i.active ? ' active' : ''}" href="${i.href}">
          <span class="sidebar-icon">${i.icon}</span><span class="sidebar-label">${escapeHtml(i.label)}</span>
        </a>`).join('')}`).join('')}
    </nav>
    <div class="sidebar-foot">
      <span id="countdown" class="countdown"></span>
      <button id="collapsetoggle" class="iconbtn" aria-label="Σύμπτυξη">⟨⟩</button>
    </div>`;
}

export function mountShell(ctxLike) {
  refreshShell(ctxLike);
  if (built) return;
  built = true;
  const scrim = document.getElementById('scrim');
  const openDrawer = (open) => {
    document.body.classList.toggle('drawer-open', open);
    scrim.hidden = !open;
    document.getElementById('drawertoggle')?.setAttribute('aria-expanded', String(open));
  };
  document.getElementById('drawertoggle')?.addEventListener('click', () => {
    openDrawer(!document.body.classList.contains('drawer-open'));
  });
  scrim.addEventListener('click', () => openDrawer(false));
  document.getElementById('sidebar').addEventListener('click', (e) => {
    if (e.target.closest('a')) openDrawer(false);
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') openDrawer(false); });
}

export function refreshShell({ courses, state, hash }) {
  const el = document.getElementById('sidebar');
  if (el) el.innerHTML = sidebarHtml(courses, state, hash);
  const collapsed = !!state.settings.sidebarCollapsed;
  document.body.classList.toggle('sidebar-collapsed', collapsed);
}
```

The collapse toggle's click handler is wired in Task 3 (it needs `save`); this task only renders the button.

- [ ] **Step 3: Wire `js/app.js`**

Add `import { mountShell } from './shell.js';`. Inside `render()`, after `courses` is loaded and before `renderCountdown()`:

```js
  mountShell({ courses, state, hash: location.hash });
```

`renderCountdown()` still writes to `#countdown` and must run AFTER `mountShell` (the sidebar's innerHTML is what creates that element each refresh). Verify the ordering.

- [ ] **Step 4: Write the CSS bands in `css/app.css`**

Add these variables to `:root`: `--sidebar-w: 260px; --sidebar-rail-w: 72px; --topbar-h: 56px; --bottomnav-h: 76px; --content-max: 1100px; --sidebar-bg: #111228; --sidebar-text: #e8eaf6; --sidebar-muted: #8f96b8; --sidebar-active: rgba(245,184,24,.14);`

Requirements the CSS must satisfy (write it to match; verify each in the browser in Step 5):

**Mobile (base, no media query):** `.sidebar` is fixed, `width: var(--sidebar-w)`, translated off-canvas `translateX(-100%)`, `transition: transform .2s`; `body.drawer-open .sidebar` translates to `0`. `.scrim` is a fixed full-screen `rgba(0,0,0,.45)` shown only when the drawer is open. `.topbar` visible, `height: var(--topbar-h)`, `padding-top: max(0px, env(safe-area-inset-top))`, sticky. `.bottomnav` fixed as today with its safe-area padding; `body { padding-bottom: calc(var(--bottomnav-h) + env(safe-area-inset-bottom)); }`. `.view` keeps `max-width: 720px; margin: 0 auto; padding: 16px`.

**Tablet (`@media (min-width: 768px)`):** `.sidebar` is static within `.shell` (flex row), `width: var(--sidebar-rail-w)`, always visible, never translated; `.sidebar-label`, `.sidebar-brandtext`, `.sidebar-group` hidden; icons centred. `.bottomnav` `display: none` and `body` padding-bottom back to `0`. `.topbar` still visible (it carries the brand) but `#drawertoggle` hidden. `.scrim` never shown.

**Desktop (`@media (min-width: 1024px)`):** `.sidebar` `width: var(--sidebar-w)` with labels visible; `body.sidebar-collapsed` reverts it to the rail treatment (same rules as tablet). `.topbar` `display: none`; `.view` `max-width: var(--content-max); padding: 24px 32px`.

**Editing-toolbar reconciliation:** `.edittoolbar { top: var(--topbar-h); }` at base, and inside the desktop query `.edittoolbar { top: 0; }` (no top bar there).

**Sidebar internals:** dark background `var(--sidebar-bg)` in BOTH colour schemes; `.sidebar-link` rows with icon + label, rounded, `:hover` lightens, `.active` uses `--sidebar-active` with a gold left border; `.sidebar-group` is a small uppercase muted caption; `.sidebar-foot` pinned to the bottom with `margin-top: auto`; the whole sidebar is a flex column with `overflow-y: auto` and `height: 100vh` (`100dvh` where supported), `padding-top: max(12px, env(safe-area-inset-top))`.

Keep every existing rule that views still rely on (`.card`, `.btn*`, `.pill*`, `.stat*`, `.qopt`, `.flashcard`, `.list-item`, `.badge*`, `table.freq`, `.prose`, `.editbtn`, `.editing`, `.editstatus`).

- [ ] **Step 5: Verify in the browser**

Run `node --test tests/*.test.js` first (must stay green — 160 tests).

Serve at `http://localhost:8000` and hard-reload with a cache-busting query (`?v=N`); unregister the service worker first if changes don't appear. Check at each width with `resize_window`:
- **375px:** bottom nav visible, sidebar off-screen, ☰ opens it over a scrim, tapping a link closes it and navigates, Escape closes it, content is not horizontally scrollable.
- **768px:** icon rail visible and static, no bottom nav, no scrim, content fills the remaining width.
- **1280px:** full sidebar with labels, no top bar, content centred at `--content-max`.
- Dark mode at 1280px (`resize_window` with `colorScheme: 'dark'`): sidebar stays dark, cards and text readable.
- Exactly one `#countdown` element exists and shows the day count: `document.querySelectorAll('#countdown').length === 1`.
- Navigate to `#/quiz/klados-zois/micro` and confirm the sidebar highlights exactly one entry.

- [ ] **Step 6: Commit**

```bash
git add index.html css/app.css js/shell.js js/app.js
git commit -m "feat: responsive app shell — sidebar, rail, and mobile drawer"
```

---

### Task 3: Sidebar collapse, persistence, and active-state refresh

**Files:**
- Modify: `js/shell.js`
- Modify: `js/app.js`
- Modify: `js/core/store.js` (only if `settings` needs the new key defaulted)

**Interfaces:**
- Consumes: `mountShell`/`refreshShell` (Task 2).
- Produces: `state.settings.sidebarCollapsed` (boolean, default `false`), persisted through the existing `save()`.

- [ ] **Step 1: Check the settings default**

Read `js/core/store.js`'s `freshState()` and its validation. If `settings` is validated field-by-field such that an unknown key would be dropped, add `sidebarCollapsed: false` to the default settings object and to any sanitiser, then run `node --test tests/store.test.js` to confirm nothing broke. If settings is passed through wholesale, no change is needed — say which case applied in the report.

- [ ] **Step 2: Wire the collapse toggle**

`mountShell` currently renders `#collapsetoggle` without a handler. Give `mountShell` access to a `save` callback via its argument object, and bind (once, in the `built` guard):

```js
  document.body.addEventListener('click', (e) => {
    if (!e.target.closest('#collapsetoggle')) return;
    const next = !document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed', next);
    ctxLike.state.settings.sidebarCollapsed = next;
    ctxLike.save();
  });
```

Delegate from `document.body` because the sidebar's innerHTML — and therefore the button — is replaced on every refresh.

Pass `save` from `js/app.js`: `mountShell({ courses, state, save, hash: location.hash })`.

- [ ] **Step 3: Verify persistence and refresh**

Run the full suite (must stay green).

In the browser at 1280px: collapse the sidebar, reload — it stays collapsed; expand, reload — it stays expanded. Confirm `JSON.parse(localStorage['ale.v1']).settings.sidebarCollapsed` matches. Export progress from Ρυθμίσεις and confirm the key rides along in the snapshot (it is part of `settings`). Navigate between routes and confirm the active highlight follows without a full page reload and without the collapsed state flickering.

- [ ] **Step 4: Commit**

```bash
git add js/shell.js js/app.js js/core/store.js
git commit -m "feat: collapsible sidebar with persisted state"
```

---

### Task 4: Dashboard redesign

**Files:**
- Modify: `js/views/dashboard.js`
- Modify: `css/app.css`

**Interfaces:**
- Consumes: `recentActivity`, `readinessPct` (Task 1); `allTopics` (`js/core/content.js`); `isDue` (`js/core/srs.js`); `newTopicProgress` (`js/core/progress.js`).
- Produces: nothing other views consume.

- [ ] **Step 1: Rebuild the dashboard markup**

Keep the existing data-gathering loop (it already computes `mastery`, `due`, `topicCount` per course and collects weak topics). Add: collect `topicsByCourse[c.id] = ts` inside the loop so `readinessPct` can be called after it.

Render, in this order:

1. **Page header** — `<h1>Πίνακας ελέγχου</h1>` with the subtitle `Η μελέτη σου με μια ματιά`.
2. **Stat grid** — four `.statcard`s, each `<div class="statcard"><div class="statcard-icon">ICON</div><div><b>VALUE</b><span>LABEL</span></div></div>`:
   - ⚡ `state.stats.totalXp` — «Συνολικό XP»
   - 🔥 `state.stats.currentStreak` — «Σερί ημερών»
   - 🎓 count of topics with `mastery >= 80` across all courses — «Θέματα 80%+»
   - 🎯 `readinessPct(...)` as `N%` — «Ετοιμότητα»
3. **Due-reviews card** — unchanged from today.
4. **Two-column region** (`.dash-cols`): the course cards on the left, the activity panel on the right.
   - Each course card keeps its title, status pill, action buttons, and gains a **progress ring** replacing `.bar`:
     ```js
     const ring = (pct) => {
       const r = 26; const c = 2 * Math.PI * r;
       const off = c * (1 - (Number(pct) || 0) / 100);
       return `<svg class="ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
         <circle class="ring-track" cx="32" cy="32" r="${r}"></circle>
         <circle class="ring-fill" cx="32" cy="32" r="${r}"
           style="stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}"></circle>
         <text class="ring-text" x="32" y="37" text-anchor="middle">${Number(pct) || 0}%</text>
       </svg>`;
     };
     ```
     Card layout: ring on the left, title/counts/actions on the right. Keep the existing `Completion N%` wording in the counts line.
   - **Activity panel** — `<div class="card"><h2>🕘 Πρόσφατη δραστηριότητα</h2>…</div>` listing `recentActivity(ctx.state.sessions, 5)` as `.list-item` rows: label on the left, `detail` muted beneath, `+N XP` pill on the right. Empty state: `<p class="muted">Καμία δραστηριότητα ακόμη.</p>`.
5. **Weak-topics card** — unchanged from today.

All interpolated content keeps `escapeHtml` exactly as today.

- [ ] **Step 2: CSS for the new pieces**

- `.statgrid` — `display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr);` at base; `repeat(4, 1fr)` from 768px.
- `.statcard` — card surface, `display: flex; gap: 12px; align-items: center;`; `b` large and bold, `span` muted and small, stacked.
- `.statcard-icon` — 40px circle, tinted background, centred glyph. Give the four cards distinct tints via `.statcard:nth-child(n)` or modifier classes.
- `.dash-cols` — single column at base; from 1024px `grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 16px; align-items: start;`.
- `.ring-track` / `.ring-fill` — `fill: none; stroke-width: 6;` track `var(--border)`, fill `var(--gold)` with `stroke-linecap: round; transform: rotate(-90deg); transform-origin: 50% 50%;`. `.ring-text` — `fill: var(--text); font-size: 15px; font-weight: 700;`.

- [ ] **Step 3: Verify**

Run the full suite (green).

Browser: at 1280px the four stat cards sit in one row, courses and activity are side by side, and each ring's arc visually matches its percentage (check `Κλάδος Ζωής` against the number in its counts line). At 768px stats are 2×2 and the columns stack. At 375px everything is a single readable column with no horizontal scroll. Complete a micro quiz and confirm a new row appears at the top of the activity panel with the right label and XP. Confirm the ring shows `0%` correctly (a course with no progress) — the arc should be an empty track, not a full circle.

- [ ] **Step 4: Commit**

```bash
git add js/views/dashboard.js css/app.css
git commit -m "feat: dashboard with stat cards, progress rings, and activity panel"
```

---

### Task 5: Shared page header across views, and release polish

**Files:**
- Modify: `js/ui.js`
- Modify: `js/views/{course,topic,quiz,flashcards,exam,analysis,chaptertest,settings}.js`
- Modify: `css/app.css`
- Modify: `sw.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `escapeHtml` (`js/ui.js`).
- Produces: `pageHeader({title, subtitle, back, actions}) -> string`.

- [ ] **Step 1: Add the helper to `js/ui.js`**

```js
// Shared view header: back link, title, optional subtitle, optional
// trailing actions (already-built HTML, e.g. pills).
export function pageHeader({ title, subtitle = '', back = '', actions = '' }) {
  return `<div class="pagehead">
    ${back ? `<a class="btn btn-ghost pagehead-back" href="${back}">←</a>` : ''}
    <div class="grow">
      <h1 class="pagehead-title">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="pagehead-sub muted">${escapeHtml(subtitle)}</p>` : ''}
    </div>
    ${actions}
  </div>`;
}
```

`actions` is raw HTML by design (callers pass already-escaped pill markup); `title` and `subtitle` are escaped here. Do not escape `actions` — and do not pass user-supplied text through it.

- [ ] **Step 2: Adopt it in each view**

Replace each view's hand-rolled header row with a `pageHeader(...)` call, removing the ad-hoc `style="margin-bottom:12px"` attributes:

- `course.js` — title = course title, back = `#/`, actions = the status pill when passed.
- `topic.js` — title = topic title, subtitle = chapter title, back = `#/course/<courseId>`, actions = the position counter, pending pill, Completion pill and weak pill that the header row carries today. Keep the summary card's own `<h2>` removal in mind: the title now lives in the header, so drop the duplicated `<h2>` from the first card but KEEP its `data-editpath="summary"` prose region and its ✏️ button exactly as they are.
- `quiz.js` — title = the mode title, back = `#/course/<courseId>`, actions = the counter and XP pill. Replace the `✕` link with the header's back arrow.
- `flashcards.js` — title = «Κάρτες», subtitle = topic title, back = `#/course/<courseId>`, actions = the counter.
- `exam.js` — intro screen: title = «Εξομοίωση εξέτασης», back = `#/course/<courseId>`. In-progress screen keeps its counter/timer row unchanged (no back link there by design).
- `analysis.js` — title = «Ανάλυση εξετάσεων», back = `#/course/<courseId>`.
- `chaptertest.js` — title = «Τεστ κεφαλαίου», subtitle = chapter title, back = `#/course/<courseId>`.
- `settings.js` — title = «Ρυθμίσεις», no back link (it is a primary destination).

Do not touch any handler, id, or class that existing logic queries (`#check`, `#checkfeedback`, `#feedback`, `#actions`, `#card`, `.qopt`, `#startcheck`, `#next`, `#checknext`, the settings ids, and every `data-editpath`/`.editbtn` in the editing feature).

- [ ] **Step 3: CSS for the header**

`.pagehead { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }`; `.pagehead-title { margin: 0; font-size: 24px; line-height: 1.2; }`; `.pagehead-sub { margin: 2px 0 0; font-size: 13px; }`; `.pagehead-back { flex: 0 0 auto; }`. From 1024px, `.pagehead-title { font-size: 30px; }`.

- [ ] **Step 4: Release polish**

- `sw.js`: bump `CACHE` to `ale-v11` and add `./js/shell.js` to `CORE`. `tests/sw.test.js` enforces that CORE matches the files on disk — run it and fix any drift it reports.
- `README.md`: add a short Greek paragraph under a new «Διάταξη» heading describing the three bands and the collapsible sidebar.

- [ ] **Step 5: Full verification**

Run `node --test tests/*.test.js` — all green.

Browser sweep at 375 / 768 / 1280px, light and dark:
- Every route renders with a consistent header: `#/`, `#/course/klados-zois`, `#/topic/klados-zois/z3-1`, `#/quiz/klados-zois/micro`, `#/flashcards/klados-zois`, `#/exam/klados-zois`, `#/analysis/klados-zois`, `#/chaptertest/klados-zois/z-ch03`, `#/settings`.
- No horizontal scrolling anywhere: `document.documentElement.scrollWidth <= window.innerWidth` at each width.
- **Material editing still works inside the new shell.** Seed a dummy token (`localStorage.setItem('ale.edits.v1', JSON.stringify({token:'x', edits:{}}))`), open a topic, click ✏️, confirm the sticky toolbar is not hidden behind the top bar at 375px and 768px, edit and save, then remove the seeded key. This is the highest-risk interaction in this task.
- Run a quiz through to the results screen and a flashcard session through grading, confirming no handler broke.

- [ ] **Step 6: Commit**

```bash
git add js/ui.js js/views css/app.css sw.js README.md
git commit -m "feat: shared page header across views; SW ale-v11; layout docs"
```

---

## Verification checklist (whole feature)

- `node --test tests/*.test.js` — green (160+ tests).
- Three bands behave as specified at 375 / 768 / 1280px, light and dark.
- Exactly one `#countdown` element; the exam countdown still updates.
- Sidebar collapse persists across reloads and rides the sync snapshot.
- The exam timer still clears on navigation (the `onCleanup` path is untouched).
- Material editing — pencils, toolbar, save, pending pill — works at every width.
- No horizontal overflow at any width; no console errors.
