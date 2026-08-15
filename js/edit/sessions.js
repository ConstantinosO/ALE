// js/edit/sessions.js
// Registry of currently-open edit sessions, so a view about to replace part
// of the DOM can ask first and then tear those sessions down.
//
// Deliberately DOM-agnostic: it only ever reads `bar.isConnected`, calls
// `root.contains(node)` and calls `session.discard()`. That keeps the two
// rules that actually caused bugs — lifetime and scope — testable without a
// browser. A session is `{ bar, regions, discard }`.

const open = new Set();

// A session whose toolbar has left the document died with the DOM that held
// it: an unguarded nav link, browser back, or app.js replacing the view.
// Nothing tells us when that happened, so drop such sessions lazily on every
// query. Without this `hasOpenEdit()` stays true for the rest of the page
// session and later guards prompt about an edit that no longer exists.
function living() {
  for (const s of [...open]) if (!s.bar?.isConnected) open.delete(s);
  return open;
}

export function registerSession(session) {
  open.add(session);
  return () => open.delete(session);
}

// In scope only if the subtree about to be replaced actually holds part of
// this session. The toolbar is inserted as a SIBLING of the edited region,
// so a root may contain the region but not the bar (a quiz explanation) or
// the bar but not the region — either means the session is about to die.
// `root` omitted means "every open session".
function inRoot(s, root) {
  if (!root) return true;
  return root.contains(s.bar) || (s.regions || []).some((r) => root.contains(r));
}

export function hasOpenEdit(root) {
  for (const s of living()) if (inRoot(s, root)) return true;
  return false;
}

export function discardOpenEdits(root) {
  for (const s of [...living()]) if (inRoot(s, root)) s.discard();
}

// Call from any handler about to replace edited content, passing the element
// whose contents it is about to rewrite. Returns false to mean "the user said
// no — do not navigate".
export function confirmLeaveEdit(root) {
  if (!hasOpenEdit(root)) return true;
  if (!globalThis.confirm?.('Έχεις ανοιχτή επεξεργασία. Να συνεχίσω και να την ακυρώσω;')) return false;
  discardOpenEdits(root);
  return true;
}
