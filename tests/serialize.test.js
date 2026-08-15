// tests/serialize.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeEditor } from '../js/edit/serialize.js';
import { formatText } from '../js/core/format.js';
import { parseHtml } from './helpers/fakedom.js';

const CANONICAL = [
  'Απλό κείμενο.',
  'Πρώτη παράγραφος.\n\nΔεύτερη **σημαντική** παράγραφος.',
  '__Υπογράμμιση__ και **έντονα**.',
  '1. Ένα\n2. Δύο **δυνατά**\n3. Τρία',
  '- πρώτο\n- δεύτερο',
  'Εισαγωγή:\n\n1. βήμα\n2. βήμα\n\nΚατακλείδα.',
  'γραμμή1\nγραμμή2',
  '**__διπλό__** τέλος.',
];

for (const s of CANONICAL) {
  test(`round-trip: ${JSON.stringify(s.slice(0, 30))}`, () => {
    assert.equal(serializeEditor(parseHtml(formatText(s))), s);
  });
}

test('junk wrappers (span/font) are unwrapped to text', () => {
  const root = parseHtml('<p><span style="color:red">κείμενο</span> <font>ακόμη</font></p>');
  assert.equal(serializeEditor(root), 'κείμενο ακόμη');
});

test('empty blocks (blank divs) are dropped', () => {
  const root = parseHtml('<div>α</div><div><br></div><div>β</div>');
  assert.equal(serializeEditor(root), 'α\n\nβ');
});

test('divs serialize as paragraphs (contenteditable Enter)', () => {
  const root = parseHtml('<div>πρώτη</div><div>δεύτερη</div>');
  assert.equal(serializeEditor(root), 'πρώτη\n\nδεύτερη');
});

test('strong maps to ** like b', () => {
  const root = parseHtml('<p><strong>δυνατό</strong></p>');
  assert.equal(serializeEditor(root), '**δυνατό**');
});

test('loose text nodes at root form a paragraph', () => {
  const root = parseHtml('σκέτο <b>κείμενο</b>');
  assert.equal(serializeEditor(root), 'σκέτο **κείμενο**');
});

test('list items collapse internal newlines to spaces', () => {
  const root = parseHtml('<ol><li>ένα<br>δύο</li></ol>');
  assert.equal(serializeEditor(root), '1. ένα δύο');
});

test('whole-empty input serializes to empty string', () => {
  assert.equal(serializeEditor(parseHtml('<p><br></p>')), '');
  assert.equal(serializeEditor(parseHtml('')), '');
});
