import { escapeHtml } from '../ui.js';

export async function render(el, ctx) {
  const { courseId } = ctx.params;
  const course = ctx.courses.courses.find((c) => c.id === courseId);
  const a = await ctx.getAnalysis(courseId);

  if (!a) {
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px"><a class="btn btn-ghost" href="#/course/${courseId}">← Πίσω</a></div>
      <div class="card"><h2>📊 Ανάλυση Εξετάσεων</h2>
      <p class="muted">Δεν υπάρχει ακόμη ανάλυση παλαιών θεμάτων για το μάθημα «${escapeHtml(course?.title || courseId)}».
      Θα προστεθεί όταν αναλυθούν τα past papers.</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="row" style="margin-bottom:12px"><a class="btn btn-ghost" href="#/course/${courseId}">← Πίσω</a>
      <h2 class="grow" style="margin:0">📊 Ανάλυση Εξετάσεων</h2></div>
    ${a.sourcePapers?.length ? `<div class="card"><p class="muted">Πηγές: ${a.sourcePapers.map(escapeHtml).join(', ')}</p></div>` : ''}
    <div class="card">
      <h2>Συχνότητα θεμάτων</h2>
      <table class="freq">
        ${(a.topicFrequencies || []).map((f) => `
          <tr><td>${escapeHtml(f.topic)}</td><td style="width:45%">
            <div class="bar"><span style="width:${f.percentage}%"></span></div></td>
            <td>${f.percentage}%</td></tr>`).join('')}
      </table>
    </div>
    ${a.questionTypes?.length ? `<div class="card"><h2>Τύποι ερωτήσεων</h2>
      <table class="freq">${a.questionTypes.map((t) => `
        <tr><td>${escapeHtml(t.type)}</td><td>${t.count}</td><td>${t.percentage}%</td></tr>`).join('')}</table>
    </div>` : ''}
    ${a.killerFacts?.length ? `<div class="card"><h2>💡 Σημεία που επανέρχονται</h2>
      <ul>${a.killerFacts.map((k) => `<li>${escapeHtml(k.fact)} <span class="pill">×${k.frequency}</span></li>`).join('')}</ul>
    </div>` : ''}
    ${a.recommendations?.length ? `<div class="card"><h2>🎯 Συστάσεις</h2>
      <ul>${a.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    </div>` : ''}
  `;
}
