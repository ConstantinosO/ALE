import { escapeHtml } from '../ui.js';
import { allTopics } from '../core/content.js';
import { newTopicProgress, recordAnswer, XP } from '../core/progress.js';
import { recordSession, evaluateBadges } from '../core/stats.js';

const CHECK_COUNT = 5;

// Questions for the end-of-topic check: the tracked difficulty first, then the rest.
function checkQuestions(topic, prog) {
  const pool = topic.mcq || [];
  const match = pool.filter((q) => q.difficulty === prog.difficulty);
  const rest = pool.filter((q) => q.difficulty !== prog.difficulty);
  return [...match, ...rest].slice(0, CHECK_COUNT);
}

export async function render(el, ctx) {
  const { courseId, topicId } = ctx.params;
  const content = await ctx.getContent(courseId);
  const excluded = ctx.state.settings.excludedChapters[courseId] || [];
  const topics = allTopics(content, excluded);
  const idx = topics.findIndex((t) => t.id === topicId);
  // A topic reached directly from an excluded chapter still opens, it just has no neighbours.
  const topic = idx >= 0 ? topics[idx] : allTopics(content).find((t) => t.id === topicId);
  if (!topic) { ctx.navigate(`#/course/${courseId}`); return; }
  const prev = idx > 0 ? topics[idx - 1] : null;
  const next = idx >= 0 && idx < topics.length - 1 ? topics[idx + 1] : null;
  const p = ctx.state.topics[topicId] || newTopicProgress();
  const questions = checkQuestions(topic, p);

  const navRow = (bottom) => `
    <div class="row" style="${bottom ? 'margin-top:12px' : 'margin-bottom:12px'}">
      ${prev ? `<a class="btn btn-ghost" href="#/topic/${courseId}/${prev.id}">← Προηγούμενο</a>` : ''}
      <a class="btn btn-ghost grow" href="#/course/${courseId}">Ύλη</a>
      ${next ? `<a class="btn btn-gold" href="#/topic/${courseId}/${next.id}">Επόμενο →</a>` : ''}
    </div>`;

  el.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <a class="btn btn-ghost" href="#/course/${courseId}">← Πίσω</a>
      <span class="grow muted">${idx >= 0 ? `${idx + 1}/${topics.length}` : ''}</span>
      <span class="pill">${Number(p.mastery) || 0}% κυριαρχία</span>
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
    ${(topic.shortAnswers || []).length ? `<div class="card"><h2>✍️ Ερωτήσεις σύντομης απάντησης</h2>
      ${topic.shortAnswers.map((s) => `<p>${escapeHtml(s.question)}</p>
      <details><summary>Υπόδειγμα απάντησης</summary><p>${escapeHtml(s.modelAnswer)}</p></details>`).join('')}
    </div>` : ''}
    ${topic.examQuestion ? `<div class="card"><h2>📝 Θέμα εξέτασης (${topic.examQuestion.marks} μονάδες)</h2>
      <p>${escapeHtml(topic.examQuestion.question)}</p>
      <details><summary>Υπόδειγμα απάντησης</summary><p>${escapeHtml(topic.examQuestion.modelAnswer)}</p></details>
    </div>` : ''}
    <div class="card" id="check">
      ${questions.length ? `<h2>✅ Έλεγχος κατανόησης</h2>
        <p class="muted">${questions.length} ερωτήσεις για να επιβεβαιώσεις ότι το κατέκτησες.</p>
        <button class="btn btn-gold btn-block" id="startcheck">Έναρξη ελέγχου</button>`
      : '<h2>✅ Έλεγχος κατανόησης</h2><p class="muted">Δεν υπάρχουν ερωτήσεις για αυτό το θέμα.</p>'}
    </div>
    ${navRow(true)}
  `;

  const startBtn = document.getElementById('startcheck');
  if (!startBtn) return;

  startBtn.addEventListener('click', () => {
    const card = document.getElementById('check');
    const startedAt = Date.now();
    let i = 0;
    let correctCount = 0;
    let xpEarned = 0;

    const showQuestion = () => {
      const q = questions[i];
      card.innerHTML = `
        <div class="row"><h2 class="grow">✅ Έλεγχος κατανόησης</h2>
          <span class="pill">${i + 1}/${questions.length}</span></div>
        <p class="muted" style="font-size:13px">${q.difficulty === 'easy' ? 'εύκολη' : q.difficulty === 'hard' ? 'δύσκολη' : 'μέτρια'}</p>
        <h3>${escapeHtml(q.question)}</h3>
        ${q.options.map((o, n) => `<button class="qopt" data-idx="${n}">${escapeHtml(o)}</button>`).join('')}
        <div id="checkfeedback"></div>`;

      card.querySelectorAll('.qopt').forEach((btn) => {
        btn.addEventListener('click', () => {
          const chosen = Number(btn.dataset.idx);
          const correct = chosen === q.correctIndex;
          if (correct) { correctCount++; xpEarned += XP[q.difficulty] ?? 10; }

          const before = ctx.state.topics[topicId] || newTopicProgress();
          ctx.state.topics[topicId] = recordAnswer(before, {
            correct, questionDifficulty: q.difficulty, now: new Date().toISOString(),
          });
          ctx.save();

          card.querySelectorAll('.qopt').forEach((b) => {
            b.disabled = true;
            const bi = Number(b.dataset.idx);
            if (bi === q.correctIndex) b.classList.add('correct');
            else if (bi === chosen) b.classList.add('wrong');
          });
          document.getElementById('checkfeedback').innerHTML = `
            <p><b>${correct ? '✅ Σωστό!' : '❌ Λάθος.'}</b> ${escapeHtml(q.explanation)}</p>
            <button class="btn btn-gold btn-block" id="checknext">${i + 1 < questions.length ? 'Επόμενη' : 'Ολοκλήρωση'}</button>`;
          document.getElementById('checknext').addEventListener('click', () => {
            i++;
            if (i < questions.length) showQuestion(); else finish();
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
        date: nowIso, mode: 'topic_check', courseId,
        total: questions.length, correct: correctCount, timeSeconds, xp: xpEarned,
      });
      ctx.state.sessions = ctx.state.sessions.slice(-50);
      ctx.save();

      const mastery = Number(ctx.state.topics[topicId]?.mastery) || 0;
      const pct = Math.round((correctCount / questions.length) * 100);
      card.innerHTML = `
        <div style="text-align:center">
          <h2>${pct >= 80 ? '🎉 Το κατέκτησες!' : pct >= 50 ? '💪 Καλά πας.' : '📚 Ξαναδιάβασέ το.'}</h2>
          <div class="stat-row">
            <div class="stat"><b>${correctCount}/${questions.length}</b><span>Σωστές</span></div>
            <div class="stat"><b>${pct}%</b><span>Επίδοση</span></div>
            <div class="stat"><b>+${xpEarned}</b><span>XP</span></div>
          </div>
          <p class="muted">Κυριαρχία θέματος: ${mastery}%</p>
          ${pct < 80 ? '<button class="btn btn-ghost btn-block" id="retry">Ξανά</button>' : ''}
          ${next ? `<a class="btn btn-gold btn-block" href="#/topic/${courseId}/${next.id}">Επόμενο θέμα →</a>`
                 : `<a class="btn btn-gold btn-block" href="#/course/${courseId}">Τέλος ύλης — πίσω στα κεφάλαια</a>`}
        </div>`;
      const retry = document.getElementById('retry');
      if (retry) retry.addEventListener('click', () => { ctx.navigate(`#/topic/${courseId}/${topicId}`); });
    };

    showQuestion();
  });
}
