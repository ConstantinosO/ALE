import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, stems, scorePoints, recallItems, pickItem, HIT } from '../js/core/recall.js';

test('normalize strips accents, markers, punctuation and final sigma', () => {
  assert.equal(normalize('**Ασφαλιστικός** όρος, __ΑΠΑ__!'), 'ασφαλιστικοσ οροσ απα');
});

test('stems drop stop-words — including ones ending in final sigma', () => {
  // "τους" normalises to "τουσ"; the stop list must be normalised the same way.
  assert.deepEqual([...stems('τους βασικούς όρους της ασφάλισης')], ['βασικ', 'ορουσ', 'ασφαλ']);
});

test('stems keep short acronyms whole and cut long words to five letters', () => {
  assert.deepEqual([...stems('ΑΠΑ KID ασφαλισμένος')], ['απα', 'kid', 'ασφαλ']);
});

test('a point is a hit when its distinctive words are present', () => {
  const kps = ['Η ΑΠΑ αναλαμβάνει τα ασφάλιστρα σε ανικανότητα', 'Η Εκχώρηση μεταβιβάζει τα δικαιώματα'];
  const [a, b] = scorePoints(kps, 'σε ανικανότητα η εταιρεία αναλαμβάνει τα ασφάλιστρα μέσω ΑΠΑ');
  assert.equal(a.status, 'hit');
  assert.equal(b.status, 'miss');
});

test('restating the question earns nothing', () => {
  const q = 'Περιγράψετε τις ανάγκες που καλύπτονται από την ασφάλιση Ζωής';
  const r = scorePoints(['Προστασία υποθήκης', 'Χρήματα για εκπαίδευση'], q, q);
  assert.ok(r.every((x) => x.status === 'miss'));
});

test('empty text, empty points and junk input never throw or go non-finite', () => {
  assert.deepEqual(scorePoints([], 'κάτι'), []);
  const [r] = scorePoints(['   '], '');
  assert.equal(r.ratio, 0);
  for (const x of scorePoints(['Προστασία υποθήκης'], null, undefined)) assert.ok(Number.isFinite(x.ratio));
});

test('pickItem weights by frequency but can reach a zero-frequency item', () => {
  const items = [{ id: 'a', weight: 9 }, { id: 'b', weight: 0 }];
  const seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(pickItem(items, () => i / 100).id);
  assert.deepEqual([...seen].sort(), ['a', 'b']);
  assert.equal(pickItem([], Math.random), null);
});

// Measured on the shipped bank, so a bank edit or a matcher change that
// degrades the marking fails here rather than in the exam hall: a full model
// answer must cover nearly everything, a wrong question's answer almost
// nothing, and restating the question nothing at all.
test('on the shipped bank the matcher separates right from wrong answers', () => {
  const items = recallItems(JSON.parse(readFileSync('data/klados-zois/essay-bank.json', 'utf8')));
  assert.ok(items.length >= 20, 'expected the essay questions and the mini-definitions');
  assert.ok(!items.some((it) => it.id === 'e-minidefs'), 'e-minidefs holds advice, not a rubric');
  const share = (it, text) => scorePoints(it.keyPoints, text, it.prompts[0])
    .filter((r) => r.ratio >= HIT).length / it.keyPoints.length;
  const mean = (f) => items.reduce((a, it, i) => a + f(it, i), 0) / items.length;
  assert.ok(mean((it) => share(it, it.modelAnswer)) >= 0.9, 'model answers should score ≥90%');
  assert.ok(mean((it, i) => share(it, items[(i + 5) % items.length].modelAnswer)) <= 0.15, 'wrong answers ≤15%');
  assert.equal(mean((it) => share(it, it.prompts[0])), 0, 'restating the question scores 0');
});

test('naming a point\'s heading earns "partial" — never a hit', () => {
  const kp = ['Αναπλήρωση του «ανθρώπου-κλειδί»: η απώλειά του δημιουργεί οικονομικά και εργασιακά προβλήματα, οπότε η επιχείρηση προνοεί για την αντικατάστασή του σε θάνατο ή ολική ανικανότητα'];
  assert.equal(scorePoints(kp, 'άνθρωπος κλειδί')[0].status, 'partial');
  assert.equal(scorePoints(kp, 'κάτι εντελώς άσχετο για ομόλογα')[0].status, 'miss');
});

test('a sub-labelled point needs its sub-label named, not just the shared prefix', () => {
  // The three partnership points as they sit together in e-anagkes: they share
  // the «Εξαγορά συνεταιρικού μεριδίου —» prefix, which therefore says nothing
  // about WHICH of the three was covered.
  const kps = [
    'Εξαγορά συνεταιρικού μεριδίου — **Φερεγγυότητα**: οι τράπεζες χορηγούν ευκολότερα δάνεια, αφού εξασφαλίζονται από την ασφάλιση',
    'Εξαγορά συνεταιρικού μεριδίου — **Διακανονισμός υποχρεώσεων**: η εταιρεία λειτουργεί ομαλά, προσλαμβάνει άμεσα αντικαταστάτη',
    'Εξαγορά συνεταιρικού μεριδίου — **Έλεγχος της επιχείρησης**: οι κληρονόμοι του θανόντος συχνά δεν μπορούν να φανούν χρήσιμοι',
  ];
  const vague = scorePoints(kps, 'εξαγορά μεριδίου συνεταίρου');
  assert.ok(vague.every((r) => r.status === 'miss'), JSON.stringify(vague.map((r) => r.status)));
  const named = scorePoints(kps, 'εξαγορά συνεταιρικού μεριδίου: φερεγγυότητα');
  assert.deepEqual(named.map((r) => r.status), ['partial', 'miss', 'miss']);
});
