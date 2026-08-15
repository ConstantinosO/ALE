import { escapeHtml } from '../ui.js';
import { pickExamQuestions } from '../core/picker.js';
import { recordAnswer, newTopicProgress, XP } from '../core/progress.js';
import { recordSession, evaluateBadges } from '../core/stats.js';

const EXAM_MINUTES = 30;
const EXAM_QUESTIONS = 20;

export async function render(el, ctx) {
  const { courseId } = ctx.params;
  const content = await ctx.getContent(courseId);
  const analysis = await ctx.getAnalysis(courseId);
  const excluded = ctx.state.settings.excludedChapters[courseId] || [];
  const questions = pickExamQuestions({ content, analysis, excludedChapterIds: excluded, count: EXAM_QUESTIONS });

  if (!questions.length) {
    el.innerHTML = `<div class="card"><h2>📝 Προσομοίωση Εξέτασης</h2>
      <p class="muted">Δεν υπάρχουν διαθέσιμες ερωτήσεις.</p>
      <a class="btn" href="#/course/${courseId}">Πίσω</a></div>`;
    return;
  }

  // intro screen
  el.innerHTML = `
    <div class="card" style="text-align:center">
      <h2>📝 Προσομοίωση Εξέτασης</h2>
      <p>${questions.length} ερωτήσεις · ${EXAM_MINUTES} λεπτά · χωρίς βοήθεια ανά ερώτηση</p>
      ${analysis ? '<p class="muted">Οι ερωτήσεις σταθμίζονται με βάση την ανάλυση παλαιών θεμάτων.</p>' : ''}
      <button class="btn btn-gold btn-block" id="start">Έναρξη</button>
      <a class="btn btn-ghost btn-block" href="#/course/${courseId}">Άκυρο</a>
    </div>`;
  document.getElementById('start').addEventListener('click', run);

  function run() {
    const answers = new Array(questions.length).fill(null);
    let i = 0;
    const startedAt = Date.now();
    const deadline = startedAt + EXAM_MINUTES * 60 * 1000;
    let timerId = null;
    let done = false;

    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      const mm = String(Math.floor(left / 60000)).padStart(2, '0');
      const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
      const t = document.getElementById('timer');
      if (t) t.textContent = `${mm}:${ss}`;
      if (left <= 0) { clearInterval(timerId); finish(); }
    };

    const show = () => {
      const { topicTitle, q } = questions[i];
      el.innerHTML = `
        <div class="row" style="margin-bottom:12px">
          <span class="grow muted">Ερώτηση ${i + 1}/${questions.length}</span>
          <span class="timer" id="timer">--:--</span>
        </div>
        <div class="card">
          <p class="muted" style="font-size:13px">${escapeHtml(topicTitle)}</p>
          <h2>${escapeHtml(q.question)}</h2>
          ${q.options.map((o, idx) => `
            <button class="qopt ${answers[i] === idx ? 'correct' : ''}" data-idx="${idx}">${escapeHtml(o)}</button>`).join('')}
          <div class="row">
            <button class="btn btn-ghost grow" id="prev" ${i === 0 ? 'disabled' : ''}>← Προηγούμενη</button>
            ${i + 1 < questions.length
              ? '<button class="btn grow" id="nextq">Επόμενη →</button>'
              : '<button class="btn btn-gold grow" id="submit">Υποβολή</button>'}
          </div>
        </div>`;
      tick();
      el.querySelectorAll('.qopt').forEach((btn) => {
        btn.addEventListener('click', () => {
          answers[i] = Number(btn.dataset.idx);
          el.querySelectorAll('.qopt').forEach((b) => b.classList.remove('correct'));
          btn.classList.add('correct');
        });
      });
      const prev = document.getElementById('prev');
      if (prev) prev.addEventListener('click', () => { if (i > 0) { i--; show(); } });
      const nextq = document.getElementById('nextq');
      if (nextq) nextq.addEventListener('click', () => { i++; show(); });
      const submit = document.getElementById('submit');
      if (submit) submit.addEventListener('click', () => {
        const blank = answers.filter((a) => a === null).length;
        if (!blank || confirm(`Έχεις ${blank} αναπάντητες ερωτήσεις. Υποβολή;`)) { clearInterval(timerId); finish(); }
      });
    };

    const finish = () => {
      if (done) return; done = true; clearInterval(timerId);
      const nowIso = new Date().toISOString();
      const timeSeconds = Math.round((Date.now() - startedAt) / 1000);
      let correctCount = 0;
      let xpEarned = 0;
      const perTopic = {};
      questions.forEach(({ topicId, topicTitle, q }, idx) => {
        const correct = answers[idx] === q.correctIndex;
        if (correct) { correctCount++; xpEarned += XP[q.difficulty] ?? 10; }
        const prev = ctx.state.topics[topicId] || newTopicProgress();
        ctx.state.topics[topicId] = recordAnswer(prev, { correct, questionDifficulty: q.difficulty, now: nowIso });
        perTopic[topicTitle] ??= { correct: 0, total: 0 };
        perTopic[topicTitle].total++;
        if (correct) perTopic[topicTitle].correct++;
      });
      ctx.state.stats = recordSession(ctx.state.stats, { now: nowIso, xp: xpEarned, timeSeconds });
      const masteredTopics = Object.values(ctx.state.topics).filter((p) => p.mastery >= 80).length;
      ctx.state.stats = evaluateBadges(ctx.state.stats, { masteredTopics }, nowIso);
      ctx.state.sessions.push({ date: nowIso, mode: 'exam', courseId, total: questions.length, correct: correctCount, timeSeconds, xp: xpEarned });
      ctx.state.sessions = ctx.state.sessions.slice(-50);
      ctx.save();

      const pct = Math.round((correctCount / questions.length) * 100);
      el.innerHTML = `
        <div class="card" style="text-align:center">
          <h2>${pct >= 70 ? '🎉 Επιτυχία!' : '📚 Θέλει δουλειά ακόμη'}</h2>
          <div class="stat-row">
            <div class="stat"><b>${correctCount}/${questions.length}</b><span>Σωστές</span></div>
            <div class="stat"><b>${pct}%</b><span>Επίδοση</span></div>
            <div class="stat"><b>${Math.round(timeSeconds / 60)}′</b><span>Χρόνος</span></div>
          </div>
        </div>
        <div class="card">
          <h2>Ανά θέμα</h2>
          ${Object.entries(perTopic).map(([title, r]) => `
            <div class="list-item"><span class="grow">${escapeHtml(title)}</span>
              <span class="pill ${r.correct === r.total ? 'pill-ok' : r.correct === 0 ? 'pill-bad' : ''}">${r.correct}/${r.total}</span></div>`).join('')}
          <a class="btn btn-gold btn-block" href="#/exam/${courseId}">Νέα προσομοίωση</a>
          <a class="btn btn-ghost btn-block" href="#/">Αρχική</a>
        </div>`;
    };

    timerId = setInterval(tick, 500);
    ctx.onCleanup(() => clearInterval(timerId));
    show();
  }
}
