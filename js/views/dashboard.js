import { escapeHtml, fmtDate, pageHeader } from '../ui.js';
import { allTopics } from '../core/content.js';
import { isDue } from '../core/srs.js';
import { newTopicProgress } from '../core/progress.js';
import { recentActivity, readinessPct } from '../shell.js';

function ring(pct) {
  // Clamped at the render boundary, not upstream: a corrupted or hand-edited
  // import can carry any number, and an out-of-range one becomes a negative
  // or overlong stroke-dashoffset — an arc drawn the wrong way round rather
  // than a full or empty ring.
  const clamped = Math.min(100, Math.max(0, Number(pct) || 0));
  const r = 26; const c = 2 * Math.PI * r;
  const off = c * (1 - clamped / 100);
  return `<svg class="ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
    <circle class="ring-track" cx="32" cy="32" r="${r}"></circle>
    <circle class="ring-fill" cx="32" cy="32" r="${r}"
      style="stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}"></circle>
    <text class="ring-text" x="32" y="37" text-anchor="middle">${clamped}%</text>
  </svg>`;
}

export async function render(el, ctx) {
  const now = new Date().toISOString();
  const active = ctx.courses.courses.filter((c) => c.status === 'active');

  const perCourse = [];
  const topicsByCourse = {};
  let dueCount = 0;
  let mastered80 = 0;
  const weak = [];
  for (const c of ctx.courses.courses) {
    let content;
    try { content = await ctx.getContent(c.id); } catch { perCourse.push({ c, error: true }); continue; }
    const excluded = ctx.state.settings.excludedChapters[c.id] || [];
    const ts = allTopics(content, excluded);
    topicsByCourse[c.id] = ts;
    const progs = ts.map((t) => ctx.state.topics[t.id] || newTopicProgress());
    const mastery = ts.length ? Math.round(progs.reduce((s, p) => s + p.mastery, 0) / ts.length) : 0;
    const due = c.status === 'active'
      ? ts.filter((t, i) => isDue(progs[i].nextReview, now)).length : 0;
    dueCount += due;
    for (let i = 0; i < ts.length; i++) {
      if (progs[i].mastery >= 80) mastered80++;
      if (c.status === 'active' && progs[i].weak) weak.push({ course: c, topic: ts[i] });
    }
    perCourse.push({ c, mastery, due, topicCount: ts.length });
  }

  const s = ctx.state.stats;
  const readiness = readinessPct(ctx.courses, topicsByCourse, ctx.state.topics);
  const activity = recentActivity(ctx.state.sessions, 5);

  el.innerHTML = `
    ${pageHeader({ title: 'Πίνακας ελέγχου', subtitle: 'Η μελέτη σου με μια ματιά' })}
    <div class="statgrid">
      <div class="statcard"><div class="statcard-icon">⚡</div><div><b>${Number(s.totalXp) || 0}</b><span>Συνολικό XP</span></div></div>
      <div class="statcard"><div class="statcard-icon">🔥</div><div><b>${Number(s.currentStreak) || 0}</b><span>Σερί ημερών</span></div></div>
      <div class="statcard"><div class="statcard-icon">🎓</div><div><b>${mastered80}</b><span>Θέματα 80%+</span></div></div>
      <div class="statcard"><div class="statcard-icon">🎯</div><div><b>${readiness}%</b><span>Ετοιμότητα</span></div></div>
    </div>
    ${dueCount > 0 ? `<div class="card"><h2>📅 Επαναλήψεις για σήμερα</h2>
      <p><b>${dueCount}</b> θέματα περιμένουν επανάληψη.</p>
      ${active.map((c) => `<a class="btn btn-gold btn-block" href="#/quiz/${c.id}/revision">Επανάληψη — ${escapeHtml(c.title)}</a>`).join('')}
    </div>` : ''}
    <div class="dash-cols">
      <div class="dash-courses">
        ${perCourse.map(({ c, mastery, due, topicCount, error }) => error
          ? `<div class="card"><h2>${escapeHtml(c.title)}</h2><p class="muted">Η ύλη δεν είναι διαθέσιμη ακόμη.</p></div>`
          : `<div class="card course-card">
            <div class="row course-card-row">
              ${ring(mastery)}
              <div class="grow">
                <div class="row"><h2 class="grow">${escapeHtml(c.title)}</h2>
                  ${c.status === 'passed' ? '<span class="pill pill-ok">✓ Επιτυχία</span>' : `<span class="pill">${topicCount} θέματα</span>`}
                </div>
                <p class="muted">Completion ${mastery}%${due ? ` · ${due} για επανάληψη` : ''}</p>
                <div class="row">
                  <a class="btn" href="#/course/${c.id}">Ύλη</a>
                  <a class="btn btn-ghost" href="#/quiz/${c.id}/micro">Κουίζ</a>
                  <a class="btn btn-ghost" href="#/flashcards/${c.id}">Κάρτες</a>
                  <a class="btn btn-ghost" href="#/exam/${c.id}">Εξέταση</a>
                </div>
              </div>
            </div>
          </div>`).join('')}
      </div>
      <div class="card">
        <h2>🕘 Πρόσφατη δραστηριότητα</h2>
        ${activity.length ? activity.map((a) => `<div class="list-item activity-item">
            <div class="grow">
              <div class="activity-label">${escapeHtml(a.label)}</div>
              <div class="muted activity-detail">${escapeHtml(a.detail)}${a.date ? ` · ${escapeHtml(fmtDate(a.date))}` : ''}</div>
            </div>
            <span class="pill pill-gold">+${Number(a.xp) || 0} XP</span>
          </div>`).join('') : '<p class="muted">Καμία δραστηριότητα ακόμη.</p>'}
      </div>
    </div>
    ${weak.length ? `<div class="card"><h2>⚠️ Αδύναμα σημεία (${weak.length})</h2>
      ${weak.slice(0, 5).map((w) => `<a class="list-item" href="#/topic/${w.course.id}/${w.topic.id}">
        <span class="grow">${escapeHtml(w.topic.title)}</span><span class="pill pill-bad">αδύναμο</span></a>`).join('')}
      ${active.map((c) => `<a class="btn btn-block" href="#/quiz/${c.id}/weak">Εξάσκηση αδύναμων — ${escapeHtml(c.title)}</a>`).join('')}
    </div>` : ''}
  `;
}
