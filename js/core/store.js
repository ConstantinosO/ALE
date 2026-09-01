import { newStats } from './stats.js';

const KEY = 'ale.v1';

// Topics that were folded into another topic, mapped to their survivor.
// Progress lives in the user's browser, not the repo, so retiring an id in
// content.json would otherwise strand whatever study record sat under it —
// invisible on every screen, yet still counted by the `masteredTopics`
// badges, which tally Object.values(state.topics) rather than checking each
// id against the material.
export const RETIRED_TOPICS = { 'z5-2': 'z5-1', 'z6-2': 'z6-1' };

// Fold retired ids into their survivor. Where both have a record the more
// recently studied one wins outright rather than being averaged: the counters
// inside a record (correct/incorrect/acc/difficulty/SRS interval) only mean
// anything together, and summing across two different topics would produce a
// mastery figure that describes neither. This is the same last-writer rule
// mergeState already applies to one id across two devices.
export function migrateTopics(topics) {
  const out = {};
  for (const [id, p] of Object.entries(topics ?? {})) {
    if (id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
    const target = RETIRED_TOPICS[id] || id;
    const held = out[target];
    if (!held) { out[target] = p; continue; }
    const a = held.lastStudied ? Date.parse(held.lastStudied) : 0;
    const b = p.lastStudied ? Date.parse(p.lastStudied) : 0;
    if (b > a) out[target] = p;
  }
  return out;
}

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
      topics: migrateTopics(parsed.topics),
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
