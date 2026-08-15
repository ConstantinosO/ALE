import { escapeHtml } from '../ui.js';
import { allTopics } from '../core/content.js';
import { newTopicProgress } from '../core/progress.js';

export async function render(el, ctx) {
  const { courseId, topicId } = ctx.params;
  const content = await ctx.getContent(courseId);
  const topic = allTopics(content).find((t) => t.id === topicId);
  if (!topic) { ctx.navigate(`#/course/${courseId}`); return; }
  const p = ctx.state.topics[topicId] || newTopicProgress();

  el.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <a class="btn btn-ghost" href="#/course/${courseId}">← Πίσω</a>
      <span class="pill">${p.mastery}% κυριαρχία</span>
      ${p.weak ? '<span class="pill pill-bad">αδύναμο</span>' : ''}
    </div>
    <div class="card">
      <h2>${escapeHtml(topic.title)}</h2>
      <p class="muted">${escapeHtml(topic.chapterTitle)}</p>
      <p>${escapeHtml(topic.summary) || '<span class="muted">Χωρίς σύνοψη.</span>'}</p>
    </div>
    ${topic.keyDefinitions.length ? `<div class="card"><h2>📖 Βασικοί ορισμοί</h2>
      ${topic.keyDefinitions.map((d) => `<p><b>${escapeHtml(d.term)}:</b> ${escapeHtml(d.definition)}</p>`).join('')}
    </div>` : ''}
    ${topic.killerFacts.length ? `<div class="card"><h2>💡 Κρίσιμα σημεία</h2>
      <ul>${topic.killerFacts.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
    </div>` : ''}
    ${topic.commonTraps.length ? `<div class="card"><h2>⚠️ Συνήθεις παγίδες</h2>
      <ul>${topic.commonTraps.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>
    </div>` : ''}
    ${topic.examQuestion ? `<div class="card"><h2>📝 Θέμα εξέτασης (${topic.examQuestion.marks} μονάδες)</h2>
      <p>${escapeHtml(topic.examQuestion.question)}</p>
      <details><summary>Υπόδειγμα απάντησης</summary><p>${escapeHtml(topic.examQuestion.modelAnswer)}</p></details>
    </div>` : ''}
  `;
}
