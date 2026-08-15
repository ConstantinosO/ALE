import { newStats } from './stats.js';

const KEY = 'ale.v1';

export function freshState() {
  return {
    version: 1,
    topics: {},
    stats: newStats(),
    sessions: [],
    settings: { examDate: null, excludedChapters: {} },
  };
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.topics !== 'object') return freshState();
    const base = freshState();
    return {
      ...base, ...parsed,
      stats: { ...base.stats, ...parsed.stats },
      settings: { ...base.settings, ...parsed.settings },
    };
  } catch {
    return freshState();
  }
}

export function saveState(state, storage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
