import { escapeHtml, pageHeader } from '../ui.js';
import { formatText } from '../core/format.js';
import { validateEssayBank, buildPaper, scoreQuestion, scorePaper, questionTopicIds } from '../core/essay.js';
import { recordAnswer, newTopicProgress, XP } from '../core/progress.js';
import { recordSession, evaluateBadges } from '../core/stats.js';

// The draft (in-progress paper + typed answers) lives under its OWN
// localStorage key, never inside ale.v1 — essay prose is easily tens of KB
// and must never bloat the progress snapshot that syncs between devices.
const DRAFT_KEY = 'ale.essay.v1';
const COUNT = 8;
const ANSWER_COUNT = 6;

function loadDraft(storage) {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object' || !d.paper || typeof d.answers !== 'object') return null;
    return d;
  } catch {
    return null;
  }
}
function saveDraft(storage, draft) {
  try { storage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* best effort */ }
}
function clearDraft(storage) {
  try { storage.removeItem(DRAFT_KEY); } catch { /* best effort */ }
}

// A mini-definitions question answer is { items: [s0, s1, s2] }; any other
// question's answer is a plain string. "Answered" only needs SOME progress —
// self-marking below is what actually cares which parts got written.
function isAnswered(q, ans) {
  if (!ans) return false;
  if (q.items) return Array.isArray(ans.items) && ans.items.some((s) => String(s ?? '').trim());
  return !!String(ans ?? '').trim();
}
function answeredCount(paper, answers) {
  return paper.questions.filter((q) => isAnswered(q, answers[q.id])).length;
}

// Flattens a question's checkable points into one ordered list — a normal
// question's own keyPoints, or (for the mini-definitions question) all three
// items' keyPoints back to back, each tagged with which item it belongs to
// so the self-marking screen can still group them under separate headings.
function flatKeyPoints(q) {
  if (!q.items) return q.keyPoints.map((text) => ({ text, itemIndex: null }));
  const out = [];
  q.items.forEach((item, itemIndex) => {
    for (const text of item.keyPoints) out.push({ text, itemIndex });
  });
  return out;
}

function questionScore(q, tickSet) {
  const flat = flatKeyPoints(q);
  return scoreQuestion(tickSet ? tickSet.size : 0, flat.length);
}

export async function render(el, ctx) {
  const { courseId } = ctx.params;
  const bank = await ctx.getEssayBank(courseId);

  if (!bank) {
    el.innerHTML = `
      ${pageHeader({ title: '📝 Εξέταση εκθέσεων', back: `#/course/${courseId}` })}
      <div class="card"><p class="muted">Δεν υπάρχει ακόμη τράπεζα θεμάτων έκθεσης για αυτό το μάθημα.</p>
      <a class="btn" href="#/course/${courseId}">Πίσω</a></div>`;
    return;
  }
  const bankErr = validateEssayBank(bank);
  if (bankErr) {
    el.innerHTML = `
      ${pageHeader({ title: '📝 Εξέταση εκθέσεων', back: `#/course/${courseId}` })}
      <div class="card"><h2>Σφάλμα</h2><p>${escapeHtml(bankErr)}</p>
      <a class="btn" href="#/course/${courseId}">Πίσω</a></div>`;
    return;
  }

  // Topic titles label the follow-up links on the result screen; a bare
  // "θέμα" pill repeated per topicId told the user nothing about where to go.
  const topicTitles = new Map();
  try {
    const content = await ctx.getContent(courseId);
    for (const ch of content.chapters) for (const t of ch.topics) topicTitles.set(t.id, t.title);
  } catch { /* links fall back to the generic label */ }

  const storedDraft = loadDraft(window.localStorage);
  const hasDraft = !!(storedDraft && storedDraft.courseId === courseId && storedDraft.paper?.questions?.length);

  let paper = null;
  let answers = {};
  let startedAt = 0;
  let i = 0;
  const ticks = {}; // questionId -> Set<flat keyPoint index>

  function persist(extra = {}) {
    saveDraft(window.localStorage, { courseId, paper, answers, startedAt, i, ...extra });
  }

  // --- stopwatch: we don't know the real paper's duration, so this counts
  // up, never down. Runs for the whole view lifetime; it simply no-ops on
  // any screen without a #stopwatch element. Cleared via ctx.onCleanup —
  // js/views/exam.js already fixed this exact timer-leak class of bug once.
  let timerId = null;
  function tick() {
    const t = document.getElementById('stopwatch');
    if (!t || !startedAt) return;
    const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    t.textContent = `${mm}:${ss}`;
  }
  timerId = setInterval(tick, 500);
  ctx.onCleanup(() => clearInterval(timerId));

  function showIntro() {
    el.innerHTML = `
      ${pageHeader({ title: '📝 Εξέταση εκθέσεων', back: `#/course/${courseId}` })}
      <div class="card" style="text-align:center">
        <p>Το πραγματικό θέμα έχει 8 ερωτήσεις έκθεσης, από τις οποίες απαντάς τις 6.
        Καμία βοήθεια ανά ερώτηση — μόνο η δική σου γραπτή απάντηση, όπως στην πραγματική εξέταση.</p>
        ${hasDraft ? `
          <button class="btn btn-gold btn-block" id="continue">Συνέχεια δοκιμίου σε εξέλιξη</button>
          <button class="btn btn-ghost btn-block" id="newpaper">Νέο δοκίμιο</button>
        ` : '<button class="btn btn-gold btn-block" id="start">Έναρξη</button>'}
        <a class="btn btn-ghost btn-block" href="#/course/${courseId}">Άκυρο</a>
      </div>`;
    document.getElementById('start')?.addEventListener('click', startNew);
    document.getElementById('continue')?.addEventListener('click', resume);
    document.getElementById('newpaper')?.addEventListener('click', () => { clearDraft(window.localStorage); startNew(); });
  }

  function startNew() {
    paper = buildPaper(bank, { count: COUNT, answerCount: ANSWER_COUNT });
    answers = {};
    for (const q of paper.questions) answers[q.id] = q.items ? { items: ['', '', ''] } : '';
    startedAt = Date.now();
    i = 0;
    persist();
    showAnswering();
  }

  function resume() {
    paper = storedDraft.paper;
    answers = storedDraft.answers;
    startedAt = storedDraft.startedAt || Date.now();
    i = Math.min(Math.max(0, storedDraft.i || 0), paper.questions.length - 1);
    showAnswering();
  }

  function updateAnsweringChrome() {
    const n = answeredCount(paper, answers);
    const counter = document.getElementById('answeredcount');
    if (counter) counter.textContent = `Απαντημένα: ${n}/${paper.answerCount}`;
    const submit = document.getElementById('submit');
    if (submit) submit.disabled = n < 1;
  }

  function showAnswering() {
    const q = paper.questions[i];
    const n = answeredCount(paper, answers);
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <span class="grow muted">Ερώτηση ${i + 1}/${paper.questions.length}</span>
        <span class="timer" id="stopwatch">00:00</span>
      </div>
      <div class="card">
        <div class="prose">${formatText(q.promptText)}</div>
        ${q.items ? q.items.map((item, idx) => `
          <label class="essay-itemlabel" for="ans-${idx}">${escapeHtml(item.term)}</label>
          <textarea class="essay-textarea" id="ans-${idx}" data-item="${idx}" rows="4"
            placeholder="Η απάντησή σου…">${escapeHtml(answers[q.id].items[idx] || '')}</textarea>`).join('')
          : `<textarea class="essay-textarea" id="ans" rows="10"
              placeholder="Η απάντησή σου…">${escapeHtml(answers[q.id] || '')}</textarea>`}
        <p class="muted" id="answeredcount" style="font-size:13px">Απαντημένα: ${n}/${paper.answerCount}</p>
        <div class="row">
          <button class="btn btn-ghost grow" id="prev" ${i === 0 ? 'disabled' : ''}>← Προηγούμενη</button>
          ${i + 1 < paper.questions.length ? '<button class="btn grow" id="nextq">Επόμενη →</button>' : ''}
        </div>
        <button class="btn btn-gold btn-block" id="submit" ${n < 1 ? 'disabled' : ''}>Παράδοση</button>
        <a class="btn btn-ghost btn-block" href="#/course/${courseId}">Διακοπή (το δοκίμιο μένει αποθηκευμένο)</a>
      </div>`;

    if (q.items) {
      el.querySelectorAll('.essay-textarea').forEach((ta) => {
        ta.addEventListener('input', () => {
          answers[q.id].items[Number(ta.dataset.item)] = ta.value;
          persist();
          updateAnsweringChrome();
        });
      });
    } else {
      document.getElementById('ans').addEventListener('input', (e) => {
        answers[q.id] = e.target.value;
        persist();
        updateAnsweringChrome();
      });
    }

    document.getElementById('prev')?.addEventListener('click', () => { if (i > 0) { i--; persist(); showAnswering(); } });
    document.getElementById('nextq')?.addEventListener('click', () => { i++; persist(); showAnswering(); });
    document.getElementById('submit').addEventListener('click', startMarking);
  }

  function startMarking() {
    for (const q of paper.questions) {
      if (isAnswered(q, answers[q.id]) && !ticks[q.id]) ticks[q.id] = new Set();
    }
    showMarking();
  }

  function renderUserAnswer(q, ans) {
    if (q.items) {
      return q.items.map((item, idx) => `
        <p style="margin-bottom:2px"><b>${escapeHtml(item.term)}</b></p>
        <div class="essay-useranswer">${escapeHtml(ans.items[idx] || '') || '<span class="muted">(χωρίς απάντηση)</span>'}</div>`).join('');
    }
    return `<div class="essay-useranswer">${escapeHtml(ans || '')}</div>`;
  }

  function renderChecklist(q, set) {
    const flat = flatKeyPoints(q);
    if (!q.items) {
      return `
        <h3>Τι κάλυψες;</h3>
        ${flat.map((kp, idx) => `
          <label class="essay-kp"><input type="checkbox" data-kp="${idx}" ${set.has(idx) ? 'checked' : ''}>
          <span class="prose">${formatText(kp.text)}</span></label>`).join('')}
        <details><summary>Υπόδειγμα απάντησης</summary><div class="prose">${formatText(q.modelAnswer)}</div></details>`;
    }
    return q.items.map((item, itemIndex) => `
      <div class="essay-miniitem">
        <h3>${escapeHtml(item.term)}</h3>
        <p class="muted" style="font-size:13px">Τι κάλυψες;</p>
        ${flat.map((kp, idx) => ({ kp, idx })).filter((x) => x.kp.itemIndex === itemIndex).map(({ kp, idx }) => `
          <label class="essay-kp"><input type="checkbox" data-kp="${idx}" ${set.has(idx) ? 'checked' : ''}>
          <span class="prose">${formatText(kp.text)}</span></label>`).join('')}
        <details><summary>Υπόδειγμα απάντησης</summary><div class="prose">${formatText(item.modelAnswer)}</div></details>
      </div>`).join('');
  }

  function showMarking() {
    const answeredQs = paper.questions.filter((q) => isAnswered(q, answers[q.id]));
    el.innerHTML = `
      ${pageHeader({ title: 'Αυτοδιόρθωση', back: `#/course/${courseId}` })}
      <div class="card"><p class="muted">Σημείωσε ποια σημεία κάλυψες σε κάθε απάντησή σου, συγκρίνοντάς την με το υπόδειγμα, για μια ενδεικτική βαθμολογία.</p></div>
      ${answeredQs.map((q) => `
        <div class="card" data-qcard="${escapeHtml(q.id)}">
          <div class="row"><h2 class="grow">${escapeHtml(q.title)}</h2>
            <span class="pill pill-gold" id="score-${escapeHtml(q.id)}">${questionScore(q, ticks[q.id])}%</span></div>
          <div class="prose">${formatText(q.promptText)}</div>
          <h3>Η απάντησή σου</h3>
          ${renderUserAnswer(q, answers[q.id])}
          ${renderChecklist(q, ticks[q.id])}
        </div>`).join('')}
      <div class="card" style="text-align:center">
        <button class="btn btn-gold btn-block" id="finishbtn">Ολοκλήρωση</button>
      </div>`;

    el.querySelectorAll('input[type="checkbox"][data-kp]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const qid = cb.closest('[data-qcard]').dataset.qcard;
        const idx = Number(cb.dataset.kp);
        const set = ticks[qid];
        if (cb.checked) set.add(idx); else set.delete(idx);
        const q = paper.questions.find((x) => x.id === qid);
        const badge = document.getElementById(`score-${qid}`);
        if (badge) badge.textContent = `${questionScore(q, set)}%`;
      });
    });
    document.getElementById('finishbtn').addEventListener('click', finish);
  }

  function finish() {
    clearInterval(timerId);
    const answeredQs = paper.questions.filter((q) => isAnswered(q, answers[q.id]));
    const perQuestion = answeredQs.map((q) => ({
      id: q.id, title: q.title, score: questionScore(q, ticks[q.id]), topicIds: questionTopicIds(q),
    }));
    const { pct, attemptedPct, answered, counted } = scorePaper(perQuestion.map((p) => p.score), paper.answerCount);

    const nowIso = new Date().toISOString();
    const timeSeconds = Math.round((Date.now() - startedAt) / 1000);
    let xpEarned = 0;
    let correctCount = 0;
    for (const p of perQuestion) {
      const correct = p.score >= 70;
      if (correct) { correctCount++; xpEarned += XP.hard; }
      for (const topicId of p.topicIds) {
        const before = ctx.state.topics[topicId] || newTopicProgress();
        ctx.state.topics[topicId] = recordAnswer(before, { correct, questionDifficulty: 'hard', now: nowIso });
      }
    }
    ctx.state.stats = recordSession(ctx.state.stats, { now: nowIso, xp: xpEarned, timeSeconds });
    const masteredTopics = Object.values(ctx.state.topics).filter((t) => t.mastery >= 80).length;
    ctx.state.stats = evaluateBadges(ctx.state.stats, { masteredTopics }, nowIso);
    ctx.state.sessions.push({
      date: nowIso, mode: 'essay_exam', courseId, total: answered, correct: correctCount, timeSeconds, xp: xpEarned,
    });
    ctx.state.sessions = ctx.state.sessions.slice(-50);
    ctx.save();

    clearDraft(window.localStorage);
    showResult({ pct, attemptedPct, answered, counted, perQuestion, timeSeconds });
  }

  // pct is the headline: it scores the whole paper (an unanswered slot among
  // the best answerCount counts as zero), so it's the one number that must
  // never be overstated by a partial attempt. attemptedPct — the average
  // quality of only what was actually written — is real information for a
  // deliberate few-question practice run, but is shown strictly smaller and
  // second, never with equal or greater weight than pct.
  function showResult({ pct, attemptedPct, answered, counted, perQuestion, timeSeconds }) {
    // Only genuinely weak answers belong here. Taking the bottom two
    // unconditionally listed a 100%-scored answer under «Πιο αδύναμες
    // ερωτήσεις» whenever fewer than three questions were attempted.
    const WEAK_BELOW = 70;
    const weakest = [...perQuestion]
      .filter((p) => p.score < WEAK_BELOW)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2);
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>${pct >= 70 ? '🎉 Καλή δουλειά!' : '📚 Θέλει δουλειά ακόμη'}</h2>
        <div class="stat-row">
          <div class="stat"><b>${pct}%</b><span>Βαθμολογία δοκιμίου</span></div>
          <div class="stat"><b>${answered}</b><span>Απαντημένες</span></div>
          <div class="stat"><b>${Math.round(timeSeconds / 60)}′</b><span>Χρόνος</span></div>
        </div>
        ${answered
          ? `<p class="muted" style="font-size:13px;margin-top:8px">Μέση ποιότητα απαντήσεων: ${attemptedPct}% (${counted} από ${paper.answerCount} θεμάτων)</p>`
          : ''}
      </div>
      <div class="card">
        <h2>Ανά ερώτηση</h2>
        ${perQuestion.map((p) => `
          <div class="list-item"><span class="grow">${escapeHtml(p.title)}</span>
            <span class="pill ${p.score >= 70 ? 'pill-ok' : p.score < 40 ? 'pill-bad' : ''}">${p.score}%</span></div>`).join('')}
      </div>
      ${weakest.length ? `<div class="card">
        <h2>Πιο αδύναμες ερωτήσεις</h2>
        ${weakest.map((p) => `
          <div class="list-item"><span class="grow">${escapeHtml(p.title)} — ${p.score}%</span>
            ${p.topicIds.map((tid) => `<a class="pill" href="#/topic/${courseId}/${tid}">${escapeHtml(topicTitles.get(tid) || 'θέμα')}</a>`).join('')}</div>`).join('')}
      </div>` : ''}
      <a class="btn btn-gold btn-block" href="#/essay/${courseId}">Νέο δοκίμιο</a>
      <a class="btn btn-ghost btn-block" href="#/">Αρχική</a>`;
  }

  showIntro();
}
