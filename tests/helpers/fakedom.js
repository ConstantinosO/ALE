// tests/helpers/fakedom.js
// Minimal HTML -> fake-node parser. Covers ONLY the closed tag set that
// formatText emits (p, b, u, ol, ul, li, br) plus junk-wrapper tags the
// serializer must strip (span, font). Never shipped to the app.
function el(name) { return { nodeType: 1, nodeName: name, childNodes: [] }; }

function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

export function parseHtml(html) {
  const root = el('DIV');
  const stack = [root];
  const re = /<(\/)?([a-z0-9]+)(\s[^>]*)?>|([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      stack[stack.length - 1].childNodes.push(
        { nodeType: 3, nodeName: '#text', textContent: decode(m[4]), childNodes: [] });
    } else if (m[1]) {
      stack.pop();
    } else {
      const node = el(m[2].toUpperCase());
      stack[stack.length - 1].childNodes.push(node);
      if (node.nodeName !== 'BR') stack.push(node);
    }
  }
  return root;
}
