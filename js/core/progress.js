import { nextIntervalIndex, nextReviewDate } from './srs.js';

export const XP = { easy: 10, medium: 20, hard: 30 };
export const MASTERY_CAP = { easy: 50, medium: 80, hard: 100 };
const EMA_ALPHA = 0.2;

export function newTopicProgress() {
  return {
    mastery: 0, acc: 0, correct: 0, incorrect: 0,
    consecCorrect: 0, consecIncorrect: 0, difficulty: 'easy',
    intervalIndex: -1, nextReview: null, lastStudied: null,
    xp: 0, weak: false,
  };
}

export function recordAnswer(p, { correct, questionDifficulty, now }) {
  const n = { ...p };
  if (correct) { n.correct += 1; n.consecCorrect += 1; n.consecIncorrect = 0; }
  else { n.incorrect += 1; n.consecIncorrect += 1; n.consecCorrect = 0; }

  n.acc = +(n.acc * (1 - EMA_ALPHA) + (correct ? EMA_ALPHA : 0)).toFixed(4);

  if (n.consecCorrect >= 3 && n.difficulty !== 'hard') {
    n.difficulty = n.difficulty === 'easy' ? 'medium' : 'hard';
    n.consecCorrect = 0;
  }
  // intended: consecIncorrect is not reset on demotion, so a long wrong streak steps down one level per answer
  if (n.consecIncorrect >= 2 && n.difficulty !== 'easy') {
    n.difficulty = n.difficulty === 'hard' ? 'medium' : 'easy';
  }

  n.mastery = Math.round(n.acc * MASTERY_CAP[n.difficulty]);
  n.weak = n.consecIncorrect >= 2 || (n.correct + n.incorrect >= 5 && n.mastery < 40);

  if (correct) n.xp += XP[questionDifficulty] ?? 10;

  n.intervalIndex = nextIntervalIndex(n.intervalIndex, correct);
  n.nextReview = nextReviewDate(n.intervalIndex, now);
  n.lastStudied = new Date(now).toISOString();
  return n;
}
