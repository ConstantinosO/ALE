import { escapeHtml } from '../ui.js';
import { formatText } from '../core/format.js';
import { newTopicProgress, recordAnswer, XP } from '../core/progress.js';
import { recordSession, evaluateBadges } from '../core/stats.js';

const TEST_COUNT = 10;
const PASS_PCT = 70;

// Round-robin across the chapter's topics so every topic is represented,
// preferring each topic's tracked difficulty first.
function pickChapterQuestions(chapter, topicsState, count) {
  const pools = chapter.topics
    .filter((t) => (t.mcq || []).length)
    .map((t) => {
      const prog = topicsState[t.id] || newTopicProgress();
      const match = t.mcq.filter((q) => q.difficulty === prog.difficulty);
      const rest = t.mcq.filter((q) => q.difficulty !== prog.difficulty);
      return { topic: t, pool: [...match, ...rest] };
    });
  const picked = [];
  let round = 0;
  while (picked.length < count) {
    let took = false;
    for (const p of pools) {
      if (picked.length >= count) break;
      if (p.pool.length > round) {
        picked.push({ topicId: p.topic.id, topicTitle: p.topic.title, q: p.pool[round] });
        took = true;
      }
    }
    if (!took) break;
    round++;
  }
  return picked;
}

export async function render(el, ctx) {
  const { courseId, chapterId } = ctx.params;
  const content = await ctx.getContent(courseId);
  const chapter = content.chapters.find((c) => c.id === chapterId);
  if (!chapter) { ctx.navigate(`#/course/${courseId}`); return; }

  const chapterIdx = content.chapters.findIndex((c) => c.id === chapterId);
  const nextChapter = content.chapters[chapterIdx + 1] || null;
  const questions = pickChapterQuestions(chapter, ctx.state.topics, TEST_COUNT);

  if (!questions.length) {
    el.innerHTML = `<div class="card"><h2>📋 Τεστ κεφαλαίου</h2>
      <p class="muted">Δεν υπάρχουν ερωτήσεις για αυτό το κεφάλαιο.</p>
      <a class="btn" href="#/course/${courseId}">Πίσω στην ύλη</a></div>`;
    return;
  }

  el.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <a class="btn btn-ghost" href="#/course/${courseId}">← Πίσω</a>
    </div>
    <div class="card" style="text-align:center">
      <h2>📋 Τεστ κεφαλαίου</h2>
      <p><b>${escapeHtml(chapter.title)}</b></p>
      <p class="muted">${questions.length} ερωτήσεις από όλα τα θέματα του κεφαλαίου · επιτυχία από ${PASS_PCT}%</p>
      <button class="btn btn-gold btn-block" id="starttest">Έναρξη</button>
      <a class="btn btn-ghost btn-block" href="#/course/${courseId}">Άκυρο</a>
    </div>`;

  document.getElementById('starttest').addEventListener('click', run);

  function run() {
    const startedAt = Date.now();
    let i = 0;
    let correctCount = 0;
    let xpEarned = 0;
    const perTopic = {};

    const show = () => {
      const { topicTitle, q } = questions[i];
      el.innerHTML = `
        <div class="row" style="margin-bottom:12px">
          <a class="btn btn-ghost" href="#/course/${courseId}">✕</a>
          <span class="grow muted">📋 Τεστ κεφαλαίου · ${i + 1}/${questions.length}</span>
          <span class="pill pill-gold">+${xpEarned} XP</span>
        </div>
        <div class="card">
          <p class="muted" style="font-size:13px">${escapeHtml(topicTitle)} · ${q.difficulty === 'easy' ? 'εύκολη' : q.difficulty === 'hard' ? 'δύσκολη' : 'μέτρια'}</p>
          <h2>${escapeHtml(q.question)}</h2>
          ${q.options.map((o, n) => `<button class="qopt" data-idx="${n}">${escapeHtml(o)}</button>`).join('')}
          <div id="feedback"></div>
        </div>`;

      el.querySelectorAll('.qopt').forEach((btn) => {
        btn.addEventListener('click', () => {
          const chosen = Number(btn.dataset.idx);
          const correct = chosen === q.correctIndex;
          const { topicId } = questions[i];
          if (correct) { correctCount++; xpEarned += XP[q.difficulty] ?? 10; }

          const before = ctx.state.topics[topicId] || newTopicProgress();
          ctx.state.topics[topicId] = recordAnswer(before, {
            correct, questionDifficulty: q.difficulty, now: new Date().toISOString(),
          });
          ctx.save();

          perTopic[topicTitle] ??= { correct: 0, total: 0 };
          perTopic[topicTitle].total++;
          if (correct) perTopic[topicTitle].correct++;

          el.querySelectorAll('.qopt').forEach((b) => {
            b.disabled = true;
            const bi = Number(b.dataset.idx);
            if (bi === q.correctIndex) b.classList.add('correct');
            else if (bi === chosen) b.classList.add('wrong');
          });
          document.getElementById('feedback').innerHTML = `
            <p><b>${correct ? '✅ Σωστό!' : '❌ Λάθος.'}</b></p>
            <div class="prose">${formatText(q.explanation)}</div>
            <button class="btn btn-gold btn-block" id="next">${i + 1 < questions.length ? 'Επόμενη' : 'Ολοκλήρωση'}</button>`;
          document.getElementById('next').addEventListener('click', () => {
            i++;
            if (i < questions.length) show(); else finish();
          });
        });
      });
    };

    const finish = () => {
      const nowIso = new Date().toISOString();
      const timeSeconds = Math.round((Date.now() - startedAt) / 1000);
      ctx.state.stats = recordSession(ctx.state.stats, { now: nowIso, xp: xpEarned, timeSeconds });
      const masteredTopics = Object.values(ctx.state.topics).filter((t) => t.mastery >= 80).length;
      ctx.state.stats = evaluateBadges(ctx.state.stats, { masteredTopics }, nowIso);
      ctx.state.sessions.push({
        date: nowIso, mode: 'chapter_test', courseId,
        total: questions.length, correct: correctCount, timeSeconds, xp: xpEarned,
      });
      ctx.state.sessions = ctx.state.sessions.slice(-50);
      ctx.save();

      const pct = Math.round((correctCount / questions.length) * 100);
      const passed = pct >= PASS_PCT;
      el.innerHTML = `
        <div class="card" style="text-align:center">
          <h2>${passed ? '🎉 Πέρασες το κεφάλαιο!' : '📚 Χρειάζεται επανάληψη'}</h2>
          <p class="muted">${escapeHtml(chapter.title)}</p>
          <div class="stat-row">
            <div class="stat"><b>${correctCount}/${questions.length}</b><span>Σωστές</span></div>
            <div class="stat"><b>${pct}%</b><span>Επίδοση</span></div>
            <div class="stat"><b>+${xpEarned}</b><span>XP</span></div>
          </div>
        </div>
        <div class="card">
          <h2>Ανά θέμα</h2>
          ${Object.entries(perTopic).map(([title, r]) => `
            <div class="list-item"><span class="grow">${escapeHtml(title)}</span>
              <span class="pill ${r.correct === r.total ? 'pill-ok' : r.correct === 0 ? 'pill-bad' : ''}">${r.correct}/${r.total}</span></div>`).join('')}
          <a class="btn btn-ghost btn-block" href="#/chaptertest/${courseId}/${chapterId}">Ξανά</a>
          ${nextChapter
            ? `<a class="btn btn-gold btn-block" href="#/topic/${courseId}/${nextChapter.topics[0]?.id || ''}">Επόμενο κεφάλαιο →</a>`
            : '<a class="btn btn-gold btn-block" href="#/exam/' + courseId + '">Δοκίμασε προσομοίωση εξέτασης →</a>'}
          <a class="btn btn-ghost btn-block" href="#/course/${courseId}">Πίσω στην ύλη</a>
        </div>`;
    };

    show();
  }
}
