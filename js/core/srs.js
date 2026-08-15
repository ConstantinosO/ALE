export const INTERVALS = [1, 3, 7, 10, 14, 19];

export function nextIntervalIndex(current, wasCorrect) {
  if (!wasCorrect) return 0;
  return Math.min(current + 1, INTERVALS.length - 1);
}

export function nextReviewDate(intervalIndex, fromIso) {
  const d = new Date(fromIso);
  d.setUTCDate(d.getUTCDate() + INTERVALS[intervalIndex]);
  return d.toISOString();
}

export function isDue(nextReviewIso, nowIso) {
  if (!nextReviewIso) return true;
  return Date.parse(nextReviewIso) <= Date.parse(nowIso);
}
