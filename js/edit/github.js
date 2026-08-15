// GitHub Contents API client. Every function takes an injectable fetchFn
// for tests. commitEdits NEVER pushes local memory wholesale — it applies
// field edits to the freshly fetched canonical copy, so edits from another
// device can't be clobbered.
import { getPath, setPath, findTopic } from './overlay.js';

const API = 'https://api.github.com/repos/ConstantinosO/ALE/contents/';

export function b64EncodeUtf8(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64DecodeUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// Matches the repo file: 2-space indent, no trailing newline.
export function serializeContent(json) {
  return JSON.stringify(json, null, 2);
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
}

export async function getFile(token, path, fetchFn = fetch) {
  const res = await fetchFn(API + path, { headers: headers(token), cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub GET ${res.status}`);
  const data = await res.json();
  return { sha: data.sha, json: JSON.parse(b64DecodeUtf8(data.content)) };
}

export async function putFile(token, path, json, sha, message, fetchFn = fetch) {
  const res = await fetchFn(API + path, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ message, sha, content: b64EncodeUtf8(serializeContent(json)) }),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${res.status}`);
  return res.json();
}

export async function commitEdits(token, courseId, edits, fetchFn = fetch) {
  const path = `data/${courseId}/content.json`;
  const attempt = async () => {
    const { sha, json } = await getFile(token, path, fetchFn);
    let applied = 0;
    for (const e of edits) {
      const topic = findTopic(json, e.topicId);
      if (topic && typeof getPath(topic, e.path) === 'string'
          && setPath(topic, e.path, e.text)) applied++;
    }
    if (!applied) return { ok: true, applied: 0 };
    const ids = [...new Set(edits.map((e) => e.topicId))].join(', ');
    const n = edits.length;
    const message = `edit: ${ids} (${n} ${n === 1 ? 'πεδίο' : 'πεδία'})`;
    await putFile(token, path, json, sha, message, fetchFn);
    return { ok: true, applied };
  };
  try {
    return await attempt();
  } catch (e) {
    if (!/PUT (409|422)/.test(e.message)) return { ok: false, error: e.message };
    try { return await attempt(); }
    catch (e2) { return { ok: false, error: e2.message }; }
  }
}
