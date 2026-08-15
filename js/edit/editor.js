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
