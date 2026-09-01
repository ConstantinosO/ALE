import { escapeHtml, pageHeader } from '../ui.js';
import { formatText } from '../core/format.js';
import { editBtn, wireEditing, confirmLeaveEdit } from '../edit/editor.js';
import { loadEdits, pendingCount } from '../edit/overlay.js';
import { allTopics } from '../core/content.js';
import { newTopicProgress, recordAnswer, XP } from '../core/progress.js';
import { recordSession, evaluateBadges } from '../core/stats.js';

const CHECK_COUNT = 3;

// A bulleted, editable list (κρίσιμα σημεία / παγίδες). Blanking a field is
// an offered operation — the editor confirms it and commits "" — so a blanked
// item must disappear rather than leave a bullet with nothing after it. The
// ORIGINAL index still goes into data-editpath: these paths address the array
// as stored, and renumbering them here would point every later edit at its
// neighbour's text.
function bulletCard(heading, topic, field) {
  const items = topic[field] || [];
  const lis = items
    .map((f, i) => (String(f ?? '').trim()
      ? `<li><div class="prose" data-editpath="${field}.${i}">${formatText(f)}</div></li>`
      : ''))
    .join('');
  if (!lis) return '';
  return `<div class="card">
      <div class="row"><h2 class="grow">${heading}</h2>${editBtn(topic.id)}</div>
      <ul>${lis}</ul>
    </div>`;
}

// Most topics carry a single examQuestion object. The two merged chapters
// (5 and 6) carry a list, because folding two topics into one page brought
// two real ΠΒΑΚ questions with it and demoting either to a "short answer"
// would mislabel it. Both shapes read the same way from here.
const examList = (topic) => [].concat(topic.examQuestion ?? []);

// …and both shapes have to address the same field for editing: a lone
// object is `examQuestion.question`, a list is `examQuestion.0.question`.
const examPath = (topic, i, field) => (Array.isArray(topic.examQuestion)
  ? `examQuestion.${i}.${field}`
  : `examQuestion.${field}`);

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
  const isLastOfChapter = !next || next.chapterId !== topic.chapterId;
  const p = ctx.state.topics[topicId] || newTopicProgress();
  const questions = checkQuestions(topic, p);
  const examQuestions = examList(topic);

  const navRow = (bottom) => `
    <div class="row" style="${bottom ? 'margin-top:12px' : 'margin-bottom:12px'}">
      ${prev ? `<a class="btn btn-ghost" href="#/topic/${courseId}/${prev.id}">← Προηγούμενο</a>` : ''}
      <a class="btn btn-ghost grow" href="#/course/${courseId}">Ύλη</a>
      ${next ? `<a class="btn btn-gold" href="#/topic/${courseId}/${next.id}">Επόμενο →</a>` : ''}
    </div>`;

  const pending = pendingCount(loadEdits(window.localStorage), courseId, topicId);

  el.innerHTML = `
    ${pageHeader({
      title: topic.title,
      subtitle: topic.chapterTitle,
      back: `#/course/${courseId}`,
      actions: `
        ${idx >= 0 ? `<span class="muted" style="font-size:13px">${idx + 1}/${topics.length}</span>` : ''}
        ${pending ? '<span class="pill">εκκρεμεί ⟳</span>' : ''}
        <span class="pill">Completion ${Number(p.mastery) || 0}%</span>
        ${p.weak ? '<span class="pill pill-bad">αδύναμο</span>' : ''}
      `,
    })}
    <div class="card">
      <div class="row"><span class="grow"></span>${editBtn(topic.id)}</div>
      <div class="prose" data-editpath="summary">${formatText(topic.summary) || '<span class="muted">Χωρίς σύνοψη.</span>'}</div>
    </div>
    ${topic.keyDefinitions.length ? `<div class="card">
      <div class="row"><h2 class="grow">📖 Βασικοί ορισμοί</h2>${editBtn(topic.id)}</div>
      ${topic.keyDefinitions.map((d, i) => `<p style="margin-bottom:2px"><b>${escapeHtml(d.term)}:</b></p>
        <div class="prose" data-editpath="keyDefinitions.${i}.definition" style="margin-bottom:10px">${formatText(d.definition)}</div>`).join('')}
    </div>` : ''}
    ${bulletCard('💡 Κρίσιμα σημεία', topic, 'killerFacts')}
    ${bulletCard('⚠️ Συνήθεις παγίδες', topic, 'commonTraps')}
    ${(topic.shortAnswers || []).length ? `<div class="card">
      <div class="row"><h2 class="grow">✍️ Ερωτήσεις σύντομης απάντησης</h2>${editBtn(topic.id)}</div>
      ${topic.shortAnswers.map((s, i) => `<div class="prose" data-editpath="shortAnswers.${i}.question">${formatText(s.question)}</div>
      <details><summary>Υπόδειγμα απάντησης</summary><div class="prose" data-editpath="shortAnswers.${i}.modelAnswer">${formatText(s.modelAnswer)}</div></details>`).join('')}
    </div>` : ''}
    ${examQuestions.length ? `<div class="card">
      <div class="row"><h2 class="grow">📝 ${examQuestions.length > 1 ? 'Θέματα εξέτασης' : 'Θέμα εξέτασης'}</h2>${editBtn(topic.id)}</div>
      ${examQuestions.map((q, i) => `
        <div class="prose" data-editpath="${examPath(topic, i, 'question')}">${formatText(q.question)}</div>
        <details><summary>Υπόδειγμα απάντησης</summary><div class="prose" data-editpath="${examPath(topic, i, 'modelAnswer')}">${formatText(q.modelAnswer)}</div></details>`).join('')}
    </div>` : ''}
    <div class="card" id="check">
      ${questions.length ? `<h2>✅ Έλεγχος κατανόησης</h2>
        <p class="muted">${questions.length} ερωτήσεις για να επιβεβαιώσεις ότι το κατέκτησες.</p>
        <button class="btn btn-gold btn-block" id="startcheck">Έναρξη ελέγχου</button>`
      : '<h2>✅ Έλεγχος κατανόησης</h2><p class="muted">Δεν υπάρχουν ερωτήσεις για αυτό το θέμα.</p>'}
    </div>
    ${navRow(true)}
  `;

  wireEditing(el, { courseId, content });

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
            <p><b>${correct ? '✅ Σωστό!' : '❌ Λάθος.'}</b></p>
            <div class="row">
              <div class="grow prose" id="checkexpl" data-editpath="mcq.${topic.mcq.indexOf(q)}.explanation">${formatText(q.explanation)}</div>
              ${editBtn(topic.id, 'checkexpl')}
            </div>
            <button class="btn btn-gold btn-block" id="checknext">${i + 1 < questions.length ? 'Επόμενη' : 'Ολοκλήρωση'}</button>`;
          wireEditing(document.getElementById('checkfeedback'), { courseId, content });
          document.getElementById('checknext').addEventListener('click', () => {
            // Only #check is rewritten — an open ✏️ on the summary or the
            // killerFacts cards is untouched and must not be prompted about.
            if (!confirmLeaveEdit(card)) return;
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
          <p class="muted">Completion θέματος: ${mastery}%</p>
          ${pct < 80 ? '<button class="btn btn-ghost btn-block" id="retry">Ξανά</button>' : ''}
          ${isLastOfChapter
            ? `<p class="muted">Ολοκλήρωσες το κεφάλαιο «${escapeHtml(topic.chapterTitle)}».</p>
               <a class="btn btn-gold btn-block" href="#/chaptertest/${courseId}/${topic.chapterId}">📋 Τεστ κεφαλαίου (10 ερωτήσεις)</a>
               ${next ? `<a class="btn btn-ghost btn-block" href="#/topic/${courseId}/${next.id}">Επόμενο θέμα →</a>` : ''}`
            : next ? `<a class="btn btn-gold btn-block" href="#/topic/${courseId}/${next.id}">Επόμενο θέμα →</a>`
                   : `<a class="btn btn-gold btn-block" href="#/course/${courseId}">Τέλος ύλης — πίσω στα κεφάλαια</a>`}
        </div>`;
      const retry = document.getElementById('retry');
      if (retry) retry.addEventListener('click', () => { ctx.navigate(`#/topic/${courseId}/${topicId}`); });
    };

    showQuestion();
  });
}
