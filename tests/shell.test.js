import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sidebarNavItems, recentActivity, readinessPct, MODE_LABELS,
  courseInitials, isGroupOpen, toggleGroup, sidebarRailItems,
} from '../js/shell.js';

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

test('essay exam and essay bank routes activate their course entry, not the dashboard', () => {
  for (const h of ['#/essay/klados-zois', '#/essaybank/klados-zois']) {
    const items = sidebarNavItems(COURSES, h);
    const active = items.filter((i) => i.active);
    assert.equal(active.length, 1, h);
    assert.equal(active[0].href, '#/course/klados-zois', h);
  }
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

test('courseInitials takes up to two uppercase initials from the first two words', () => {
  assert.equal(courseInitials('Κλάδος Ζωής'), 'ΚΖ');
  assert.equal(courseInitials('Βασικές Αρχές Ασφαλίσεων'), 'ΒΑ');
  assert.equal(courseInitials('Ζωής'), 'Ζ');
});

test('courseInitials tolerates empty, null, whitespace-only and non-string input', () => {
  for (const v of ['', null, undefined, '   ', 42, {}, []]) {
    assert.equal(courseInitials(v), '?', String(v));
  }
});

test('isGroupOpen defaults active open / passed closed when never toggled', () => {
  assert.equal(isGroupOpen('klados-zois', 'active', undefined), true);
  assert.equal(isGroupOpen('basikes-arxes', 'passed', null), false);
  assert.equal(isGroupOpen('basikes-arxes', 'passed', 'not-an-array'), false);
  assert.equal(isGroupOpen('klados-zois', 'active', {}), true);
});

test('isGroupOpen honours an explicit collapsedGroups array exactly, over status', () => {
  assert.equal(isGroupOpen('klados-zois', 'active', ['klados-zois']), false);
  assert.equal(isGroupOpen('basikes-arxes', 'passed', []), true);
  assert.equal(isGroupOpen('basikes-arxes', 'passed', ['basikes-arxes']), false);
});

test('toggleGroup materialises the default effective state on the first toggle', () => {
  const next = toggleGroup('klados-zois', COURSES, undefined);
  assert.deepEqual([...next].sort(), ['basikes-arxes', 'klados-zois']);
});

test('toggleGroup on the already-collapsed passed course opens it without reopening the active one', () => {
  const first = toggleGroup('klados-zois', COURSES, undefined);
  const second = toggleGroup('basikes-arxes', COURSES, first);
  assert.deepEqual(second, ['klados-zois']);
});

test('toggleGroup flips an id already in the explicit array back to open', () => {
  assert.deepEqual(toggleGroup('klados-zois', COURSES, ['klados-zois']), []);
});

test('toggleGroup does not mutate the array it was given', () => {
  const input = ['klados-zois'];
  toggleGroup('klados-zois', COURSES, input);
  assert.deepEqual(input, ['klados-zois']);
});

test('toggleGroup tolerates malformed courses', () => {
  for (const c of [null, undefined, {}, { courses: null }]) {
    assert.deepEqual(toggleGroup('x', c, undefined), ['x']);
  }
});

test('sidebarRailItems returns home, one badge per course, then settings', () => {
  const items = sidebarRailItems(COURSES, '#/');
  assert.deepEqual(items.map((i) => i.kind), ['link', 'course', 'course', 'link']);
  assert.equal(items[0].href, '#/');
  assert.equal(items[items.length - 1].href, '#/settings');
});

test('sidebarRailItems gives each course badge its initials and passed flag', () => {
  const items = sidebarRailItems(COURSES, '#/');
  const zois = items.find((i) => i.kind === 'course' && i.id === 'klados-zois');
  const arxes = items.find((i) => i.kind === 'course' && i.id === 'basikes-arxes');
  assert.equal(zois.initials, 'ΚΖ');
  assert.equal(zois.passed, false);
  assert.equal(arxes.initials, 'ΒΑ');
  assert.equal(arxes.passed, true);
});

test('sidebarRailItems marks a course badge active for any of its five routes', () => {
  const hashes = [
    '#/course/klados-zois', '#/quiz/klados-zois/micro', '#/flashcards/klados-zois',
    '#/exam/klados-zois', '#/analysis/klados-zois',
    '#/topic/klados-zois/z3-1', '#/chaptertest/klados-zois/z-ch03',
    '#/essay/klados-zois', '#/essaybank/klados-zois',
  ];
  for (const h of hashes) {
    const items = sidebarRailItems(COURSES, h);
    const active = items.filter((i) => i.active);
    assert.equal(active.length, 1, h);
    assert.equal(active[0].id, 'klados-zois', h);
  }
});

test('sidebarRailItems tolerates malformed courses, keeping just home and settings', () => {
  for (const c of [null, undefined, {}, { courses: null }]) {
    const items = sidebarRailItems(c, '#/');
    assert.deepEqual(items.map((i) => i.kind), ['link', 'link']);
  }
});
