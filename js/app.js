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
