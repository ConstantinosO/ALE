export function newStats() {
  return {
    totalXp: 0, currentStreak: 0, longestStreak: 0, lastStudyDate: null,
    badges: [], totalSessions: 0, totalTimeSeconds: 0,
  };
}

export function dateStr(dateLike) {
  const d = new Date(dateLike);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function recordSession(stats, { now, xp, timeSeconds }) {
  const s = { ...stats, badges: [...stats.badges] };
  const today = dateStr(now);
  if (s.lastStudyDate !== today) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    s.currentStreak = s.lastStudyDate === dateStr(y) ? s.currentStreak + 1 : 1;
    s.lastStudyDate = today;
  }
  s.longestStreak = Math.max(s.longestStreak, s.currentStreak);
  s.totalXp += xp;
  s.totalSessions += 1;
  s.totalTimeSeconds += timeSeconds;
  return s;
}

export const BADGES = [
  { id: 'prota-vimata', name: 'Πρώτα Βήματα', icon: '🎯', test: (s) => s.totalSessions >= 1 },
  { id: 'seri-7', name: 'Σερί 7 Ημερών', icon: '🔥', test: (s) => s.currentStreak >= 7 },
  { id: 'seri-14', name: 'Σερί 14 Ημερών', icon: '⚡', test: (s) => s.currentStreak >= 14 },
  { id: 'xp-1000', name: '1.000 XP', icon: '🏅', test: (s) => s.totalXp >= 1000 },
  { id: 'xp-5000', name: '5.000 XP', icon: '🏆', test: (s) => s.totalXp >= 5000 },
  { id: 'mastered-10', name: '10 Θέματα με Completion 80%', icon: '🎓', test: (s, x) => (x?.masteredTopics ?? 0) >= 10 },
];

export function evaluateBadges(stats, extras, now) {
  const s = { ...stats, badges: [...stats.badges] };
  for (const b of BADGES) {
    if (!s.badges.some((e) => e.id === b.id) && b.test(s, extras)) {
      s.badges.push({ id: b.id, name: b.name, icon: b.icon, earnedDate: dateStr(now) });
    }
  }
  return s;
}
