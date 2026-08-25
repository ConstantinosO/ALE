import { escapeHtml, pageHeader } from '../ui.js';

export async function render(el, ctx) {
  const { courseId } = ctx.params;
  const course = ctx.courses.courses.find((c) => c.id === courseId);
  const a = await ctx.getAnalysis(courseId);

  const essayLinks = `
    <div class="card">
      <p class="muted">Το πραγματικό θέμα είναι 8 ερωτήσεις έκθεσης, εκ των οποίων απαντάς τις 6 — καμία MCQ.</p>
      <a class="btn btn-gold btn-block" href="#/essay/${courseId}">📝 Εξέταση εκθέσεων (6 από 8)</a>
      <a class="btn btn-ghost btn-block" href="#/essaybank/${courseId}">📚 Τράπεζα θεμάτων</a>
    </div>`;

  if (!a) {
    el.innerHTML = `
      ${pageHeader({ title: 'Ανάλυση εξετάσεων', back: `#/course/${courseId}` })}
      <div class="card">
      <p class="muted">Δεν υπάρχει ακόμη ανάλυση παλαιών θεμάτων για το μάθημα «${escapeHtml(course?.title || courseId)}».
      Θα προστεθεί όταν αναλυθούν τα past papers.</p></div>
      ${essayLinks}`;
    return;
  }

  el.innerHTML = `
    ${pageHeader({ title: 'Ανάλυση εξετάσεων', back: `#/course/${courseId}` })}
    ${essayLinks}
    ${a.sourcePapers?.length ? `<div class="card"><p class="muted">Πηγές: ${a.sourcePapers.map(escapeHtml).join(', ')}</p></div>` : ''}
    <div class="card">
      <h2>Συχνότητα θεμάτων</h2>
      <table class="freq">
        ${(a.topicFrequencies || []).map((f) => `
          <tr><td>${escapeHtml(f.topic)}</td><td style="width:45%">
            <div class="bar"><span style="width:${Number(f.percentage) || 0}%"></span></div></td>
            <td>${Number(f.percentage) || 0}%</td></tr>`).join('')}
      </table>
    </div>
    ${a.questionTypes?.length ? `<div class="card"><h2>Τύποι ερωτήσεων</h2>
      <table class="freq">${a.questionTypes.map((t) => `
        <tr><td>${escapeHtml(t.type)}</td><td>${Number(t.count) || 0}</td><td>${Number(t.percentage) || 0}%</td></tr>`).join('')}</table>
    </div>` : ''}
    ${a.killerFacts?.length ? `<div class="card"><h2>💡 Σημεία που επανέρχονται</h2>
      <ul>${a.killerFacts.map((k) => `<li>${escapeHtml(k.fact)} <span class="pill">×${Number(k.frequency) || 0}</span></li>`).join('')}</ul>
    </div>` : ''}
    ${a.recommendations?.length ? `<div class="card"><h2>🎯 Συστάσεις</h2>
      <ul>${a.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    </div>` : ''}
  `;
}
