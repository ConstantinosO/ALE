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

// Up to two uppercase initials from the first two words of a course title —
// the rail badge's only label, so it has to survive garbage input without
// throwing (an empty/unparseable title still needs *something* rendered).
export function courseInitials(title) {
  if (typeof title !== 'string') return '?';
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// A course group's open/closed state has two layers: an implicit default
// (active courses start open, passed ones start closed) and, once the user
// has ever touched a toggle, an explicit collapsedGroups array that overrides
// the default completely for every course it mentions. The array-vs-not
// distinction is what lets toggleGroup below tell "never touched" apart from
// "touched, and this particular course happens not to be in the list".
export function isGroupOpen(courseId, status, collapsedGroups) {
  if (!Array.isArray(collapsedGroups)) return status !== 'passed';
  return !collapsedGroups.includes(courseId);
}

// The first toggle has to freeze the *current* effective state of every
// course (not just the one being toggled), or collapsing the active course
// would read back as "collapsedGroups = [active]" and silently leave the
// already-collapsed passed course looking open (nothing in the array names
// it, and isGroupOpen would then default it open). Once collapsedGroups is
// already an array, every course's state is already explicit, so a toggle is
// a plain flip.
export function toggleGroup(courseId, courses, collapsedGroups) {
  const list = Array.isArray(courses?.courses) ? courses.courses : [];
  const next = Array.isArray(collapsedGroups)
    ? [...collapsedGroups]
    : list.filter((c) => c.status === 'passed').map((c) => c.id);
  const idx = next.indexOf(courseId);
  if (idx === -1) next.push(courseId);
  else next.splice(idx, 1);
  return next;
}

// The rail's model: home, one badge per course, settings. A badge counts as
// "active" when the current route belongs to that course at all (any of its
// five destinations), which is exactly what activeHref+COURSE_LINKS already
// encode for the expanded sidebar — reused here rather than re-derived, so
// the two views can never disagree about which course the user is inside.
export function sidebarRailItems(courses, hash) {
  const target = activeHref(hash);
  const list = Array.isArray(courses?.courses) ? courses.courses : [];
  const items = [{ kind: 'link', label: 'Αρχική', href: '#/', icon: '🏠', active: target === '#/' }];
  for (const c of list) {
    const hrefs = COURSE_LINKS.map((l) => l.suffix(c.id));
    items.push({
      kind: 'course', id: c.id, title: c.title, initials: courseInitials(c.title),
      active: hrefs.includes(target), passed: c.status === 'passed',
    });
  }
  items.push({ kind: 'link', label: 'Ρυθμίσεις', href: '#/settings', icon: '⚙️', active: target === '#/settings' });
  return items;
}

// --- rendering (appended to js/shell.js) ---
import { escapeHtml } from './ui.js';

let built = false;

// The collapse toggle's accessible name and state have to describe the
// sidebar as it is right now: a screen reader on a collapsed sidebar was
// being told the button was «Σύμπτυξη» (collapse) with no expanded state at
// all. Kept in one place so the markup and the click handler cannot drift.
const COLLAPSE_LABEL = (collapsed) => (collapsed ? 'Ανάπτυξη' : 'Σύμπτυξη');

function sidebarHtml(courses, state, hash) {
  const items = sidebarNavItems(courses, hash);
  const collapsed = !!state.settings.sidebarCollapsed;
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
        ${g.items.map((i) => `<a class="sidebar-link${i.active ? ' active' : ''}" href="${escapeHtml(i.href)}">
          <span class="sidebar-icon">${i.icon}</span><span class="sidebar-label">${escapeHtml(i.label)}</span>
        </a>`).join('')}`).join('')}
    </nav>
    <div class="sidebar-foot">
      <span class="countdown"></span>
      <button id="collapsetoggle" class="iconbtn" aria-controls="sidebar"
        aria-expanded="${!collapsed}" aria-label="${COLLAPSE_LABEL(collapsed)}">⟨⟩</button>
    </div>`;
}

// Shared by the click/Escape handlers below (drawer opening) and by
// refreshShell (drawer closing on every render/navigation) so both sides
// agree on what "open" means. Opening only ever happens from a direct user
// gesture on the toggle/scrim, never from a render cycle, so refreshShell's
// unconditional close on every call can't race or "fight" an open in progress.
//
// The sidebar doubles as a persistent nav rail (>=768px) and a modal mobile
// drawer (<768px, the only width where the hamburger that opens it is even
// visible). role="dialog"/aria-modal are therefore only ever added here, on
// an actual open, and removed on close — never baked into the static markup
// in index.html, where they'd mislabel the always-visible rail as a dialog.
function setDrawer(open) {
  const wasOpen = document.body.classList.contains('drawer-open');
  document.body.classList.toggle('drawer-open', open);
  const scrim = document.getElementById('scrim');
  if (scrim) scrim.hidden = !open;
  const toggle = document.getElementById('drawertoggle');
  toggle?.setAttribute('aria-expanded', String(open));
  const sidebar = document.getElementById('sidebar');
  if (open) {
    sidebar?.setAttribute('role', 'dialog');
    sidebar?.setAttribute('aria-modal', 'true');
    sidebar?.querySelector('a[href], button:not([disabled])')?.focus();
  } else {
    sidebar?.removeAttribute('role');
    sidebar?.removeAttribute('aria-modal');
    // Only steal focus back when this call is a real open->closed
    // transition (Escape, scrim click, a nav link inside the drawer) — the
    // unconditional setDrawer(false) that refreshShell runs on every
    // navigation must stay a no-op when the drawer was already closed, or
    // focus would jump to the hamburger on every route change.
    if (wasOpen) toggle?.focus();
  }
}

// Keeps Tab/Shift+Tab cycling inside the sidebar while it is acting as a
// modal drawer, so focus never reaches the dimmed background content behind
// the scrim. Self-corrects (falls back to first/last) if focus is somehow
// already outside the sidebar when Tab is pressed.
function trapDrawerFocus(e) {
  if (e.key !== 'Tab' || !document.body.classList.contains('drawer-open')) return;
  const sidebar = document.getElementById('sidebar');
  const focusables = [...(sidebar?.querySelectorAll('a[href], button:not([disabled])') || [])];
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (e.shiftKey) {
    if (active === first || !sidebar.contains(active)) { e.preventDefault(); last.focus(); }
  } else if (active === last || !sidebar.contains(active)) { e.preventDefault(); first.focus(); }
}

export function mountShell(ctxLike) {
  refreshShell(ctxLike);
  if (built) return;
  built = true;
  const scrim = document.getElementById('scrim');
  document.getElementById('drawertoggle')?.addEventListener('click', () => {
    setDrawer(!document.body.classList.contains('drawer-open'));
  });
  scrim?.addEventListener('click', () => setDrawer(false));
  document.getElementById('sidebar')?.addEventListener('click', (e) => {
    if (e.target.closest('a')) setDrawer(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { setDrawer(false); return; }
    trapDrawerFocus(e);
  });
  // Crossing into the rail band retires the drawer. Rotating a phone from
  // portrait (390px, drawer open) to landscape (844px) leaves the class on
  // <body> otherwise, and at >=768px both the scrim and the hamburger are
  // display:none — there is no control left to close it with.
  window.matchMedia('(min-width: 768px)')
    .addEventListener('change', (e) => { if (e.matches) setDrawer(false); });
  // Delegated on document.body (not the button) because refreshShell
  // replaces #sidebar's innerHTML — and therefore #collapsetoggle — on
  // every navigation, which would detach any handler bound directly to it.
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('#collapsetoggle');
    if (!btn) return;
    const next = !document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed', next);
    // The sidebar is not re-rendered on a toggle, so the button's own aria
    // has to be updated here as well as in sidebarHtml.
    btn.setAttribute('aria-expanded', String(!next));
    btn.setAttribute('aria-label', COLLAPSE_LABEL(next));
    ctxLike.state.settings.sidebarCollapsed = next;
    ctxLike.save();
  });
}

export function refreshShell({ courses, state, hash }) {
  const el = document.getElementById('sidebar');
  if (el) el.innerHTML = sidebarHtml(courses, state, hash);
  const collapsed = !!state.settings.sidebarCollapsed;
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  // Every render (any navigation — sidebar link, topbar brand link, a view's
  // own ctx.navigate(), hashchange from anywhere) closes the mobile drawer,
  // instead of relying on catching every possible click target.
  setDrawer(false);
}
