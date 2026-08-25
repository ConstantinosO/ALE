// Essay-mode mock exam: builds an 8-question paper from the recurring
// question bank (data/<course>/essay-bank.json) and scores the candidate's
// self-marking. Pure and DOM-free — js/views/essayexam.js drives the UI.

export function validateEssayBank(bank) {
  if (!bank || typeof bank !== 'object') return 'Μη έγκυρη τράπεζα θεμάτων.';
  if (typeof bank.courseId !== 'string' || !bank.courseId) return 'Η τράπεζα θεμάτων δεν έχει courseId.';
  if (!Array.isArray(bank.entries)) return 'Η τράπεζα θεμάτων δεν έχει έγκυρο πίνακα ερωτήσεων.';
  for (const e of bank.entries) {
    if (!e || typeof e.id !== 'string' || !e.id) return 'Μη έγκυρη ερώτηση χωρίς id στην τράπεζα θεμάτων.';
    if (typeof e.title !== 'string' || !e.title) return `Ερώτηση χωρίς τίτλο: ${e.id}`;
    if (!Array.isArray(e.prompts) || !e.prompts.length
      || e.prompts.some((p) => !p || typeof p.text !== 'string' || !p.text)) {
      return `Ερώτηση χωρίς έγκυρες εκφωνήσεις: ${e.id}`;
    }
    if (![0, 1, 8].includes(e.slot)) return `Μη έγκυρο slot στην ερώτηση: ${e.id}`;
  }
  if (!Array.isArray(bank.miniDefinitions)) return 'Η τράπεζα θεμάτων δεν έχει έγκυρο πίνακα ορισμών.';
  for (const m of bank.miniDefinitions) {
    if (!m || typeof m.id !== 'string' || !m.id) return 'Μη έγκυρος ορισμός χωρίς id στην τράπεζα θεμάτων.';
    if (typeof m.term !== 'string' || !m.term) return `Ορισμός χωρίς term: ${m.id}`;
  }
  return null;
}

// Weighted draw WITHOUT replacement: each round re-normalises over whatever
// is left, so removing the winner (splice) is both how duplicates are
// prevented and how the draw degrades gracefully — once the pool is empty
// the loop just stops short of k, rather than throwing or spinning.
function weightedDraw(pool, weightFn, k, rand) {
  const remaining = [...pool];
  const picked = [];
  for (let n = 0; n < k && remaining.length; n++) {
    const weights = remaining.map((e) => Math.max(1, Number(weightFn(e)) || 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    let idx = weights.length - 1; // falls through to the last entry if rounding leaves r >= total
    for (let i = 0; i < weights.length; i++) {
      if (r < weights[i]) { idx = i; break; }
      r -= weights[i];
    }
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picked;
}

function pickPromptText(entry, rand) {
  const prompts = Array.isArray(entry.prompts) && entry.prompts.length ? entry.prompts : [{ text: entry.title }];
  const idx = Math.min(prompts.length - 1, Math.floor(rand() * prompts.length));
  return prompts[idx].text;
}

function toQuestion(entry, rand) {
  return {
    id: entry.id,
    title: entry.title,
    promptText: pickPromptText(entry, rand),
    keyPoints: Array.isArray(entry.keyPoints) ? entry.keyPoints : [],
    modelAnswer: entry.modelAnswer || '',
    topicIds: Array.isArray(entry.topicIds) ? entry.topicIds : [],
    frequency: entry.frequency,
    trend: entry.trend,
  };
}

// Question 1 is always the slot-1 entry, the last question is always the
// slot-8 entry (dressed up with three mini-definitions), and everything in
// between is drawn from slot-0 entries weighted by frequency. The three
// pools never overlap (an entry has exactly one slot), so "no duplicates in
// one paper" falls out of the pool split for free — weightedDraw only has to
// guard against duplicates *within* a pool, which it does by drawing without
// replacement.
export function buildPaper(bank, { rand = Math.random, count = 8, answerCount = 6 } = {}) {
  const entries = Array.isArray(bank?.entries) ? bank.entries : [];
  const miniDefs = Array.isArray(bank?.miniDefinitions) ? bank.miniDefinitions : [];

  const slot1Pool = entries.filter((e) => e && e.slot === 1);
  const slot8Pool = entries.filter((e) => e && e.slot === 8);
  const slot0Pool = entries.filter((e) => e && e.slot === 0);

  const first = slot1Pool.length ? weightedDraw(slot1Pool, () => 1, 1, rand)[0] : null;
  const last = slot8Pool.length ? weightedDraw(slot8Pool, () => 1, 1, rand)[0] : null;

  const middleTarget = Math.max(0, count - (first ? 1 : 0) - (last ? 1 : 0));
  const middleEntries = weightedDraw(slot0Pool, (e) => e.frequency, middleTarget, rand);

  const questions = [];
  if (first) questions.push(toQuestion(first, rand));
  for (const e of middleEntries) questions.push(toQuestion(e, rand));
  if (last) {
    const q = toQuestion(last, rand);
    q.items = weightedDraw(miniDefs, (m) => m.times, 3, rand).map((m) => ({
      id: m.id,
      term: m.term,
      keyPoints: Array.isArray(m.keyPoints) ? m.keyPoints : [],
      modelAnswer: m.modelAnswer || '',
      topicIds: Array.isArray(m.topicIds) ? m.topicIds : [],
    }));
    questions.push(q);
  }
  return { questions, answerCount };
}

export function scoreQuestion(tickedCount, totalPoints) {
  if (!totalPoints || totalPoints <= 0) return 0;
  const pct = (Number(tickedCount) / Number(totalPoints)) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// The real marking only counts the candidate's best `answerCount` answers —
// over-answering (attempting more than the 6 the paper asks for) cannot hurt
// the score, it can only help by letting a weak answer be dropped. But
// answering FEWER than answerCount must not be rewarded the same way: a
// candidate who wrote two excellent answers has not earned 100% of the
// paper, he's earned two-sixths of it. pct therefore always divides by the
// full answerCount — an unanswered slot among the best `answerCount` counts
// as zero, exactly as the real marking would score a blank. attemptedPct is
// the separate, honest average over only what was actually attempted: real
// and useful for a deliberate few-question practice run, but never the
// number shown as "your score" (see js/views/essayexam.js's result screen).
export function scorePaper(perQuestion, answerCount = 6) {
  const scores = Array.isArray(perQuestion)
    ? perQuestion.filter((n) => typeof n === 'number' && Number.isFinite(n))
    : [];
  const sorted = [...scores].sort((a, b) => b - a);
  const safeAnswerCount = Number.isFinite(answerCount) && answerCount > 0 ? Math.floor(answerCount) : 0;
  const counted = Math.min(sorted.length, safeAnswerCount);
  const sum = sorted.slice(0, counted).reduce((a, b) => a + b, 0);
  const pct = safeAnswerCount ? Math.round(sum / safeAnswerCount) : 0;
  const attemptedPct = counted ? Math.round(sum / counted) : 0;
  return { pct, attemptedPct, answered: scores.length, counted };
}
