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
        ${g.items.map((i) => `<a class="sidebar-link${i.active ? ' active' : ''}" href="${escapeHtml(i.href)}">
          <span class="sidebar-icon">${i.icon}</span><span class="sidebar-label">${escapeHtml(i.label)}</span>
        </a>`).join('')}`).join('')}
    </nav>
    <div class="sidebar-foot">
      <span id="countdown" class="countdown"></span>
      <button id="collapsetoggle" class="iconbtn" aria-label="Σύμπτυξη">⟨⟩</button>
    </div>`;
}

// Shared by the click/Escape handlers below (drawer opening) and by
// refreshShell (drawer closing on every render/navigation) so both sides
// agree on what "open" means. Opening only ever happens from a direct user
// gesture on the toggle/scrim, never from a render cycle, so refreshShell's
// unconditional close on every call can't race or "fight" an open in progress.
function setDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  const scrim = document.getElementById('scrim');
  if (scrim) scrim.hidden = !open;
  document.getElementById('drawertoggle')?.setAttribute('aria-expanded', String(open));
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
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });
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
