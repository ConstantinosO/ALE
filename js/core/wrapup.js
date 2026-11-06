// End-of-session wrap-up: one line of solid / shaky / blank topics and one
// concrete "next time". Shared by the quiz, the timed exam and chapter tests,
// which all keep a per-topic { correct, total } tally of the session.
import { escapeHtml } from '../ui.js';

// rows: [{ topicId, title, correct, total }] — one per topic seen this session.
export function summarize(rows) {
  const list = (rows || []).filter((r) => r && r.total > 0);
  const kind = (r) => (r.correct === r.total ? 'solid' : r.correct === 0 ? 'blank' : 'shaky');
  const counts = { solid: 0, shaky: 0, blank: 0 };
  for (const r of list) counts[kind(r)]++;
  // Next time: the weakest topic — lowest share right, more questions breaking ties.
  const next = list
    .filter((r) => kind(r) !== 'solid')
    .sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total)[0] || null;
  return { ...counts, next };
}

export function wrapUpHtml(rows, courseId) {
  const { solid, shaky, blank, next } = summarize(rows);
  if (!solid && !shaky && !blank) return '';
  return `<div class="wrapup">
      <p class="wrapup-line">✅ ${solid} σίγουρα · 🟡 ${shaky} αβέβαια · ⬜ ${blank} κενό</p>
      <p class="muted" style="margin:4px 0 0">Επόμενη φορά: ${next
        ? `<a href="#/topic/${escapeHtml(courseId)}/${escapeHtml(next.topicId)}">${escapeHtml(next.title)}</a>`
        : 'όλα σίγουρα — προχώρα σε κάτι καινούργιο.'}</p>
    </div>`;
}

// Turn a session's answered questions into per-topic rows.
export function tally(answers) {
  const by = new Map();
  for (const { topicId, topicTitle, correct } of answers) {
    const r = by.get(topicId) || { topicId, title: topicTitle, correct: 0, total: 0 };
    r.total++;
    if (correct) r.correct++;
    by.set(topicId, r);
  }
  return [...by.values()];
}
