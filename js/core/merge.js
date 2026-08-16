export function validateSnapshot(o) {
  if (!o || typeof o !== 'object') return { ok: false, error: 'Μη έγκυρο αρχείο.' };
  if (o.version !== 1) return { ok: false, error: 'Μη υποστηριζόμενη έκδοση αρχείου.' };
  if (!o.topics || typeof o.topics !== 'object') return { ok: false, error: 'Λείπουν τα δεδομένα προόδου.' };
  if (!o.stats || typeof o.stats !== 'object') return { ok: false, error: 'Λείπουν τα στατιστικά.' };
  return { ok: true };
}

const NUMERIC_FIELDS = ['mastery', 'acc', 'correct', 'incorrect', 'consecCorrect', 'consecIncorrect', 'xp', 'intervalIndex'];
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

function sanitizeTopic(imp) {
  const out = {};
  for (const f of NUMERIC_FIELDS) out[f] = Number(imp[f]) || 0;
  out.difficulty = DIFFICULTIES.has(imp.difficulty) ? imp.difficulty : 'easy';
  out.nextReview = typeof imp.nextReview === 'string' ? imp.nextReview : null;
  out.lastStudied = typeof imp.lastStudied === 'string' ? imp.lastStudied : null;
  out.weak = !!imp.weak;
  return out;
}

export function mergeState(local, imported) {
  const topics = { ...local.topics };
  for (const [id, imp] of Object.entries(imported.topics)) {
    if (id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
    const loc = topics[id];
    if (!loc) { topics[id] = sanitizeTopic(imp); continue; }
    const locT = loc.lastStudied ? Date.parse(loc.lastStudied) : 0;
    const impT = imp.lastStudied ? Date.parse(imp.lastStudied) : 0;
    topics[id] = impT > locT ? sanitizeTopic(imp) : loc;
  }

  const badgeMap = new Map();
  for (const b of [...(imported.stats.badges || []), ...(local.stats.badges || [])]) badgeMap.set(b.id, b);

  const stats = {
    totalXp: Math.max(local.stats.totalXp || 0, imported.stats.totalXp || 0),
    currentStreak: Math.max(local.stats.currentStreak || 0, imported.stats.currentStreak || 0),
    longestStreak: Math.max(local.stats.longestStreak || 0, imported.stats.longestStreak || 0),
    lastStudyDate: [local.stats.lastStudyDate, imported.stats.lastStudyDate].filter(Boolean).sort().pop() || null,
    badges: [...badgeMap.values()],
    totalSessions: Math.max(local.stats.totalSessions || 0, imported.stats.totalSessions || 0),
    totalTimeSeconds: Math.max(local.stats.totalTimeSeconds || 0, imported.stats.totalTimeSeconds || 0),
  };

  return {
    ...local,
    topics,
    stats,
    // Spread local first so settings keys this function has never heard of
    // survive the merge. Rebuilding the object field-by-field silently
    // dropped every one of them (sidebarCollapsed, and whatever comes next):
    // Object.assign(ctx.state, merged) then installed a settings object with
    // the key missing and the preference reset itself. The two fields below
    // still get their own merge rules on top.
    settings: {
      ...local.settings,
      examDate: local.settings?.examDate ?? imported.settings?.examDate ?? null,
      excludedChapters: { ...(imported.settings?.excludedChapters || {}), ...(local.settings?.excludedChapters || {}) },
    },
  };
}
