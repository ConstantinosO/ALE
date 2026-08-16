import { parseRoute } from './router.js';
import { loadState, saveState } from './core/store.js';
import { loadCourses, loadContent, loadAnalysis } from './core/content.js';
import { escapeHtml } from './ui.js';
import { mountShell } from './shell.js';
import * as dashboard from './views/dashboard.js';
import * as course from './views/course.js';
import * as topic from './views/topic.js';
import * as quiz from './views/quiz.js';
import * as flashcards from './views/flashcards.js';
import * as exam from './views/exam.js';
import * as analysis from './views/analysis.js';
import * as settings from './views/settings.js';
import * as chaptertest from './views/chaptertest.js';
import { loadEdits, saveEdits, applyEdits, pruneDeployed } from './edit/overlay.js';
import { retryPendingAll } from './edit/editor.js';

const VIEWS = { dashboard, course, topic, quiz, flashcards, exam, analysis, settings, chaptertest };

const container = document.getElementById('view');
const state = loadState(window.localStorage);
let courses = null;
const contentCache = {};
const analysisCache = {};
let viewCleanup = null;

function save() {
  if (!saveState(state, window.localStorage)) {
    alert('Προσοχή: η πρόοδος δεν αποθηκεύτηκε (ο χώρος του προγράμματος περιήγησης είναι πλήρης).');
  }
}

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
  if (viewCleanup) { try { viewCleanup(); } catch {} viewCleanup = null; }
  try {
    courses ??= await loadCourses();
  } catch (e) {
    container.innerHTML = `<div class="card"><h2>Σφάλμα</h2><p>${escapeHtml(e.message)}</p>
      <button onclick="location.reload()">Δοκιμή ξανά</button></div>`;
    return;
  }
  mountShell({ courses, state, hash: location.hash });
  renderCountdown();
  const route = parseRoute(location.hash);
  const view = VIEWS[route.view] || VIEWS.dashboard;
  const ctx = {
    state, save, courses, getContent, getAnalysis,
    navigate: (h) => { if (location.hash === h) render(); else location.hash = h; },
    onCleanup: (fn) => { viewCleanup = fn; },
    params: route.params, examDateIso,
  };
  container.innerHTML = '<p class="muted">Φόρτωση…</p>';
  try {
    await view.render(container, ctx);
  } catch (e) {
    container.innerHTML = `<div class="card"><h2>Σφάλμα</h2><p>${escapeHtml(e.message)}</p>
      <a class="btn" href="#/">Αρχική</a> <button onclick="location.reload()">Δοκιμή ξανά</button></div>`;
  }
}

window.addEventListener('hashchange', render);
container.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); render(); }
});
render();
retryPendingAll().catch(() => {}); // fire-and-forget: commit any pending edits
