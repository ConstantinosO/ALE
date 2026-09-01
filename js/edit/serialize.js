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
const LIST = new Set(['OL', 'UL']);

const isEl = (n, set) => n.nodeType === 1 && set.has(n.nodeName.toUpperCase());

// Does this subtree hold a list anywhere below it? execCommand('insert*List')
// on a region whose content is a single <p> builds <p><ol>…</ol></p> — an
// invalid nesting no HTML parser would produce, but a live contenteditable
// tree keeps it. A serializer that only looks for OL/UL among the root's own
// children never sees that list: it takes the <p> branch instead and unwraps
// the whole thing to bare text, welding the items together with no separator
// and silently destroying the field. Blocks that wrap a list are descended
// into instead.
function hasList(node) {
  if (node.nodeType !== 1) return false;
  return [...node.childNodes].some((c) => isEl(c, LIST) || hasList(c));
}

// The marker format has no nested lists, so a nested list's items are
// flattened up into the same block rather than dropped.
function listItems(list) {
  const out = [];
  for (const n of list.childNodes) {
    if (n.nodeType !== 1) continue;
    if (isEl(n, LIST)) { out.push(...listItems(n)); continue; }
    if (n.nodeName.toUpperCase() !== 'LI') continue;
    const nested = [...n.childNodes].filter((c) => isEl(c, LIST));
    const own = [...n.childNodes].filter((c) => !nested.includes(c))
      .map(inlineText).join('').replace(/\n+/g, ' ').trim();
    // Empty <li>s are dropped BEFORE numbering. An empty item would emit a
    // bare "1." / "-" marker with nothing after it, and formatText requires
    // whitespace after the marker on EVERY line — one empty item would drop
    // the whole block back to a paragraph showing literal "1." characters.
    // (Pressing Enter at the end of a list is the everyday way to make one.)
    if (own !== '') out.push(own);
    for (const sub of nested) out.push(...listItems(sub));
  }
  return out;
}

export function serializeEditor(root) {
  const blocks = [];
  let run = null; // loose inline nodes accumulate into an implicit paragraph
  const endRun = () => { if (run !== null) { blocks.push(run); run = null; } };

  const walk = (parent) => {
    for (const child of parent.childNodes) {
      const name = child.nodeType === 1 ? child.nodeName.toUpperCase() : '';
      if (LIST.has(name)) {
        endRun();
        const items = listItems(child);
        const marker = (i) => (name === 'OL' ? `${i + 1}. ` : '- ');
        if (items.length) blocks.push(items.map((t, i) => marker(i) + t).join('\n'));
      } else if (child.nodeType === 1 && hasList(child)) {
        // A wrapper around a list: descend so the list itself is reached, and
        // keep any prose beside it as its own block.
        endRun();
        walk(child);
        endRun();
      } else if (BLOCK.has(name)) {
        endRun();
        blocks.push(inlineText(child));
      } else {
        run = (run ?? '') + inlineText(child);
      }
    }
  };
  walk(root);
  endRun();

  return blocks
    .map((b) => b.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n'))
    .map((b) => b.replace(/\n{2,}/g, '\n').trim())
    .filter((b) => b !== '')
    .join('\n\n')
    .trim();
}
