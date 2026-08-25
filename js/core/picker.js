import { allTopics } from './content.js';
import { isDue } from './srs.js';
import { newTopicProgress } from './progress.js';

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function questionsFor(topic, prog, rand) {
  const all = topic.mcq || [];
  const match = shuffle(all.filter((q) => q.difficulty === prog.difficulty), rand);
  const rest = shuffle(all.filter((q) => q.difficulty !== prog.difficulty), rand);
  return [...match, ...rest];
}

export function pickQuizQuestions({ content, topics, mode, now, excludedChapterIds = [], count = 10, rand = Math.random }) {
  const prog = (id) => topics[id] || newTopicProgress();
  let ts = allTopics(content, excludedChapterIds).filter((t) => (t.mcq || []).length);
  if (mode === 'weak') ts = ts.filter((t) => prog(t.id).weak);
  if (mode === 'revision') ts = ts.filter((t) => isDue(prog(t.id).nextReview, now));
  if (mode === 'micro') {
    ts = [...ts].sort((a, b) =>
      Number(isDue(prog(b.id).nextReview, now)) - Number(isDue(prog(a.id).nextReview, now)));
  }
  const pools = ts.map((t) => ({ topic: t, pool: questionsFor(t, prog(t.id), rand) }));
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

// Frequency entries are keyed by chapter id. Title matching is kept only as a
// fallback for analyses written before chapterId existed: matching a
// chapter-level label ("Είδη Ασφαλίσεων Ζωής") against topic titles
// ("Ασφάλιση Πρόσκαιρης Διάρκειας (Term)") hit just 3 of 50 topics — and two of
// those were the chapters that appear LEAST in real papers, so the exam was
// weighted backwards.
// weight = max(1, round(pct)): the weight tracks the measured percentage
// almost directly, rather than compressing it. The old max(1, round(1 +
// pct/10)) collapsed every chapter from 5% to 14% onto the SAME weight (2),
// which is why a 20-question mock exam measured (simulation over 20000
// mock exams, js/core/picker.js's own pickExamQuestions, real
// data/klados-zois/{content,exam-analysis}.json):
//   chapter  real%  old draw%  new draw%
//   z-ch03    30%     25.5%      41.6%   (6 topics -- multi-topic chapters
//   z-ch01    14%      6.4%       9.8%    are inherently over-weighted by
//   z-ch11    12%      8.5%      11.1%    topic-count x per-topic weight,
//   z-ch12     8%      8.5%       7.4%    both before and after this fix --
//   z-ch07     7%      8.5%       6.5%    not something this change tries
//   z-ch08     7%      6.4%       4.9%    to solve; z-ch03 overshoots its
//   z-ch14     6%      8.5%       5.6%    real share either way)
//   z-ch02     5%      8.6%       4.7%
//   z-ch04     4%      3.2%       2.8%
//   z-ch05     4%      2.1%       1.9%
//   z-ch10     2%      3.2%       1.4%
//   z-ch06     1%      2.1%       0.5%
//   z-ch09     0%      4.2%       0.9%   <- 0-of-9-papers chapters, was 8.4%
//   z-ch13     0%      4.2%       0.9%      combined, now ~1.9% combined
// Kefalaio 1's real 14% no longer ties with a 5% chapter for the same
// weight, and kefalaia 9/13 (0/9 real papers) drop from an 8.4% combined
// mock-exam share to under 2% combined -- present (via the max(1, ...)
// floor) but no longer competing on equal footing with material that has
// actually been examined. A 0% chapter is not necessarily 0% forever, and
// the user can still study it deliberately via topic quizzes.
function weightFor(topic, analysis) {
  if (!analysis || !Array.isArray(analysis.topicFrequencies)) return 1;
  const byChapter = analysis.topicFrequencies.find(
    (f) => f && f.chapterId && f.chapterId === topic.chapterId);
  const hit = byChapter || analysis.topicFrequencies.find(
    (f) => f && typeof f.topic === 'string' && f.topic
      && (topic.title.includes(f.topic) || f.topic.includes(topic.title)));
  return hit ? Math.max(1, Math.round(Number(hit.percentage) || 0)) : 1;
}

export function pickExamQuestions({ content, analysis, excludedChapterIds = [], count = 20, rand = Math.random }) {
  const ts = allTopics(content, excludedChapterIds).filter((t) => (t.mcq || []).length);
  if (!ts.length) return [];
  const weighted = [];
  for (const t of ts) {
    for (let i = 0; i < weightFor(t, analysis); i++) weighted.push(t);
  }
  const picked = [];
  const used = new Set();
  let guard = 0;
  while (picked.length < count && guard < count * 20) {
    guard++;
    const t = weighted[Math.floor(rand() * weighted.length)];
    const nonEasy = t.mcq.filter((q) => q.difficulty !== 'easy' && !used.has(q));
    const pool = nonEasy.length ? nonEasy : t.mcq.filter((q) => !used.has(q));
    if (!pool.length) continue;
    const q = pool[Math.floor(rand() * pool.length)];
    used.add(q);
    picked.push({ topicId: t.id, topicTitle: t.title, q });
  }
  return picked;
}
