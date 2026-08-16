import { newStats } from './stats.js';

const KEY = 'ale.v1';

export function freshState() {
  return {
    version: 1,
    topics: {},
    stats: newStats(),
    sessions: [],
    // collapsedGroups stays null (not []) until the user's first sidebar
    // group toggle: isGroupOpen/toggleGroup in js/shell.js treat "not an
    // array" as "never touched, use the active/passed default" and an array
    // as the user's explicit, fully-materialised choice — see the comments
    // there. Seeding [] here would silently mean "everything expanded".
    settings: { examDate: null, excludedChapters: {}, sidebarCollapsed: false, collapsedGroups: null },
  };
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.topics !== 'object' || parsed.topics === null || Array.isArray(parsed.topics)) return freshState();
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
