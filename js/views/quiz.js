import { escapeHtml } from '../ui.js';
import { pickQuizQuestions } from '../core/picker.js';
import { recordAnswer, newTopicProgress, XP } from '../core/progress.js';
import { recordSession, evaluateBadges } from '../core/stats.js';
import { formatText } from '../core/format.js';
import { editBtn, wireEditing, confirmLeaveEdit } from '../edit/editor.js';
import { findTopic } from '../edit/overlay.js';

const MODE_TITLES = {
  micro: '⚡ Γρήγορο Κουίζ',
  weak: '⚠️ Αδύναμα Σημεία',
  revision: '📅 Επανάληψη',
};

export async function render(el, ctx) {
  const { courseId, mode } = ctx.params;
  const content = await ctx.getContent(courseId);
  const excluded = ctx.state.settings.excludedChapters[courseId] || [];
  const questions = pickQuizQuestions({
    content, topics: ctx.state.topics, mode,
    now: new Date().toISOString(), excludedChapterIds: excluded, count: 10,
  });

  if (!questions.length) {
    el.innerHTML = `<div class="card"><h2>${MODE_TITLES[mode] || 'Κουίζ'}</h2>
      <p class="muted">${mode === 'weak'
        ? 'Κανένα αδύναμο θέμα — μπράβο! 🎉'
        : mode === 'revision'
          ? 'Καμία επανάληψη δεν εκκρεμεί σήμερα. 🎉'
          : 'Δεν υπάρχουν διαθέσιμες ερωτήσεις.'}</p>
      <a class="btn" href="#/course/${courseId}">Πίσω στην ύλη</a></div>`;
    return;
  }

  const startedAt = Date.now();
  let i = 0;
  let correctCount = 0;
  let xpEarned = 0;

  const showQuestion = () => {
    const { topicId, topicTitle, q } = questions[i];
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <a class="btn btn-ghost" href="#/course/${courseId}">✕</a>
        <span class="grow muted">${MODE_TITLES[mode] || 'Κουίζ'} · ${i + 1}/${questions.length}</span>
        <span class="pill pill-gold">+${xpEarned} XP</span>
      </div>
      <div class="card">
        <p class="muted" style="font-size:13px">${escapeHtml(topicTitle)} · ${q.difficulty === 'easy' ? 'εύκολη' : q.difficulty === 'hard' ? 'δύσκολη' : 'μέτρια'}</p>
        <h2>${escapeHtml(q.question)}</h2>
        ${q.options.map((o, idx) => `<button class="qopt" data-idx="${idx}">${escapeHtml(o)}</button>`).join('')}
        <div id="feedback"></div>
      </div>`;

    el.querySelectorAll('.qopt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = Number(btn.dataset.idx);
        const correct = chosen === q.correctIndex;
        if (correct) { correctCount++; xpEarned += XP[q.difficulty] ?? 10; }

        const prev = ctx.state.topics[topicId] || newTopicProgress();
        ctx.state.topics[topicId] = recordAnswer(prev, {
          correct, questionDifficulty: q.difficulty, now: new Date().toISOString(),
        });
        ctx.save();

        el.querySelectorAll('.qopt').forEach((b) => {
          b.disabled = true;
          const bi = Number(b.dataset.idx);
          if (bi === q.correctIndex) b.classList.add('correct');
          else if (bi === chosen) b.classList.add('wrong');
        });
        const qi = findTopic(content, topicId)?.mcq.indexOf(q) ?? -1;
        document.getElementById('feedback').innerHTML = `
          <p><b>${correct ? '✅ Σωστό!' : '❌ Λάθος.'}</b></p>
          <div class="row">
            <div class="grow prose"${qi >= 0 ? ` data-editpath="mcq.${qi}.explanation"` : ''}>${formatText(q.explanation)}</div>
            ${qi >= 0 ? editBtn(topicId) : ''}
          </div>
          <button class="btn btn-gold btn-block" id="next">${i + 1 < questions.length ? 'Επόμενη' : 'Ολοκλήρωση'}</button>`;
        wireEditing(document.getElementById('feedback'), { courseId, content });
        document.getElementById('next').addEventListener('click', () => {
          if (!confirmLeaveEdit()) return; // advancing replaces the whole view
          i++;
          if (i < questions.length) showQuestion(); else finish();
        });
      });
    });
  };

  const finish = () => {
    const timeSeconds = Math.round((Date.now() - startedAt) / 1000);
    const now = new Date().toISOString();
    ctx.state.stats = recordSession(ctx.state.stats, { now, xp: xpEarned, timeSeconds });
    const masteredTopics = Object.values(ctx.state.topics).filter((p) => p.mastery >= 80).length;
    ctx.state.stats = evaluateBadges(ctx.state.stats, { masteredTopics }, now);
    ctx.state.sessions.push({
      date: now, mode, courseId,
      total: questions.length, correct: correctCount, timeSeconds, xp: xpEarned,
    });
    ctx.state.sessions = ctx.state.sessions.slice(-50);
    ctx.save();

    const pct = Math.round((correctCount / questions.length) * 100);
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>${pct >= 80 ? '🎉 Εξαιρετικά!' : pct >= 50 ? '💪 Καλή δουλειά!' : '📚 Χρειάζεται μελέτη.'}</h2>
        <div class="stat-row">
          <div class="stat"><b>${correctCount}/${questions.length}</b><span>Σωστές</span></div>
          <div class="stat"><b>${pct}%</b><span>Επίδοση</span></div>
          <div class="stat"><b>+${xpEarned}</b><span>XP</span></div>
        </div>
        <a class="btn btn-gold btn-block" href="#/quiz/${courseId}/${mode}">Νέο κουίζ</a>
        <a class="btn btn-ghost btn-block" href="#/">Αρχική</a>
      </div>`;
  };

  showQuestion();
}
