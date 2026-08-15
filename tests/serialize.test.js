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

// --- I3: an empty <li> must not degrade the whole block to a paragraph -----

test('empty list item in the middle is dropped and the rest renumbered', () => {
  const root = parseHtml('<ol><li>alpha</li><li></li><li>beta</li></ol>');
  assert.equal(serializeEditor(root), '1. alpha\n2. beta');
  assert.ok(formatText(serializeEditor(root)).startsWith('<ol>'), 'still renders as a list');
});

test('empty list item at the start is dropped', () => {
  assert.equal(serializeEditor(parseHtml('<ol><li></li><li>alpha</li></ol>')), '1. alpha');
  assert.equal(serializeEditor(parseHtml('<ul><li></li><li>alpha</li></ul>')), '- alpha');
});

test('empty list item at the end is dropped (Enter after the last item)', () => {
  assert.equal(serializeEditor(parseHtml('<ol><li>alpha</li><li></li></ol>')), '1. alpha');
  assert.equal(serializeEditor(parseHtml('<ul><li>alpha</li><li><br></li></ul>')), '- alpha');
});

test('a whitespace-only list item counts as empty', () => {
  assert.equal(serializeEditor(parseHtml('<ol><li>alpha</li><li>   </li><li>beta</li></ol>')),
    '1. alpha\n2. beta');
});

test('a list of only empty items produces no block at all', () => {
  assert.equal(serializeEditor(parseHtml('<ol><li></li><li><br></li></ol>')), '');
});

test('single-item lists round-trip', () => {
  assert.equal(serializeEditor(parseHtml('<ol><li>μόνο ένα</li></ol>')), '1. μόνο ένα');
  assert.equal(serializeEditor(parseHtml('<ul><li>μόνο ένα</li></ul>')), '- μόνο ένα');
  assert.equal(serializeEditor(parseHtml(formatText('1. μόνο ένα'))), '1. μόνο ένα');
  assert.equal(serializeEditor(parseHtml(formatText('- μόνο ένα'))), '- μόνο ένα');
});

test('a list surrounded by prose keeps its neighbours when an item is empty', () => {
  const root = parseHtml('<p>Εισαγωγή:</p><ol><li>ένα</li><li></li><li>δύο</li></ol><p>Τέλος.</p>');
  assert.equal(serializeEditor(root), 'Εισαγωγή:\n\n1. ένα\n2. δύο\n\nΤέλος.');
});

test('whole-empty input serializes to empty string', () => {
  assert.equal(serializeEditor(parseHtml('<p><br></p>')), '');
  assert.equal(serializeEditor(parseHtml('')), '');
});
