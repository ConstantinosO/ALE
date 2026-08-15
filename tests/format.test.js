import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatText } from '../js/core/format.js';

test('plain text becomes one paragraph', () => {
  assert.equal(formatText('Απλό κείμενο.'), '<p>Απλό κείμενο.</p>');
});

test('blank or nullish input returns empty string', () => {
  assert.equal(formatText(''), '');
  assert.equal(formatText('   \n '), '');
  assert.equal(formatText(null), '');
  assert.equal(formatText(undefined), '');
});

test('blank line splits paragraphs', () => {
  assert.equal(formatText('Πρώτη.\n\nΔεύτερη.'), '<p>Πρώτη.</p><p>Δεύτερη.</p>');
});

test('single newline inside a paragraph becomes <br>', () => {
  assert.equal(formatText('γραμμή1\nγραμμή2'), '<p>γραμμή1<br>γραμμή2</p>');
});

test('bold and underline markers', () => {
  assert.equal(formatText('**έντονα** και __υπογράμμιση__'),
    '<p><b>έντονα</b> και <u>υπογράμμιση</u></p>');
});

test('nested bold/underline', () => {
  assert.equal(formatText('**__x__**'), '<p><b><u>x</u></b></p>');
  assert.equal(formatText('__**x**__'), '<p><u><b>x</b></u></p>');
});

test('unclosed markers stay literal', () => {
  assert.equal(formatText('**χωρίς κλείσιμο'), '<p>**χωρίς κλείσιμο</p>');
});

test('numbered list', () => {
  assert.equal(formatText('1. Ένα\n2. Δύο **δυνατά**'),
    '<ol><li>Ένα</li><li>Δύο <b>δυνατά</b></li></ol>');
});

test('bullet list', () => {
  assert.equal(formatText('- πρώτο\n- δεύτερο'), '<ul><li>πρώτο</li><li>δεύτερο</li></ul>');
});

test('mixed block is a paragraph, not a list', () => {
  assert.equal(formatText('1. Ένα\nκείμενο'), '<p>1. Ένα<br>κείμενο</p>');
});

test('paragraphs around a list', () => {
  assert.equal(formatText('Εισαγωγή:\n\n1. βήμα\n2. βήμα\n\nΤέλος.'),
    '<p>Εισαγωγή:</p><ol><li>βήμα</li><li>βήμα</li></ol><p>Τέλος.</p>');
});

test('HTML in content is escaped — XSS stays impossible', () => {
  const out = formatText('<script>alert(1)</script> & **<img src=x>**');
  assert.ok(!out.includes('<script'));
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(out.includes('<b>&lt;img src=x&gt;</b>'));
});
