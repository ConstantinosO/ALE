// js/edit/serialize.js
// Walks a DOM-like tree (only nodeType, nodeName, textContent, childNodes)
// and emits canonical marker text. Everything not in the known set is
// unwrapped to its text - styles/spans/fonts injected by iOS or paste
// are discarded.

function inlineText(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return '';
  const name = node.nodeName.toUpperCase();
  if (name === 'BR') return '\n';
  const inner = [...node.childNodes].map(inlineText).join('');
  if (!inner.trim()) return inner;
  if (name === 'B' || name === 'STRONG') return `**${inner}**`;
  if (name === 'U') return `__${inner}__`;
  return inner;
}

const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE']);

export function serializeEditor(root) {
  const blocks = [];
  let run = null; // loose inline nodes accumulate into an implicit paragraph
  const endRun = () => { if (run !== null) { blocks.push(run); run = null; } };

  for (const child of root.childNodes) {
    const name = child.nodeType === 1 ? child.nodeName.toUpperCase() : '';
    if (name === 'OL' || name === 'UL') {
      endRun();
      // Empty <li>s are dropped BEFORE numbering. An empty item would emit a
      // bare "1." / "-" marker with nothing after it, and formatText requires
      // whitespace after the marker on EVERY line — one empty item would drop
      // the whole block back to a paragraph showing literal "1." characters.
      // (Pressing Enter at the end of a list is the everyday way to make one.)
      const items = [...child.childNodes]
        .filter((n) => n.nodeType === 1 && n.nodeName.toUpperCase() === 'LI')
        .map((li) => inlineText(li).replace(/\n+/g, ' ').trim())
        .filter((t) => t !== '');
      const lines = items.map((t, i) => (name === 'OL' ? `${i + 1}. ` : '- ') + t);
      if (lines.length) blocks.push(lines.join('\n'));
    } else if (BLOCK.has(name)) {
      endRun();
      blocks.push(inlineText(child));
    } else {
      run = (run ?? '') + inlineText(child);
    }
  }
  endRun();

  return blocks
    .map((b) => b.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n'))
    .map((b) => b.replace(/\n{2,}/g, '\n').trim())
    .filter((b) => b !== '')
    .join('\n\n')
    .trim();
}
