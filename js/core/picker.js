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

function weightFor(topic, analysis) {
  if (!analysis || !Array.isArray(analysis.topicFrequencies)) return 1;
  const hit = analysis.topicFrequencies.find(
    (f) => topic.title.includes(f.topic) || f.topic.includes(topic.title));
  return hit ? Math.max(1, Math.round(1 + hit.percentage / 10)) : 1;
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
