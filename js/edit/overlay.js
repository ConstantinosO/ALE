// Local edits layer: instant/offline visibility of material edits, and the
// GitHub token. Lives under its OWN localStorage key so it can never leak
// into ale.v1 progress snapshots.
export const EDITS_KEY = 'ale.edits.v1';

const PATH_RE = /^(summary|keyDefinitions\.\d+\.definition|killerFacts\.\d+|commonTraps\.\d+|shortAnswers\.\d+\.(question|modelAnswer)|examQuestion\.(question|modelAnswer)|mcq\.\d+\.explanation|flashcards\.\d+\.back)$/;

export function validPath(path) { return PATH_RE.test(String(path ?? '')); }

export function loadEdits(storage) {
  try {
    const raw = storage.getItem(EDITS_KEY);
    if (!raw) return { token: '', edits: {} };
    const d = JSON.parse(raw);
    return {
      token: typeof d.token === 'string' ? d.token : '',
      edits: d.edits && typeof d.edits === 'object' && !Array.isArray(d.edits) ? d.edits : {},
    };
  } catch { return { token: '', edits: {} }; }
}

export function saveEdits(storage, data) {
  try { storage.setItem(EDITS_KEY, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function getPath(topic, path) {
  if (!validPath(path)) return undefined;
  let cur = topic;
  for (const seg of String(path).split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function setPath(topic, path, text) {
  if (!validPath(path)) return false;
  const segs = String(path).split('.');
  let cur = topic;
  for (const seg of segs.slice(0, -1)) {
    if (cur == null || typeof cur !== 'object') return false;
    cur = cur[seg];
  }
  const last = segs[segs.length - 1];
  if (cur == null || typeof cur !== 'object' || typeof cur[last] !== 'string') return false;
  cur[last] = String(text);
  return true;
}

export function findTopic(content, topicId) {
  for (const ch of content?.chapters || []) {
    for (const t of ch.topics || []) if (t.id === topicId) return t;
  }
  return null;
}

export function applyEdits(content, courseEdits) {
  for (const [topicId, fields] of Object.entries(courseEdits || {})) {
    const topic = findTopic(content, topicId);
    if (!topic) continue;
    for (const [path, entry] of Object.entries(fields)) {
      if (entry && typeof entry.text === 'string') setPath(topic, path, entry.text);
    }
  }
}

// Call BEFORE applyEdits, on freshly fetched content: entries whose text is
// already deployed (or whose topic no longer exists) are finished with.
export function pruneDeployed(content, courseEdits) {
  for (const [topicId, fields] of Object.entries(courseEdits || {})) {
    const topic = findTopic(content, topicId);
    for (const [path, entry] of Object.entries(fields)) {
      if (!topic || getPath(topic, path) === entry.text) delete fields[path];
    }
    if (!Object.keys(fields).length) delete courseEdits[topicId];
  }
}

export function pendingList(data, courseId) {
  const out = [];
  for (const [topicId, fields] of Object.entries(data.edits[courseId] || {})) {
    for (const [path, entry] of Object.entries(fields)) {
      if (!entry.committed) out.push({ topicId, path, text: entry.text });
    }
  }
  return out;
}

export function pendingCount(data, courseId, topicId) {
  let n = 0;
  const courses = courseId
    ? { [courseId]: data.edits[courseId] || {} }
    : data.edits;
  for (const courseEdits of Object.values(courses)) {
    for (const [tid, fields] of Object.entries(courseEdits || {})) {
      if (topicId && tid !== topicId) continue;
      n += Object.values(fields).filter((e) => !e.committed).length;
    }
  }
  return n;
}
