import { escapeHtml } from '../ui.js';
import { allTopics } from '../core/content.js';
import { isDue } from '../core/srs.js';
import { recordAnswer, newTopicProgress } from '../core/progress.js';
import { recordSession, evaluateBadges } from '../core/stats.js';

export async function render(el, ctx) {
  const { courseId } = ctx.params;
  const content = await ctx.getContent(courseId);
  const excluded = ctx.state.settings.excludedChapters[courseId] || [];
  const now = new Date().toISOString();
  const prog = (id) => ctx.state.topics[id] || newTopicProgress();

  // due topics first, then the rest; flatten all their flashcards
  const ts = allTopics(content, excluded).filter((t) => (t.flashcards || []).length);
  ts.sort((a, b) => Number(isDue(prog(b.id).nextReview, now)) - Number(isDue(prog(a.id).nextReview, now)));
  const cards = ts.flatMap((t) => t.flashcards.map((f) => ({ topicId: t.id, topicTitle: t.title, f })));

  if (!cards.length) {
    el.innerHTML = `<div class="card"><h2>🗂️ Κάρτες</h2>
      <p class="muted">Δεν υπάρχουν κάρτες για αυτό το μάθημα.</p>
      <a class="btn" href="#/course/${courseId}">Πίσω</a></div>`;
    return;
  }

  const startedAt = Date.now();
  let i = 0;
  let knew = 0;
  let xpEarned = 0;
  let flipped = false;

  const show = () => {
    const { topicId, topicTitle, f } = cards[i];
    flipped = false;
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <a class="btn btn-ghost" href="#/course/${courseId}">✕</a>
        <span class="grow muted">🗂️ Κάρτες · ${i + 1}/${cards.length}</span>
      </div>
      <p class="muted" style="font-size:13px">${escapeHtml(topicTitle)}</p>
      <div class="card flashcard" id="card">${escapeHtml(f.front)}</div>
      <div id="actions"><p class="muted" style="text-align:center">Πάτησε την κάρτα για την απάντηση</p></div>`;

    const card = document.getElementById('card');
    card.addEventListener('click', () => {
      if (flipped) return;
      flipped = true;
      card.innerHTML = escapeHtml(f.back);
      card.style.borderColor = 'var(--gold)';
      document.getElementById('actions').innerHTML = `
        <div class="row">
          <button class="btn grow" id="no">❌ Δεν το ήξερα</button>
          <button class="btn btn-gold grow" id="yes">✅ Το ήξερα</button>
        </div>`;
      const grade = (correct) => {
        const prev = prog(topicId);
        if (correct) { knew++; xpEarned += 10; }
        ctx.state.topics[topicId] = recordAnswer(prev, {
          correct, questionDifficulty: prev.difficulty, now: new Date().toISOString(),
        });
        ctx.save();
        i++;
        if (i < cards.length) show(); else finish();
      };
      document.getElementById('yes').addEventListener('click', () => grade(true));
      document.getElementById('no').addEventListener('click', () => grade(false));
    });
  };

  const finish = () => {
    const timeSeconds = Math.round((Date.now() - startedAt) / 1000);
    const nowIso = new Date().toISOString();
    ctx.state.stats = recordSession(ctx.state.stats, { now: nowIso, xp: xpEarned, timeSeconds });
    const masteredTopics = Object.values(ctx.state.topics).filter((p) => p.mastery >= 80).length;
    ctx.state.stats = evaluateBadges(ctx.state.stats, { masteredTopics }, nowIso);
    ctx.state.sessions.push({ date: nowIso, mode: 'flashcard', courseId, total: cards.length, correct: knew, timeSeconds, xp: xpEarned });
    ctx.state.sessions = ctx.state.sessions.slice(-50);
    ctx.save();
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>🗂️ Τέλος καρτών</h2>
        <div class="stat-row">
          <div class="stat"><b>${knew}/${cards.length}</b><span>Τις ήξερες</span></div>
          <div class="stat"><b>+${xpEarned}</b><span>XP</span></div>
          <div class="stat"><b>${Math.round(timeSeconds / 60)}′</b><span>Χρόνος</span></div>
        </div>
        <a class="btn btn-gold btn-block" href="#/flashcards/${courseId}">Ξανά</a>
        <a class="btn btn-ghost btn-block" href="#/">Αρχική</a>
      </div>`;
  };

  show();
}
