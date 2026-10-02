// Diagrams redrawn from the ΠΒΑΚ «Ασφαλίσεις Κλάδου Ζωής» slides, keyed by
// topic id. Every label comes from the slide or the topic's own material; the
// two charts carry no figures, because none survived extraction from the
// slides and an invented axis would be studied as fact.
//
// Deliberately code, not content.json: these are not editable prose, so they
// stay out of the in-app editor and out of the escape-then-format path. Text
// still goes through escapeHtml — "&" alone would break the SVG.
import { escapeHtml } from '../ui.js';

const FONT = 'font-family="inherit"';
const t = (x, y, s, { size = 13, weight = 400, fill = 'var(--text)', anchor = 'start', extra = '' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${FONT} ${extra}>${escapeHtml(s)}</text>`;

const svg = (h, label, body) =>
  `<svg viewBox="0 0 400 ${h}" width="100%" role="img" aria-label="${escapeHtml(label)}" style="max-width:560px;display:block;margin:0 auto">${body}</svg>`;

// A pyramid on the left, one block of labels per tier on the right. Labels
// sit beside the tiers rather than inside them: the top tiers are too narrow
// to hold text at phone width. SVG text does not wrap, so a long note is
// given as an array of lines and its tier grows to fit them. tiers[0] is the
// TOP of the pyramid.
const LINE = 14;
function pyramid(tiers, label) {
  const gap = 5, top = 10;
  const lines = (tier) => [].concat(tier.note ?? []);
  const heights = tiers.map((tier) => Math.max(46, 26 + LINE * lines(tier).length));
  const H = heights.reduce((a, b) => a + b, 0) + gap * (tiers.length - 1);
  const cx = 82, minHalf = 14, maxHalf = 76;
  const half = (y) => minHalf + (maxHalf - minHalf) * ((y - top) / H);
  let body = '';
  let y0 = top;
  tiers.forEach((tier, k) => {
    const y1 = y0 + heights[k];
    const a = half(y0), b = half(y1);
    body += `<polygon points="${cx - a},${y0} ${cx + a},${y0} ${cx + b},${y1} ${cx - b},${y1}" fill="var(--gold)" fill-opacity="${tier.shade}" stroke="var(--gold)" stroke-width="1"/>`;
    const ls = lines(tier);
    // Centre the whole label block (name + note lines) on the tier.
    const blockTop = (y0 + y1) / 2 - (13 + LINE * ls.length) / 2;
    body += t(176, blockTop + 11, tier.name, { weight: 700 });
    ls.forEach((l, i) => { body += t(176, blockTop + 11 + LINE * (i + 1), l, { size: 11.5, fill: 'var(--muted)' }); });
    y0 = y1 + gap;
  });
  return { h: top + H + 10, body, label };
}

function investmentPyramid() {
  // Slide 52, top to bottom. The notes are the topic material's own words.
  const p = pyramid([
    { name: 'Μετοχές', note: ['υψηλότερο ρίσκο', 'και δυνητική απόδοση'], shade: 1 },
    { name: 'Ακίνητα', shade: 0.85 },
    { name: 'Ασφάλειες Ζωής', note: 'στη μέση της πυραμίδας', shade: 0.7 },
    { name: 'Εταιρικά Ομόλογα', shade: 0.55 },
    { name: 'Κρατικά Ομόλογα', shade: 0.4 },
    { name: 'Καταθέσεις', note: ['μεγαλύτερη ασφάλεια,', 'χαμηλότερο ρίσκο'], shade: 0.25 },
  ], 'Η Πυραμίδα των Επενδύσεων');
  return {
    title: 'Η Πυραμίδα των Επενδύσεων',
    svg: svg(p.h, p.label, p.body),
    caption: 'Όσο ψηλότερα στην πυραμίδα, τόσο μεγαλύτερο το ρίσκο και η δυνητική απόδοση — και τόσο μικρότερο μέρος του χαρτοφυλακίου ενός συνετού επενδυτή πρέπει να καταλαμβάνει.',
  };
}

function needsPyramid() {
  // Slide «Ιεράρχηση Ασφαλιστικών Αναγκών — με βάση την πυραμίδα του
  // Μάσλοου», regrouped the way z12-1's summary groups it: protection at the
  // base, accumulation in the middle, wealth distribution at the top. The
  // three shades are those three groups.
  const p = pyramid([
    { name: 'Κατανομή Πλούτου', note: ['ακίνητες επενδύσεις,', 'φιλανθρωπικό έργο,', 'μακροπρόθεσμη φροντίδα'], shade: 1 },
    { name: 'Επενδύσεις Απόδοσης', note: 'κινητές επενδύσεις', shade: 0.62 },
    { name: 'Συσσώρευση', note: ['μεσομακροπρόθεσμες αποταμιεύσεις:', 'αφυπηρέτηση, σπουδές παιδιών'], shade: 0.62 },
    { name: 'Πρόνοια για Έκτακτα', note: 'ανεργία, ατυχήματα, ευθύνη', shade: 0.28 },
    { name: 'Ασφαλιστική Προστασία', note: ['καλύψεις ζωής, δάνεια,', 'τελευταία έξοδα, ανικανότητα,', 'ιατρική αρωγή'], shade: 0.28 },
  ], 'Ιεράρχηση Ασφαλιστικών Αναγκών με βάση την πυραμίδα του Μάσλοου');
  // Legend for the three groups.
  const ly = p.h + 6;
  const sw = (x, shade, s) => `<rect x="${x}" y="${ly}" width="12" height="12" rx="2" fill="var(--gold)" fill-opacity="${shade}" stroke="var(--gold)"/>`
    + t(x + 17, ly + 10.5, s, { size: 11.5, fill: 'var(--muted)' });
  const legend = sw(8, 0.28, 'Προστασία') + sw(120, 0.62, 'Συσσώρευση') + sw(240, 1, 'Κατανομή πλούτου');
  return {
    title: 'Ιεράρχηση Ασφαλιστικών Αναγκών (πυραμίδα του Μάσλοου)',
    svg: svg(ly + 22, p.label, p.body + legend),
    caption: 'Πρώτα καλύπτεται η βάση — η ασφαλιστική προστασία — και μόνο μετά οι ανάγκες συσσώρευσης και κατανομής πλούτου.',
  };
}

// Plot frame shared by the two charts: axes only, no ticks or values.
const X0 = 46, X1 = 384, Y0 = 18, Y1 = 196;
const axes = (xLabel, yLabel) =>
  `<line x1="${X0}" y1="${Y1}" x2="${X1}" y2="${Y1}" stroke="var(--muted)" stroke-width="1.5"/>`
  + `<line x1="${X0}" y1="${Y0 - 6}" x2="${X0}" y2="${Y1}" stroke="var(--muted)" stroke-width="1.5"/>`
  + `<polygon points="${X1},${Y1} ${X1 - 7},${Y1 - 4} ${X1 - 7},${Y1 + 4}" fill="var(--muted)"/>`
  + `<polygon points="${X0},${Y0 - 10} ${X0 - 4},${Y0 - 3} ${X0 + 4},${Y0 - 3}" fill="var(--muted)"/>`
  + t((X0 + X1) / 2, Y1 + 20, xLabel, { size: 12, fill: 'var(--muted)', anchor: 'middle' })
  + t(16, (Y0 + Y1) / 2, yLabel, { size: 12, fill: 'var(--muted)', anchor: 'middle', extra: `transform="rotate(-90 16 ${(Y0 + Y1) / 2})"` });

// Sample a curve as an SVG path through n points.
const path = (f, n = 40) => Array.from({ length: n + 1 }, (_, i) => {
  const u = i / n;
  return `${i ? 'L' : 'M'}${(X0 + u * (X1 - X0)).toFixed(1)},${f(u).toFixed(1)}`;
}).join(' ');

function howItWorks() {
  // Slide «Πως δουλεύει μια ασφάλεια ζωής»: a constant death benefit, split
  // between the reserve (growing with age) and the insurer's own risk (the
  // rest). The reserve curve's shape is illustrative.
  const top = Y0 + 8;
  const reserveY = (u) => Y1 - (Y1 - top) * Math.pow(u, 1.6);
  const curve = path(reserveY);
  const body = axes('Ηλικία', 'Ποσό')
    + `<path d="${curve} L${X1},${Y1} L${X0},${Y1} Z" fill="var(--gold)" fill-opacity="0.85"/>`
    + `<path d="${curve} L${X1},${top} L${X0},${top} Z" fill="var(--border)"/>`
    + `<line x1="${X0}" y1="${top}" x2="${X1}" y2="${top}" stroke="var(--text)" stroke-width="2"/>`
    + t(X0 + 6, top - 5, 'Ποσό ασφάλισης θανάτου (σταθερό)', { size: 11.5, weight: 700 })
    + t(X0 + 14, top + 34, 'Ρίσκο ασφαλιστή', { weight: 700 })
    + t(X0 + 14, top + 50, '(ποσό προστασίας)', { size: 11.5, fill: 'var(--muted)' })
    + t(X1 - 10, Y1 - 30, 'Απόθεμα ή', { weight: 700, fill: '#111228', anchor: 'end' })
    + t(X1 - 10, Y1 - 14, 'αξία εξαγοράς', { weight: 700, fill: '#111228', anchor: 'end' });
  return {
    title: 'Πώς δουλεύει μια ασφάλεια ζωής',
    svg: svg(222, 'Το ποσό θανάτου χωρίζεται σε απόθεμα και ρίσκο ασφαλιστή καθώς μεγαλώνει η ηλικία', body),
    caption: 'Το ποσό θανάτου μένει σταθερό. Καθώς το απόθεμα μεγαλώνει, μικραίνει το μέρος που καλύπτει ο ασφαλιστής από δικό του ρίσκο. Η απλή πρόσκαιρη (Term) δεν συσσωρεύει αξία εξαγοράς.',
  };
}

function renewableVsLevel() {
  // Slide «Παράδειγμα Ασφαλίστρων για Κάλυψη €400.000» — Ετήσιο Ανανεώσιμο
  // against a level premium. The slide's figures did not survive extraction,
  // so this is the shape only. The crossover is what z2-4 describes: early
  // years overpay into the reserve, later years draw on it.
  const lo = Y1 - 14, hi = Y0 + 10;
  const costY = (u) => lo - (lo - hi) * Math.pow(u, 2.4);
  const levelY = Y1 - 0.38 * (Y1 - Y0);
  // Where the rising cost meets the level line.
  const cross = Math.pow((lo - levelY) / (lo - hi), 1 / 2.4);
  const xc = X0 + cross * (X1 - X0);
  const costPath = path(costY);
  // The cost curve between two points, for closing the shaded regions.
  const clip = (u0, u1) => Array.from({ length: 21 }, (_, i) => {
    const u = u0 + (u1 - u0) * (i / 20);
    return `${(X0 + u * (X1 - X0)).toFixed(1)},${costY(u).toFixed(1)}`;
  });
  const surplus = `M${X0},${levelY} L${xc.toFixed(1)},${levelY} L${clip(cross, 0).join(' L')} Z`;
  const deficit = `M${xc.toFixed(1)},${levelY} L${X1},${levelY} L${clip(1, cross).join(' L')} Z`;
  const body = axes('Ηλικία', 'Ετήσιο ασφάλιστρο')
    + `<path d="${surplus}" fill="var(--gold)" fill-opacity="0.35"/>`
    + `<path d="${deficit}" fill="var(--bad)" fill-opacity="0.18"/>`
    + `<path d="${costPath}" fill="none" stroke="var(--text)" stroke-width="2.2"/>`
    + `<line x1="${X0}" y1="${levelY}" x2="${X1}" y2="${levelY}" stroke="var(--gold)" stroke-width="3"/>`
    + t(X0 + 8, levelY - 8, 'Σταθερό ασφάλιστρο', { weight: 700 })
    // The cost label sits up and to the left of the curve's steep end, where
    // the curve is well below it; down at the curve's flat start it collides.
    + t(300, 72, 'Ετήσιο ανανεώσιμο', { weight: 700, anchor: 'end' })
    + t(300, 86, '(πραγματικό κόστος ηλικίας)', { size: 11.5, fill: 'var(--muted)', anchor: 'end' })
    + t((X0 + xc) / 2, levelY + 16, 'περίσσευμα → απόθεμα', { size: 11.5, anchor: 'middle' })
    // Under the level line past the crossover is clear space; the arrow
    // points up into the shortfall the reserve covers.
    + t(X1 - 6, levelY + 18, '↑ χρήση αποθέματος', { size: 11.5, anchor: 'end' });
  return {
    title: 'Ετήσιο ανανεώσιμο έναντι σταθερού ασφαλίστρου',
    svg: svg(222, 'Το σταθερό ασφάλιστρο υπερβαίνει το κόστος ηλικίας στα πρώτα χρόνια και υπολείπεται στα τελευταία', body),
    caption: 'Τα ασφάλιστρα ζωής αυξάνονται με την ηλικία. Με σταθερό ασφάλιστρο, στα πρώτα χρόνια πληρώνεις περισσότερο από το πραγματικό κόστος — το περίσσευμα γίνεται απόθεμα, που καλύπτει τη διαφορά στα τελευταία χρόνια.',
  };
}

const BUILDERS = {
  'z2-4': [howItWorks, renewableVsLevel],
  'z11-3': [investmentPyramid],
  'z12-1': [needsPyramid],
};

export function diagramsFor(topicId) {
  return (BUILDERS[topicId] || []).map((build) => build());
}
