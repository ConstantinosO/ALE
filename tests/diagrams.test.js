import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramsFor } from '../js/core/diagrams.js';

const EXPECTED = { 'z2-4': 2, 'z3-3': 1, 'z9-4': 1, 'z11-3': 1, 'z12-1': 1, 'z12-3': 1, 'g2-1': 1, 'g5-1': 1, 'g6-5': 1 };
// The worked calculation is the one diagram that must show numbers: exactly
// the 2/2019 paper's cases, recomputed here.
const NUMBERS_OK = new Set(['g6-5']);
const all = () => Object.keys(EXPECTED).flatMap((id) => diagramsFor(id).map((d) => ({ id, ...d })));
const isTable = (d) => !d.html.startsWith('<svg'); // tables and the calc flow are HTML, not charts

test('each diagrammed topic gets exactly its diagrams, everything else none', () => {
  for (const [id, n] of Object.entries(EXPECTED)) assert.equal(diagramsFor(id).length, n, id);
  assert.deepEqual(diagramsFor('z1-1'), []);
  assert.deepEqual(diagramsFor('nope'), []);
});

test('every diagrammed topic still exists in the material', () => {
  const ids = new Set(['klados-zois', 'genikos-klados'].flatMap((cid) => JSON.parse(readFileSync(`data/${cid}/content.json`, 'utf8')).chapters.flatMap((ch) => ch.topics.map((t) => t.id))));
  for (const id of Object.keys(EXPECTED)) assert.ok(ids.has(id), `${id} missing from content`);
});

test('each chart is one well-formed, labelled svg', () => {
  for (const d of all().filter((x) => !isTable(x))) {
    assert.ok(d.title && d.caption, `${d.id} needs a title and caption`);
    assert.match(d.html, /^<svg [^>]*role="img"[^>]*aria-label="[^"]+"/);
    assert.equal((d.html.match(/<svg/g) || []).length, 1);
    assert.ok(d.html.endsWith('</svg>'));
    // No NaN/undefined leaking into coordinates from the curve maths.
    assert.ok(!/NaN|undefined|Infinity/.test(d.html), `${d.id} has a broken coordinate`);
  }
});

test('all text is escaped — a bare "&" breaks svg and html alike', () => {
  for (const d of all()) assert.ok(!/&(?!(amp|lt|gt|quot|#39);)/.test(d.html), `${d.id} has an unescaped &`);
});

// Slide 43, row for row. Pinning the two rows the PDF interleaved, so a
// "tidy-up" that swaps them to what seems more intuitive fails loudly.
test('the health comparison has every slide row, in slide column order', () => {
  const [d] = diagramsFor('z9-4');
  const rows = [...d.html.matchAll(/<tr class="cmp-k"><th [^>]*>([^<]+)<\/th><\/tr><tr><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)]
    .map((m) => m.slice(1));
  assert.equal(rows.length, 9);
  const row = (k) => rows.find((r) => r[0].startsWith(k));
  assert.deepEqual(row('Επιλογή καλύψεων').slice(1),
    ['Ευέλικτη επιλογή καλύψεων και εξαιρέσεων', 'Επιλογή από σταθερά προγράμματα']);
  assert.equal(row('Ασφάλιστρα')[1], 'Συνήθως χαμηλότερα');
  assert.equal(row('Ποιος')[2], 'Το άτομο');
});

// The slides gave no figures for these, and an invented value would be
// studied as fact — the same trap as the fabricated "17 μονάδες".
test('no diagram shows a number the slides did not give', () => {
  for (const d of all().filter((x) => !NUMBERS_OK.has(x.id))) {
    const text = d.html.replace(/<[^>]*>/g, ' ');
    assert.ok(!/\d/.test(text + d.caption + d.title), `${d.id} shows a number: ${text.trim().slice(0, 80)}`);
  }
});

test('the worked average-clause results are arithmetically right', () => {
  const [d] = diagramsFor('g6-5');
  const pay = (value, cover, loss, excess) => Math.min(1, cover / value) * loss - excess;
  assert.equal(pay(400000, 280000, 100000, 3000), 67000);
  assert.equal(pay(300000, 400000, 100000, 5000), 95000);
  assert.match(d.html, /€67\.000/);
  assert.match(d.html, /€95\.000/);
});
