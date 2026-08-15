// js/edit/editor.js
// In-place WYSIWYG editing of prose regions. No full view re-render on
// save/cancel (a re-render mid-quiz would lose quiz progress) — regions
// are restored in place.
import { formatText } from '../core/format.js';
import { serializeEditor } from './serialize.js';
import {
  loadEdits, saveEdits, getPath, setPath, findTopic, pendingList, pendingCount,
} from './overlay.js';
import { commitEdits, isSettled } from './github.js';

const QUOTA_MSG = 'Προσοχή: η αλλαγή δεν αποθηκεύτηκε τοπικά '
  + '(ο χώρος του προγράμματος περιήγησης είναι πλήρης).';

// saveEdits returns false on a full quota — never report success in that case.
function persist(storage, data) {
  if (saveEdits(storage, data)) return true;
  globalThis.alert?.(QUOTA_MSG);
  return false;
}

// Every edit session currently open, so a view about to replace its own DOM
// can ask first (typed text would otherwise vanish with no warning) and then
// tear the toolbar down — it lives outside the region and would be orphaned.
const openSessions = new Set();

export function hasOpenEdit() { return openSessions.size > 0; }

export function discardOpenEdits() {
  for (const s of [...openSessions]) s.discard();
}

// Call from any handler about to replace edited content. Returns false to
// mean "the user said no — do not navigate".
export function confirmLeaveEdit() {
  if (!hasOpenEdit()) return true;
  if (!globalThis.confirm?.('Έχεις ανοιχτή επεξεργασία. Να συνεχίσω και να την ακυρώσω;')) return false;
  discardOpenEdits();
  return true;
}

const key = (o) => `${o.topicId} ${o.path}`;

// Flip `committed` for exactly the entries whose per-edit outcome says the
// remote now holds their text — never for the whole batch. Storage is re-read
// here, AFTER the caller's await, and each entry re-checked against the text
// that was actually sent. Returns how many were marked.
function markSettled(storage, courseId, sent, results) {
  const settled = new Set(results.filter(isSettled).map(key));
  const fresh = loadEdits(storage);
  let marked = 0;
  for (const p of sent) {
    if (!settled.has(key(p))) continue;
    const entry = fresh.edits[courseId]?.[p.topicId]?.[p.path];
    if (entry && !entry.committed && entry.text === p.text) { entry.committed = true; marked++; }
  }
  if (marked) persist(storage, fresh);
  return marked;
}

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

  let closed = false;
  const leave = () => {
    if (closed) return; // a second Save click must not double-close
    closed = true;
    openSessions.delete(session);
    for (const r of editable) { r.contentEditable = 'false'; r.classList.remove('editing'); }
    btn.style.display = '';
  };
  // Abandon without saving, and take the toolbar with us — used when the view
  // is about to replace the DOM this session lives in.
  const session = { discard: () => { leave(); bar.remove(); } };
  openSessions.add(session);

  bar.querySelector('[data-act="cancel"]').addEventListener('click', () => {
    for (const r of editable) r.innerHTML = formatText(originals.get(r));
    bar.remove();
    leave();
  });

  bar.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const changes = [];
    for (const r of editable) {
      const text = serializeEditor(r);
      const was = originals.get(r);
      if (text !== was) {
        // Blanking a field commits "" to the repo and there is no in-app undo,
        // so make it deliberate. Declining restores the region untouched.
        if (text === '' && was !== ''
            && !globalThis.confirm?.('Το πεδίο θα μείνει κενό. Σίγουρα;')) {
          r.innerHTML = formatText(was);
          continue;
        }
        changes.push({ topicId: topic.id, path: r.dataset.editpath, text, base: was });
      }
      r.innerHTML = formatText(text) || '<span class="muted">—</span>';
    }
    leave();
    if (!changes.length) { bar.remove(); return; }

    const store = loadEdits(window.localStorage);
    store.edits[courseId] ??= {};
    for (const c of changes) {
      const fields = (store.edits[courseId][c.topicId] ??= {});
      const prev = fields[c.path];
      // `base` is what the REPO holds for this field. On a re-edit of an entry
      // that has not been committed yet, the repo still has the older baseline
      // — keep it. Once committed, the repo holds the previous text, which is
      // exactly what `originals` captured this time round.
      const base = prev && !prev.committed && typeof prev.base === 'string' ? prev.base : c.base;
      fields[c.path] = { text: c.text, base, committed: false };
      const real = findTopic(content, c.topicId);
      if (real) setPath(real, c.path, c.text);
    }
    status.textContent = persist(window.localStorage, store)
      ? 'Αποθηκεύτηκε τοπικά — καταχώρηση στο GitHub…'
      : '⚠️ Δεν αποθηκεύτηκε τοπικά — καταχώρηση στο GitHub…';
    const sent = pendingList(store, courseId);
    const result = await commitEdits(store.token, courseId, sent);
    if (result.ok) {
      markSettled(window.localStorage, courseId, sent, result.results);
      status.textContent = result.results.every(isSettled)
        ? '✅ Καταχωρήθηκε στο GitHub.'
        : '⚠️ Μερική καταχώρηση — κάποιες αλλαγές παραμένουν σε εκκρεμότητα.';
    } else {
      status.textContent = '⚠️ Εκκρεμεί — νέα προσπάθεια στην επόμενη αποθήκευση ή από τις Ρυθμίσεις.';
    }
    setTimeout(() => bar.remove(), 2500);
  });
}

// storage/fetchFn are injectable for tests; the app always uses the defaults.
export async function retryPendingAll(storage = window.localStorage, fetchFn = undefined) {
  const token = loadEdits(storage).token;
  if (!token) return { retried: 0, pending: pendingCount(loadEdits(storage)) };
  let retried = 0;
  // Re-read the course list too: it must not come from a pre-await snapshot.
  for (const courseId of Object.keys(loadEdits(storage).edits)) {
    const pending = pendingList(loadEdits(storage), courseId);
    if (!pending.length) continue;
    const result = await commitEdits(token, courseId, pending, fetchFn);
    if (!result.ok) continue;
    // markSettled re-reads AFTER the await, so anything written to storage
    // during the round-trip (a save, a prune, a token removal) survives.
    retried += markSettled(storage, courseId, pending, result.results);
  }
  return { retried, pending: pendingCount(loadEdits(storage)) };
}
