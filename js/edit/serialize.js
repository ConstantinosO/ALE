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
      const lines = [...child.childNodes]
        .filter((n) => n.nodeType === 1 && n.nodeName.toUpperCase() === 'LI')
        .map((li, i) => (name === 'OL' ? `${i + 1}. ` : '- ')
          + inlineText(li).replace(/\n+/g, ' ').trim());
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
