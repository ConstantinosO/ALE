# In-App Material Editing — Design

**Date:** 2026-08-16
**Status:** Approved pending user review

## Problem

The study material in `data/<courseId>/content.json` is plain prose rendered
through `escapeHtml()`. The user cannot format it (paragraphs, bold,
underline, numbering) or fix wording, and the only editing routes today
(hand-editing JSON, asking Claude, or nothing) don't fit how he works: he
wants to edit **visually, in the app, while studying**, on PC and iPad.

## Decision summary

- **WYSIWYG editing in place** (option A): tap ✏️ on a card, its text fields
  become `contenteditable`, a small toolbar offers Bold, Underline, numbered
  list, bullet list; Save/Cancel end the session.
- **Edits commit straight into GitHub**: the app rewrites
  `data/<courseId>/content.json` in the `ConstantinosO/ALE` repo via the
  GitHub Contents API using a fine-grained personal access token pasted once
  per device. There is only ever one version of the material.
- **Storage stays plain text with markers**, rendered through
  escape-then-format. The XSS guarantee (no raw HTML from content or
  snapshots reaches the DOM) is preserved unchanged.

## Marker format

Exactly four constructs; everything else is literal text:

| Marker | Rendering |
|---|---|
| blank line | paragraph break (`</p><p>`) |
| `**text**` | `<b>text</b>` |
| `__text__` | `<u>text</u>` |
| consecutive lines starting `1. ` `2. ` … | `<ol><li>…</li></ol>` |
| consecutive lines starting `- ` | `<ul><li>…</li></ul>` |

No headings, links, images, or nesting of lists. Bold/underline may appear
inside list items and may wrap each other.

**Round-trip invariant:** `serialize(renderToDom(formatText(s))) === s` for
any string `s` already in canonical marker form. Existing content contains no
markers and renders exactly as today (one paragraph).

## Components

### 1. `js/core/format.js` — `formatText(s)` (pure, tested)

Escape first (same rules as `escapeHtml`), then convert markers to HTML.
Returns an HTML string safe for `innerHTML`. Malformed markers (unclosed
`**`) render literally. `js/ui.js` keeps `escapeHtml` for titles, questions,
options, and every non-prose field.

**Applied at prose render sites:** topic summary, key definitions
(definition text), killer facts, common traps, short answers (question +
model answer), exam question (question + model answer), MCQ explanations in
feedback, flashcard backs. Titles, definition *terms*, MCQ question/option
text keep `escapeHtml`.

### 2. `js/edit/serialize.js` — `serializeEditor(node)` (pure, tested)

Walks a DOM-like tree (only `nodeType`, `nodeName`, `textContent`,
`childNodes` are used, so tests feed plain objects) and emits canonical
marker text. Recognises `B`/`STRONG` → `**`, `U` → `__`, `OL`/`UL`/`LI` →
list lines, `P`/`DIV`/`BR` → line breaks. **Everything else is unwrapped to
its text** — spans, styles, fonts, colors that iOS/desktop paste or
autocorrect inject are discarded. Collapses runs of 3+ newlines to one blank
line; trims trailing whitespace per line.

### 3. `js/edit/overlay.js` — local edits layer (pure logic, tested)

localStorage key **`ale.edits.v1`** (separate from `ale.v1`, therefore never
enters the sync snapshot by construction):

```json
{
  "token": "github_pat_…",
  "edits": {
    "klados-zois": {
      "z3-1": { "summary": { "text": "…", "committed": true },
                 "keyDefinitions.0.definition": { "text": "…", "committed": false } }
    }
  }
}
```

Field paths are dot-paths relative to the topic: `summary`,
`keyDefinitions.<i>.definition`, `killerFacts.<i>`, `commonTraps.<i>`,
`shortAnswers.<i>.question`, `shortAnswers.<i>.modelAnswer`,
`examQuestion.question`, `examQuestion.modelAnswer`, `mcq.<i>.explanation`,
`flashcards.<i>.back`.

Functions: `loadEdits()/saveEdits()`, `applyEdits(content, courseEdits)`
(returns content with overlay text written in), `setEdit`, and
`pruneDeployed(content, courseEdits)` — after a fresh network load, any entry
whose text already equals the fetched field is deleted (the deploy caught
up). `app.js#getContent` applies the overlay right after `loadContent` and
prunes.

### 4. `js/edit/github.js` — Contents API client (tested with stub fetch)

- `getFile(token, path)` → `GET /repos/ConstantinosO/ALE/contents/<path>` →
  `{ sha, json }` (base64-decoded, UTF-8). `content.json` is 832 KB — under
  the API's 1 MB inline limit; per-course files keep it bounded.
- `putFile(token, path, json, sha, message)` → `PUT` with 2-space
  `JSON.stringify` + trailing newline (matches the assemble script's output
  so diffs stay minimal), base64-encoded.
- `b64EncodeUtf8` / `b64DecodeUtf8` via `TextEncoder`/`TextDecoder` (plain
  `btoa` corrupts Greek — pinned by a Greek-text test).
- **Commit flow per save:** GET the canonical file → apply this save's field
  changes to the *fetched* copy (never pushes the whole local memory, so it
  can't clobber another device's edits) → PUT with the fetched sha. On
  409/422 sha conflict: refetch, reapply, retry once, then give up to
  pending. Commit message: `edit: <topicId> (<n> πεδία)`.

### 5. `js/edit/editor.js` — edit mode UI (DOM, manually verified)

- A ✏️ button on each prose card in the topic view, next to the MCQ
  explanation in quiz feedback (topic check and `quiz.js` only; chapter
  tests and mock exams stay clean), and on a flashcard's back once flipped
  in `flashcards.js`.
- Tapping ✏️ puts the card in edit mode: each editable field becomes its own
  `contenteditable` region (rendered from markers), a toolbar (B, U, 1., •)
  sticks above, Save/Cancel below. Bold/underline wrap the current selection;
  the list buttons toggle the current line(s).
- **Save:** serialize each changed field → `setEdit` (committed:false) →
  update the in-memory content cache → re-render → commit in background →
  mark committed:true on success.
- **Cancel:** discard, re-render.
- ✏️ buttons render only when a token is stored — without one the app is
  byte-for-byte today's behavior (safe to share with another student).

### 6. Settings (Ρυθμίσεις) — token section

Paste field, **Έλεγχος σύνδεσης** (GET the repo's `data/courses.json` with
the token; shows ✓/✗), **Αφαίρεση** button, and a count of pending
(uncommitted) edits with a **Δοκιμή ξανά** button that retries them.
README gains a short Greek guide: create a fine-grained PAT on github.com
scoped to **only the ALE repo**, permission **Contents: Read and write**,
expiry of the user's choice; paste it on each device once.

## Error handling

- **Commit fails** (offline, expired token, rate limit, unresolved
  conflict): the edit stays in the overlay as pending — visible immediately
  on that device, never lost. A small "εκκρεμεί ⟳" pill shows on the edited
  card; retry on next save, on app load, or via Settings.
- **Token invalid:** pencil actions surface "Μη έγκυρο token — έλεγξε στις
  Ρυθμίσεις" once; editing UI stays available offline (pending-only).
- **`validateContent` still guards loads**; an overlay is applied after
  validation and cannot change structure (text fields only, by construction
  of the path whitelist above — paths not matching the whitelist are
  ignored).

## Security & privacy

- Escape-then-format keeps the existing XSS posture; imported snapshots
  still cannot inject HTML (they don't carry content or edits at all).
- The token lives only in `ale.edits.v1` on each device, is excluded from
  the snapshot by key separation, and is scoped to one repo. The repo is
  public, so committed edits are publicly visible — same as the material
  itself.
- The path whitelist prevents an edit from writing outside prose fields
  (e.g. `correctIndex` can never be touched).

## Out of scope

- Editing MCQ question/option text (would desync `correctIndex`).
- Adding/removing topics, definitions, facts, questions.
- Editing from chapter tests or mock exams.
- Any backend or third-party service beyond GitHub itself.

## Testing

Node test runner, zero dependencies, same as the rest of the suite:

1. `format.test.js` — each marker, mixed content, lists with inline bold,
   malformed markers literal, `<script>` in content renders inert,
   no-marker text renders as today.
2. `serialize.test.js` — fake-node trees round-trip the canonical corpus;
   junk wrappers (span with style) are stripped; `formatText` →
   parsed-tree → `serializeEditor` identity on canonical strings. The test
   harness includes a minimal HTML→fake-node parser covering only the tag
   subset `formatText` emits (`p`, `b`, `u`, `ol`, `ul`, `li`) — feasible
   without dependencies because the output tag set is closed.
3. `overlay.test.js` — apply, prune-on-deploy, path whitelist ignores
   unknown paths, committed/pending transitions.
4. `github.test.js` — stub fetch: sha threading, conflict retry-once,
   Greek UTF-8 base64 round-trip, 2-space + trailing-newline serialization.

Manual (browser pane + real iPad): edit mode on PC and iOS Safari,
selection bolding, list toggling, offline save → pending → retry, second
device receives the edit after Pages redeploy.
