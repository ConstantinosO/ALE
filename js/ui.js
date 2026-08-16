export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Shared view header: back link, title, optional subtitle, optional
// trailing actions (already-built HTML, e.g. pills).
export function pageHeader({ title, subtitle = '', back = '', actions = '' }) {
  return `<div class="pagehead">
    ${back ? `<a class="btn btn-ghost pagehead-back" href="${back}">←</a>` : ''}
    <div class="grow">
      <h1 class="pagehead-title">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="pagehead-sub muted">${escapeHtml(subtitle)}</p>` : ''}
    </div>
    ${actions}
  </div>`;
}
