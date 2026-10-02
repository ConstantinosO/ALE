// #/recall/:courseId[/:itemId] — blank-page recall. Pick a bank question,
// write what you remember with nothing on screen to prompt you, then see which
// rubric points your answer covered. Practice only: nothing is recorded into
// progress, so a heuristic verdict can never move mastery or the SRS.
import { escapeHtml, pageHeader } from '../ui.js';
import { formatText } from '../core/format.js';
import { validateEssayBank, scoreQuestion } from '../core/essay.js';
import { recallItems, scorePoints, pickItem } from '../core/recall.js';

const KNOWN = 70; // same bar as the essay exam: ≥70% of rubric points

// The typed answer survives an accidental back-swipe within the tab, and only
// within it — a per-tab convenience, never progress. Every access is guarded:
// storage can be absent or throw in private windows.
const draftKey = (id) => `ale.recall.draft.${id}`;
const loadDraft = (id) => { try { return sessionStorage.getItem(draftKey(id)) || ''; } catch { return ''; } };
const saveDraft = (id, v) => { try { sessionStorage.setItem(draftKey(id), v); } catch { /* best effort */ } };
const clearDraft = (id) => { try { sessionStorage.removeItem(draftKey(id)); } catch { /* best effort */ } };

const STATUS = {
  hit: ['pill-ok', '✓ το κάλυψες'],
  partial: ['pill-gold', '~ μερικώς — έλεγξε'],
  miss: ['pill-bad', '✗ λείπει'],
};

export async function render(el, ctx) {
  const { courseId, itemId } = ctx.params;
  const back = `#/course/${courseId}`;
  const bank = await ctx.getEssayBank(courseId);
  if (!bank || validateEssayBank(bank)) {
    el.innerHTML = `${pageHeader({ title: '✍️ Από μνήμης', back })}
      <div class="card"><p class="muted">Δεν υπάρχει τράπεζα θεμάτων για αυτό το μάθημα.</p></div>`;
    return;
  }
  const items = recallItems(bank);
  const item = itemId && items.find((it) => it.id === itemId);
  if (!item) { renderPicker(el, courseId, items); return; }
  renderPractice(el, ctx, courseId, items, item);
}

function renderPicker(el, courseId, items) {
  const essays = items.filter((it) => it.kind === 'essay').sort((a, b) => b.weight - a.weight);
  const minis = items.filter((it) => it.kind === 'mini').sort((a, b) => b.weight - a.weight);
  const link = (it) => `<a class="btn btn-ghost btn-block" style="justify-content:flex-start;text-align:left" href="#/recall/${courseId}/${encodeURIComponent(it.id)}">${escapeHtml(it.title)}</a>`;
  const random = pickItem(items);
  el.innerHTML = `
    ${pageHeader({ title: '✍️ Από μνήμης', subtitle: 'Κενή σελίδα: γράψε ό,τι θυμάσαι, μετά δες τι έλειπε', back: `#/course/${courseId}` })}
    <div class="card">
      <p>Διαλέγεις ερώτηση, γράφεις την απάντηση χωρίς βοήθεια, και η εφαρμογή ελέγχει ποια σημεία της βαθμολόγησης κάλυψες.
        Είναι μόνο εξάσκηση — δεν αλλάζει την πρόοδό σου.</p>
      ${random ? `<a class="btn btn-gold btn-block" href="#/recall/${courseId}/${encodeURIComponent(random.id)}">🎲 Τυχαία ερώτηση</a>` : ''}
    </div>
    <div class="card"><h2>Ερωτήσεις έκθεσης</h2><p class="muted" style="font-size:13px">Οι συχνότερες πρώτες.</p>${essays.map(link).join('')}</div>
    <div class="card"><h2>Σύντομοι ορισμοί (ερώτηση 8)</h2>${minis.map(link).join('')}</div>`;
}

function renderPractice(el, ctx, courseId, items, item) {
  const promptText = item.prompts[Math.floor(Math.random() * item.prompts.length)] || item.title;
  const others = items.filter((it) => it.id !== item.id);

  el.innerHTML = `
    ${pageHeader({ title: '✍️ Από μνήμης', subtitle: item.kind === 'mini' ? 'Σύντομος ορισμός' : 'Ερώτηση έκθεσης', back: `#/recall/${courseId}` })}
    <div class="card"><div class="prose">${formatText(promptText)}</div></div>
    <div class="card" id="recall-work">
      <textarea class="essay-textarea" id="recall-text" rows="${item.kind === 'mini' ? 5 : 12}"
        placeholder="Γράψε ό,τι θυμάσαι — σημεία, λέξεις-κλειδιά, ολόκληρη απάντηση…">${escapeHtml(loadDraft(item.id))}</textarea>
      <p class="muted" id="recall-msg" style="font-size:13px;min-height:1em;margin:6px 0"></p>
      <button class="btn btn-gold btn-block" id="recall-check">Έλεγχος</button>
    </div>`;

  const ta = el.querySelector('#recall-text');
  ta.addEventListener('input', () => saveDraft(item.id, ta.value));
  el.querySelector('#recall-check').addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) { el.querySelector('#recall-msg').textContent = 'Γράψε πρώτα κάτι — έστω λέξεις-κλειδιά.'; return; }
    clearDraft(item.id);
    renderResult(el, ctx, courseId, item, promptText, text, others);
  });
}

function renderResult(el, ctx, courseId, item, promptText, text, others) {
  const results = scorePoints(item.keyPoints, text, promptText);
  const ticked = new Set(results.filter((r) => r.status === 'hit').map((r) => r.index));
  const next = pickItem(others);
  const counts = { hit: 0, partial: 0, miss: 0 };
  for (const r of results) counts[r.status]++;

  el.querySelector('#recall-work').outerHTML = `
    <div class="card">
      <h2>Η απάντησή σου</h2>
      <div class="essay-useranswer">${escapeHtml(text)}</div>
    </div>
    <div class="card">
      <div class="row"><h2 class="grow">Τι κάλυψες;</h2><span class="pill" id="recall-score"></span></div>
      <p class="muted" style="font-size:13px">Αυτόματη εκτίμηση από λέξεις-κλειδιά: ${counts.hit} ✓, ${counts.partial} ~, ${counts.miss} ✗.
        Διόρθωσε τα τικ όπου διαφωνείς — τα «μερικώς» θέλουν τη δική σου κρίση.</p>
      ${results.map((r) => `
        <label class="essay-kp"><input type="checkbox" data-kp="${r.index}" ${ticked.has(r.index) ? 'checked' : ''}>
          <span class="grow"><span class="prose">${formatText(r.point)}</span>
            <span class="pill ${STATUS[r.status][0]}" style="font-size:11px;margin-top:4px">${STATUS[r.status][1]}</span></span>
        </label>`).join('')}
    </div>
    ${item.modelAnswer ? `<div class="card"><details><summary>Υπόδειγμα απάντησης</summary><div class="prose">${formatText(item.modelAnswer)}</div></details></div>` : ''}
    <div class="card">
      <a class="btn btn-ghost btn-block" href="#/recall/${courseId}/${encodeURIComponent(item.id)}" id="recall-again">↻ Ξανά η ίδια, από την αρχή</a>
      ${next ? `<a class="btn btn-gold btn-block" href="#/recall/${courseId}/${encodeURIComponent(next.id)}">🎲 Επόμενη τυχαία</a>` : ''}
      <a class="btn btn-ghost btn-block" href="#/recall/${courseId}">Όλες οι ερωτήσεις</a>
    </div>`;

  const scoreEl = el.querySelector('#recall-score');
  const update = () => {
    const pct = scoreQuestion(ticked.size, results.length);
    scoreEl.textContent = `${ticked.size}/${results.length} · ${pct}%${pct >= KNOWN ? ' · το ξέρεις' : ''}`;
    scoreEl.className = `pill ${pct >= KNOWN ? 'pill-ok' : ''}`;
  };
  el.querySelectorAll('input[data-kp]').forEach((cb) => cb.addEventListener('change', () => {
    const i = Number(cb.dataset.kp);
    if (cb.checked) ticked.add(i); else ticked.delete(i);
    update();
  }));
  update();

  // Same hash as the current route, so a plain link would not re-render.
  el.querySelector('#recall-again').addEventListener('click', (e) => {
    e.preventDefault();
    renderPractice(el, ctx, courseId, [item, ...others], item);
    window.scrollTo(0, 0);
  });
}
