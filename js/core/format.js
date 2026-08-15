import { escapeHtml } from '../ui.js';

// Inline markers AFTER escaping: escapeHtml never touches * or _.
function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<u>$1</u>');
}

// Escape-then-format. Blank line = paragraph; a block whose EVERY line
// starts "N. " is an <ol>; every line "- " is a <ul>; otherwise a <p>
// with single newlines as <br>. Anything malformed renders literally.
export function formatText(s) {
  const text = String(s ?? '');
  if (!text.trim()) return '';
  return text.split(/\n{2,}/).filter((b) => b.trim() !== '').map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\d+\.\s/.test(l))) {
      return `<ol>${lines.map((l) => `<li>${inline(escapeHtml(l.replace(/^\d+\.\s*/, '')))}</li>`).join('')}</ol>`;
    }
    if (lines.every((l) => /^-\s/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(escapeHtml(l.replace(/^-\s*/, '')))}</li>`).join('')}</ul>`;
    }
    return `<p>${lines.map((l) => inline(escapeHtml(l))).join('<br>')}</p>`;
  }).join('');
}
