import { escapeHtml } from '../ui.js';
import { allTopics } from '../core/content.js';
import { isDue } from '../core/srs.js';
import { newTopicProgress } from '../core/progress.js';

export async function render(el, ctx) {
  const now = new Date().toISOString();
  const active = ctx.courses.courses.filter((c) => c.status === 'active');
  const passed = ctx.courses.courses.filter((c) => c.status === 'passed');

  const perCourse = [];
  let dueCount = 0;
  const weak = [];
  for (const c of ctx.courses.courses) {
    let content;
    try { content = await ctx.getContent(c.id); } catch { perCourse.push({ c, error: true }); continue; }
    const excluded = ctx.state.settings.excludedChapters[c.id] || [];
    const ts = allTopics(content, excluded);
    const progs = ts.map((t) => ctx.state.topics[t.id] || newTopicProgress());
    const mastery = ts.length ? Math.round(progs.reduce((s, p) => s + p.mastery, 0) / ts.length) : 0;
    const due = c.status === 'active'
      ? ts.filter((t, i) => isDue(progs[i].nextReview, now)).length : 0;
    dueCount += due;
    if (c.status === 'active') {
      for (let i = 0; i < ts.length; i++) {
        if (progs[i].weak) weak.push({ course: c, topic: ts[i] });
      }
    }
    perCourse.push({ c, mastery, due, topicCount: ts.length });
  }

  const s = ctx.state.stats;
  el.innerHTML = `
    <div class="card stat-row">
      <div class="stat"><b>🔥 ${s.currentStreak}</b><span>Σερί ημερών</span></div>
      <div class="stat"><b>${s.totalXp}</b><span>XP</span></div>
      <div class="stat"><b>${s.badges.length}</b><span>Παράσημα</span></div>
    </div>
    ${dueCount > 0 ? `<div class="card"><h2>📅 Επαναλήψεις για σήμερα</h2>
      <p><b>${dueCount}</b> θέματα περιμένουν επανάληψη.</p>
      ${active.map((c) => `<a class="btn btn-gold btn-block" href="#/quiz/${c.id}/revision">Επανάληψη — ${escapeHtml(c.title)}</a>`).join('')}
    </div>` : ''}
    ${perCourse.map(({ c, mastery, due, topicCount, error }) => error
      ? `<div class="card"><h2>${escapeHtml(c.title)}</h2><p class="muted">Η ύλη δεν είναι διαθέσιμη ακόμη.</p></div>`
      : `<div class="card">
        <div class="row"><h2 class="grow">${escapeHtml(c.title)}</h2>
          ${c.status === 'passed' ? '<span class="pill pill-ok">✓ Επιτυχία</span>' : `<span class="pill">${topicCount} θέματα</span>`}
        </div>
        <div class="bar ${mastery >= 80 ? 'hi' : ''}"><span style="width:${mastery}%"></span></div>
        <p class="muted">Κυριαρχία ${mastery}%${due ? ` · ${due} για επανάληψη` : ''}</p>
        <div class="row">
          <a class="btn" href="#/course/${c.id}">Ύλη</a>
          <a class="btn btn-ghost" href="#/quiz/${c.id}/micro">Κουίζ</a>
          <a class="btn btn-ghost" href="#/flashcards/${c.id}">Κάρτες</a>
          <a class="btn btn-ghost" href="#/exam/${c.id}">Εξέταση</a>
        </div>
      </div>`).join('')}
    ${weak.length ? `<div class="card"><h2>⚠️ Αδύναμα σημεία (${weak.length})</h2>
      ${weak.slice(0, 5).map((w) => `<a class="list-item" href="#/topic/${w.course.id}/${w.topic.id}">
        <span class="grow">${escapeHtml(w.topic.title)}</span><span class="pill pill-bad">αδύναμο</span></a>`).join('')}
      ${active.map((c) => `<a class="btn btn-block" href="#/quiz/${c.id}/weak">Εξάσκηση αδύναμων — ${escapeHtml(c.title)}</a>`).join('')}
    </div>` : ''}
    ${passed.length && !weak.length ? '' : ''}
  `;
}
