import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagramsFor } from '../js/core/diagrams.js';

const EXPECTED = { 'z2-4': 2, 'z11-3': 1, 'z12-1': 1 };

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

test('each diagram is one well-formed, labelled svg', () => {
  for (const id of Object.keys(EXPECTED)) {
    for (const d of diagramsFor(id)) {
      assert.ok(d.title && d.caption, `${id} needs a title and caption`);
      assert.match(d.svg, /^<svg [^>]*role="img"[^>]*aria-label="[^"]+"/);
      assert.equal((d.svg.match(/<svg/g) || []).length, 1);
      assert.ok(d.svg.endsWith('</svg>'));
      // No NaN/undefined leaking into coordinates from the curve maths.
      assert.ok(!/NaN|undefined|Infinity/.test(d.svg), `${id} has a broken coordinate`);
      // A bare "&" is invalid in SVG markup; all text is escaped.
      assert.ok(!/&(?!(amp|lt|gt|quot|#39);)/.test(d.svg), `${id} has an unescaped &`);
    }
  }
});

// The slides gave no figures for these charts, and an invented axis value
// would be studied as fact — the same trap as the fabricated "17 μονάδες".
test('no diagram text carries a number the slides did not give', () => {
  for (const id of Object.keys(EXPECTED)) {
    for (const d of diagramsFor(id)) {
      const text = [...d.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' ');
      assert.ok(!/\d/.test(text + d.caption + d.title), `${id} shows a number: ${text}`);
    }
  }
});
