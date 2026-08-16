import { escapeHtml, pageHeader } from '../ui.js';
import { newTopicProgress } from '../core/progress.js';

export async function render(el, ctx) {
  const course = ctx.courses.courses.find((c) => c.id === ctx.params.courseId);
  if (!course) { ctx.navigate('#/'); return; }
  const content = await ctx.getContent(course.id);
  const excluded = new Set(ctx.state.settings.excludedChapters[course.id] || []);

  el.innerHTML = `
    ${pageHeader({
      title: course.title, back: '#/',
      actions: course.status === 'passed' ? '<span class="pill pill-ok">✓ Επιτυχία</span>' : '',
    })}
    <div class="row" style="margin-bottom:12px">
      <a class="btn" href="#/quiz/${course.id}/micro">Κουίζ</a>
      <a class="btn btn-ghost" href="#/flashcards/${course.id}">Κάρτες</a>
      <a class="btn btn-ghost" href="#/exam/${course.id}">Εξέταση</a>
      <a class="btn btn-ghost" href="#/analysis/${course.id}">Ανάλυση</a>
    </div>
    ${content.chapters.map((ch) => `
      <div class="card">
        <div class="row">
          <h2 class="grow">${escapeHtml(ch.title)}</h2>
          <label class="muted" style="font-size:13px">
            <input type="checkbox" data-chapter="${ch.id}" ${excluded.has(ch.id) ? '' : 'checked'}> στη μελέτη
          </label>
        </div>
        ${ch.topics.map((t) => {
          const p = ctx.state.topics[t.id] || newTopicProgress();
          return `<a class="list-item" href="#/topic/${course.id}/${t.id}">
            <span class="grow">${escapeHtml(t.title)}</span>
            ${p.weak ? '<span class="pill pill-bad">αδύναμο</span>' : ''}
            <span class="pill">${Number(p.mastery) || 0}%</span>
          </a>`;
        }).join('') || '<p class="muted">Χωρίς θέματα ακόμη.</p>'}
        ${ch.topics.some((t) => (t.mcq || []).length)
          ? `<a class="btn btn-block" style="margin-top:10px" href="#/chaptertest/${course.id}/${ch.id}">📋 Τεστ κεφαλαίου (10 ερωτήσεις)</a>`
          : ''}
      </div>`).join('')}
  `;

  el.querySelectorAll('input[data-chapter]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const list = new Set(ctx.state.settings.excludedChapters[course.id] || []);
      if (cb.checked) list.delete(cb.dataset.chapter); else list.add(cb.dataset.chapter);
      ctx.state.settings.excludedChapters[course.id] = [...list];
      ctx.save();
    });
  });
}
