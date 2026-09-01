import { escapeHtml, pageHeader } from '../ui.js';
import { formatText } from '../core/format.js';
import { validateEssayBank } from '../core/essay.js';

// Frequencies are measured against the real past papers the bank was built
// from, so the denominator comes from the bank itself — adding a tenth paper
// must not leave every pill silently reading "/9".
const FALLBACK_PAPERS = 9;
const paperCount = (bank) => Number(bank?.paperCount)
  || (Array.isArray(bank?.sourcePapers) ? bank.sourcePapers.length : 0)
  || FALLBACK_PAPERS;

// Maps, not plain objects: `trend` comes straight from data, and a plain
// object literal makes TREND_LABEL[trend] / TREND_CLASS[trend] resolve
// prototype members for a trend value like "constructor" or "toString".
const TREND_LABEL = new Map([
  ['core', 'σταθερό'], ['heating', '↑ ανεβαίνει'], ['cooling', '↓ υποχωρεί'], ['rare', 'σπάνιο'],
]);
const TREND_CLASS = new Map([['heating', 'pill-ok'], ['cooling', 'pill-bad']]);

// Where a wording came from. Most prompts list the papers they appeared in;
// a prompt taken from the syllabus's own list of exam questions, or from a
// paper outside the nine analysed, has no papers to list and carries a
// `source` label instead — printing nothing would imply it had been seen in
// the nine, which is the opposite of true.
function promptOrigin(p) {
  if (p.papers?.length) {
    return `<p class="muted" style="font-size:12px;margin:0 0 8px">${p.papers.map((x) => escapeHtml(x)).join(', ')}</p>`;
  }
  if (p.source) {
    return `<p class="muted" style="font-size:12px;margin:0 0 8px">${escapeHtml(p.source)}</p>`;
  }
  return '';
}

function trendPill(trend) {
  const label = TREND_LABEL.get(trend) || (trend ? escapeHtml(String(trend)) : 'σπάνιο');
  return `<span class="pill ${TREND_CLASS.get(trend) || ''}">${label}</span>`;
}

export async function render(el, ctx) {
  const { courseId } = ctx.params;
  const bank = await ctx.getEssayBank(courseId);

  if (!bank) {
    el.innerHTML = `
      ${pageHeader({ title: '📚 Τράπεζα θεμάτων', back: `#/course/${courseId}` })}
      <div class="card"><p class="muted">Δεν υπάρχει ακόμη τράπεζα θεμάτων έκθεσης για αυτό το μάθημα.</p></div>`;
    return;
  }
  const err = validateEssayBank(bank);
  if (err) {
    el.innerHTML = `
      ${pageHeader({ title: '📚 Τράπεζα θεμάτων', back: `#/course/${courseId}` })}
      <div class="card"><h2>Σφάλμα</h2><p>${escapeHtml(err)}</p></div>`;
    return;
  }

  const total = paperCount(bank);
  const entries = [...bank.entries].sort((a, b) => (Number(b.frequency) || 0) - (Number(a.frequency) || 0));
  const minis = [...bank.miniDefinitions].sort((a, b) => (Number(b.times) || 0) - (Number(a.times) || 0));

  // A mini-definition can only appear in a paper that drew the slot-8
  // question itself, so "how often did this definition show up" is measured
  // against how often that question appeared (frequency), NOT the full
  // paper count -- /9 understates even the most-examined definition, which
  // can appear in at most as many papers as slot-8 itself did.
  const minidefsEntry = bank.entries.find((e) => e && e.slot === 8);
  const minidefsPapers = Number(minidefsEntry?.frequency) || total;

  el.innerHTML = `
    ${pageHeader({
      title: '📚 Τράπεζα θεμάτων', back: `#/course/${courseId}`,
      subtitle: `${entries.length} επαναλαμβανόμενες ερωτήσεις έκθεσης`,
    })}
    <div class="card"><p class="muted">Ερωτήσεις που έχουν πέσει σε παλαιά θέματα, ταξινομημένες κατά συχνότητα εμφάνισης.
      Η τελευταία ερώτηση κάθε δοκιμίου ζητά πάντα τρεις σύντομους ορισμούς — η δεξαμενή τους είναι στο τέλος.</p></div>
    ${entries.map((e) => `
      <div class="card">
        <div class="row">
          <h2 class="grow">${escapeHtml(e.title)}</h2>
          <span class="pill pill-gold">${Number(e.frequency) || 0}/${total} δοκίμια</span>
          ${trendPill(e.trend)}
        </div>
        ${e.slot === 1 ? '<p class="muted" style="font-size:13px">📌 Πάντα η 1η ερώτηση</p>' : ''}
        ${e.slot === 8 ? '<p class="muted" style="font-size:13px">📌 Πάντα η τελευταία ερώτηση (με τρεις σύντομους ορισμούς)</p>' : ''}
        <h3>${(e.prompts || []).some((p) => p.papers?.length) ? 'Εκφωνήσεις όπως έχουν πέσει' : 'Εκφωνήσεις'}</h3>
        ${(e.prompts || []).map((p) => `
          <div class="prose" style="margin-bottom:4px">${formatText(p.text)}</div>
          ${promptOrigin(p)}`).join('')}
        ${(e.keyPoints || []).length ? `<h3>Βασικά σημεία</h3>
          <ul>${e.keyPoints.map((k) => `<li><div class="prose">${formatText(k)}</div></li>`).join('')}</ul>` : ''}
        ${e.modelAnswer ? `<details><summary>Υπόδειγμα απάντησης</summary><div class="prose">${formatText(e.modelAnswer)}</div></details>` : ''}
      </div>`).join('')}
    <div class="card">
      <h2>Δεξαμενή σύντομων ορισμών</h2>
      <p class="muted">Η τελευταία ερώτηση κάθε δοκιμίου ζητά τρεις από αυτούς τους ορισμούς.
        Η συχνότητα κάθε ορισμού μετριέται στα ${minidefsPapers} δοκίμια όπου τέθηκε αυτή η ερώτηση
        (από τα ${total} συνολικά), όχι στο σύνολο των δοκιμίων.</p>
      ${minis.map((m) => `
        <div class="essay-minidef">
          <div class="row"><h3 class="grow">${escapeHtml(m.term)}</h3>
            <span class="pill">${Number(m.times) || 0}/${minidefsPapers} δοκίμια με αυτή την ερώτηση</span></div>
          ${(m.keyPoints || []).length ? `<ul>${m.keyPoints.map((k) => `<li><div class="prose">${formatText(k)}</div></li>`).join('')}</ul>` : ''}
          ${m.modelAnswer ? `<details><summary>Υπόδειγμα απάντησης</summary><div class="prose">${formatText(m.modelAnswer)}</div></details>` : ''}
        </div>`).join('') || '<p class="muted">Χωρίς ορισμούς ακόμη.</p>'}
    </div>`;
}
