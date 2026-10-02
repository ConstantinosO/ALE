// Blank-page recall: the candidate writes what they remember for a bank
// question, and each rubric point is checked against what they wrote. Pure and
// DOM-free — js/views/recall.js drives the UI.
//
// The match is a deliberately simple word-overlap heuristic, and the view
// says so: every verdict is a pre-ticked checkbox the candidate confirms or
// overrides. It errs towards "μερικώς" rather than claiming a hit it cannot
// see, because a false "you covered this" is the expensive mistake the night
// before an exam.

// Greek function words (accent-stripped) plus a few English ones. Anything
// shorter than three letters is dropped anyway.
const STOP = new Set(`και του της των την τον τις τους στο στη στην στον στα στις στους για απο
  που ενα ενας μια μιας ειναι οτι οταν ενω αλλα πως καθε μεσω οπως ωστε προς μετα πριν χωρις
  αναλογα συνηθως επισης οποιο οποια οποιος οποιας οποιου οποιων αυτο αυτη αυτα αυτες αυτων αυτου
  αυτος ειτε ουτε δεν μην εχει εχουν εχει γινεται γινονται πρεπει μπορει μπορουν μονο πολυ ολα
  ολες ολοι οσο οσα κατα υπερ ακομη ακομα ηδη μεσα εκει εδω τοτε πανω κατω οχι ναι επι δια
  the and for with from that this are was`.split(/\s+/).filter(Boolean));

export function normalize(s) {
  return String(s ?? '')
    .replace(/\*\*|__/g, ' ')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ς/g, 'σ')
    .replace(/[^a-zα-ω0-9]+/g, ' ')
    .trim();
}

// Crude stemming: Greek inflects heavily (ασφάλιση / ασφαλισμένος /
// ασφαλιστικός), so a word is reduced to its first five letters. Short
// words — acronyms like ΑΠΑ, KID, KYC — are kept whole.
const stem = (w) => (w.length > 5 ? w.slice(0, 5) : w);

export function stems(s) {
  const out = new Set();
  for (const w of normalize(s).split(' ')) {
    if (w.length >= 3 && !STOP_N.has(w)) out.add(stem(w));
  }
  return out;
}

// The stop list is written naturally (with ς and accents); normalised here, the
// same way as the text, or a word ending in final sigma ("τους" -> "τουσ")
// slips past it and gets counted as evidence.
const STOP_N = new Set([...STOP].map((w) => normalize(w)));

export const HIT = 0.5;
export const PARTIAL = 0.25;

// Score each rubric point against the candidate's text.
//
// A stem's weight is 1 / (how many of this question's points contain it): a
// word every point shares ("ασφάλιση" in an insurance answer) says nothing
// about which point was covered, while a word only one point has is exactly
// the evidence that point was covered. Words from the question itself are
// cut to a quarter — restating the question is not answering it.
export function scorePoints(keyPoints, text, promptText = '') {
  const pts = (keyPoints || []).map((k) => stems(k));
  const df = new Map();
  for (const set of pts) for (const s of set) df.set(s, (df.get(s) || 0) + 1);
  const prompt = stems(promptText);
  const have = stems(text);
  return pts.map((set, i) => {
    let total = 0;
    let got = 0;
    for (const s of set) {
      const w = (1 / df.get(s)) * (prompt.has(s) ? 0.25 : 1);
      total += w;
      if (have.has(s)) got += w;
    }
    const ratio = total ? got / total : 0;
    let status = ratio >= HIT ? 'hit' : ratio >= PARTIAL ? 'partial' : 'miss';
    // Naming a point is not explaining it, but it is not nothing either. Most
    // rubric points read «Heading: explanation»; writing «άνθρωπος κλειδί»
    // against a long «Αναπλήρωση του ανθρώπου-κλειδί: η απώλειά του…» point
    // scored a flat miss. If the heading's own words are there, the point is
    // at least partial — never a hit, which still needs the explanation.
    // Heading words are weighted like everything else (1/df), so a prefix that
    // several sibling points share cannot carry it on its own — the word that
    // tells the siblings apart has to be there too.
    if (status === 'miss') {
      const head = headOf(keyPoints[i]);
      const hs = head ? [...stems(head)].filter((s) => !prompt.has(s) && df.has(s)) : [];
      const hw = hs.reduce((a, s) => a + 1 / df.get(s), 0);
      const hg = hs.filter((s) => have.has(s)).reduce((a, s) => a + 1 / df.get(s), 0);
      if (hw && hg / hw > 0.5) status = 'partial';
    }
    return { index: i, point: keyPoints[i], ratio, status };
  });
}

// The label a rubric point opens with, when it is a real label (shorter than
// the point, not a sentence). The colon wins over a dash: in «Εξαγορά
// συνεταιρικού μεριδίου — **Φερεγγυότητα**: …» the label is everything up to
// the colon, sub-label included. Cutting at the dash made all three
// partnership points "partial" for anyone who merely wrote «εξαγορά μεριδίου».
function headOf(point) {
  const s = String(point ?? '');
  const m = s.match(/^(.{3,110}?)\s*:\s/) || s.match(/^(.{3,70}?)\s+(?:—|–)\s/);
  return m && m[1].length < s.length - 10 ? m[1] : '';
}

// Everything the bank holds that can be recalled: the essay questions (minus
// e-minidefs, whose keyPoints are how-to-answer advice, not a rubric) and
// each mini-definition on its own.
export function recallItems(bank) {
  const entries = (bank?.entries || [])
    .filter((e) => e && e.slot !== 8 && (e.keyPoints || []).length)
    .map((e) => ({
      id: e.id, kind: 'essay', title: e.title,
      prompts: (e.prompts || []).map((p) => p.text).filter(Boolean),
      keyPoints: e.keyPoints, modelAnswer: e.modelAnswer || '',
      weight: Number(e.frequency) || 0,
    }));
  const minis = (bank?.miniDefinitions || [])
    .filter((m) => m && (m.keyPoints || []).length)
    .map((m) => ({
      id: m.id, kind: 'mini', title: m.term,
      prompts: [`Περιγράψετε σε συντομία: ${m.term}`],
      keyPoints: m.keyPoints, modelAnswer: m.modelAnswer || '',
      weight: Number(m.times) || 0,
    }));
  return [...entries, ...minis];
}

// Random pick weighted by how often the item appears in real papers, with a
// floor of 1 so a never-seen item is still reachable.
export function pickItem(items, rand = Math.random) {
  if (!items.length) return null;
  const w = items.map((it) => Math.max(1, it.weight));
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) { if (r < w[i]) return items[i]; r -= w[i]; }
  return items[items.length - 1];
}
