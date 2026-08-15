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
