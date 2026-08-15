export function validateSnapshot(o) {
  if (!o || typeof o !== 'object') return { ok: false, error: 'Μη έγκυρο αρχείο.' };
  if (o.version !== 1) return { ok: false, error: 'Μη υποστηριζόμενη έκδοση αρχείου.' };
  if (!o.topics || typeof o.topics !== 'object') return { ok: false, error: 'Λείπουν τα δεδομένα προόδου.' };
  if (!o.stats || typeof o.stats !== 'object') return { ok: false, error: 'Λείπουν τα στατιστικά.' };
  return { ok: true };
}

export function mergeState(local, imported) {
  const topics = { ...local.topics };
  for (const [id, imp] of Object.entries(imported.topics)) {
    const loc = topics[id];
    if (!loc) { topics[id] = imp; continue; }
    const locT = loc.lastStudied ? Date.parse(loc.lastStudied) : 0;
    const impT = imp.lastStudied ? Date.parse(imp.lastStudied) : 0;
    topics[id] = impT > locT ? imp : loc;
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
    settings: { ...imported.settings, ...local.settings },
  };
}
