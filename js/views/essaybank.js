import { escapeHtml, pageHeader } from '../ui.js';
import { formatText } from '../core/format.js';
import { validateEssayBank } from '../core/essay.js';

// Frequency/times are measured against the nine real past papers the bank
// was built from (see the brief in essay-exam-report.md) — fixed here rather
// than derived, since the bank contract carries no "papers analysed" count.
const TOTAL_PAPERS = 9;

const TREND_LABEL = { core: 'σταθερό', heating: '↑ ανεβαίνει', cooling: '↓ υποχωρεί', rare: 'σπάνιο' };
const TREND_CLASS = { heating: 'pill-ok', cooling: 'pill-bad' };

function trendPill(trend) {
  const label = TREND_LABEL[trend] || (trend ? escapeHtml(String(trend)) : 'σπάνιο');
  return `<span class="pill ${TREND_CLASS[trend] || ''}">${label}</span>`;
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

  const entries = [...bank.entries].sort((a, b) => (Number(b.frequency) || 0) - (Number(a.frequency) || 0));
  const minis = [...bank.miniDefinitions].sort((a, b) => (Number(b.times) || 0) - (Number(a.times) || 0));

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
          <span class="pill pill-gold">${Number(e.frequency) || 0}/${TOTAL_PAPERS} δοκίμια</span>
          ${trendPill(e.trend)}
          ${e.marks != null ? `<span class="pill">${Number(e.marks)} μονάδες</span>` : ''}
        </div>
        ${e.slot === 1 ? '<p class="muted" style="font-size:13px">📌 Πάντα η 1η ερώτηση</p>' : ''}
        ${e.slot === 8 ? '<p class="muted" style="font-size:13px">📌 Πάντα η τελευταία ερώτηση (με τρεις σύντομους ορισμούς)</p>' : ''}
        <h3>Εκφωνήσεις όπως έχουν πέσει</h3>
        ${(e.prompts || []).map((p) => `
          <div class="prose" style="margin-bottom:4px">${formatText(p.text)}</div>
          ${p.papers?.length ? `<p class="muted" style="font-size:12px;margin:0 0 8px">${p.papers.map((x) => escapeHtml(x)).join(', ')}</p>` : ''}`).join('')}
        ${(e.keyPoints || []).length ? `<h3>Βασικά σημεία</h3>
          <ul>${e.keyPoints.map((k) => `<li><div class="prose">${formatText(k)}</div></li>`).join('')}</ul>` : ''}
        ${e.modelAnswer ? `<details><summary>Υπόδειγμα απάντησης</summary><div class="prose">${formatText(e.modelAnswer)}</div></details>` : ''}
      </div>`).join('')}
    <div class="card">
      <h2>Δεξαμενή σύντομων ορισμών</h2>
      <p class="muted">Η τελευταία ερώτηση κάθε δοκιμίου ζητά τρεις από αυτούς τους ορισμούς.</p>
      ${minis.map((m) => `
        <div class="essay-minidef">
          <div class="row"><h3 class="grow">${escapeHtml(m.term)}</h3>
            <span class="pill">${Number(m.times) || 0}/${TOTAL_PAPERS} δοκίμια</span></div>
          ${(m.keyPoints || []).length ? `<ul>${m.keyPoints.map((k) => `<li><div class="prose">${formatText(k)}</div></li>`).join('')}</ul>` : ''}
          ${m.modelAnswer ? `<details><summary>Υπόδειγμα απάντησης</summary><div class="prose">${formatText(m.modelAnswer)}</div></details>` : ''}
        </div>`).join('') || '<p class="muted">Χωρίς ορισμούς ακόμη.</p>'}
    </div>`;
}
