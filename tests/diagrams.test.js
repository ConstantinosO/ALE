import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramsFor } from '../js/core/diagrams.js';

const EXPECTED = { 'z2-4': 2, 'z3-3': 1, 'z9-4': 1, 'z11-3': 1, 'z12-1': 1, 'z12-3': 1 };
const all = () => Object.keys(EXPECTED).flatMap((id) => diagramsFor(id).map((d) => ({ id, ...d })));
const isTable = (d) => d.html.includes('<table');

test('each diagrammed topic gets exactly its diagrams, everything else none', () => {
  for (const [id, n] of Object.entries(EXPECTED)) assert.equal(diagramsFor(id).length, n, id);
  assert.deepEqual(diagramsFor('z1-1'), []);
  assert.deepEqual(diagramsFor('nope'), []);
});

test('every diagrammed topic still exists in the material', () => {
  const c = JSON.parse(readFileSync('data/klados-zois/content.json', 'utf8'));
  const ids = new Set(c.chapters.flatMap((ch) => ch.topics.map((t) => t.id)));
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
  for (const d of all()) {
    const text = d.html.replace(/<[^>]*>/g, ' ');
    assert.ok(!/\d/.test(text + d.caption + d.title), `${d.id} shows a number: ${text.trim().slice(0, 80)}`);
  }
});
