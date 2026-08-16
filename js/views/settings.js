import { fmtDate, escapeHtml, pageHeader } from '../ui.js';
import { validateSnapshot, mergeState } from '../core/merge.js';
import { freshState, saveState } from '../core/store.js';
import { dateStr, BADGES } from '../core/stats.js';
import { loadEdits, saveEdits, pendingCount } from '../edit/overlay.js';
import { getFile } from '../edit/github.js';
import { retryPendingAll } from '../edit/editor.js';

const STORE_FULL = '⚠️ Δεν αποθηκεύτηκε (ο χώρος του προγράμματος περιήγησης είναι πλήρης).';

export async function render(el, ctx) {
  const s = ctx.state.stats;
  el.innerHTML = `
    ${pageHeader({ title: 'Ρυθμίσεις' })}
    <div class="card">
      <h2>📆 Ημερομηνία εξετάσεων</h2>
      <p class="muted">Τρέχουσα: ${fmtDate(ctx.examDateIso())}</p>
      <div class="row">
        <input type="date" id="examdate" value="${ctx.examDateIso()}">
        <button class="btn" id="savedate">Αποθήκευση</button>
      </div>
    </div>
    <div class="card">
      <h2>🏆 Παράσημα</h2>
      <div class="badgegrid">
        ${BADGES.map((b) => {
          const earned = s.badges.find((e) => e.id === b.id);
          return `<div class="badge ${earned ? 'earned' : ''}">
            <div class="icon">${b.icon}</div><div class="name">${b.name}</div>
            ${earned ? `<div class="name muted">${escapeHtml(earned.earnedDate)}</div>` : ''}</div>`;
        }).join('')}
      </div>
    </div>
    <div class="card">
      <h2>✏️ Επεξεργασία ύλης</h2>
      <p class="muted">Με GitHub token οι αλλαγές σου στην ύλη αποθηκεύονται μόνιμα για όλες τις συσκευές. Οδηγίες δημιουργίας: δες το README στο GitHub.</p>
      <div class="row">
        <input type="password" id="ghtoken" placeholder="github_pat_…" autocomplete="off" class="grow">
        <button class="btn" id="savetoken">Αποθήκευση</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn btn-ghost" id="testtoken">Έλεγχος σύνδεσης</button>
        <button class="btn btn-ghost" id="removetoken">Αφαίρεση token</button>
        <button class="btn btn-ghost" id="retrypending">⟳ Εκκρεμείς (<span id="pendingn"></span>)</button>
        <button class="btn btn-ghost" id="clearedits">Καθαρισμός τοπικών αλλαγών</button>
      </div>
      <p class="muted" id="tokenmsg"></p>
    </div>
    <div class="card">
      <h2>🔄 Συγχρονισμός συσκευών</h2>
      <p class="muted">Η πρόοδος αποθηκεύεται μόνο σε αυτή τη συσκευή. Για μεταφορά: Κοινοποίηση (π.χ. AirDrop) ή Εξαγωγή εδώ → Εισαγωγή στην άλλη συσκευή.</p>
      ${'share' in navigator ? '<button class="btn btn-gold btn-block" id="share">📤 Κοινοποίηση προόδου (AirDrop κ.ά.)</button>' : ''}
      <button class="btn btn-block" id="export">⬇️ Εξαγωγή προόδου</button>
      <label class="btn btn-ghost btn-block" style="cursor:pointer">⬆️ Εισαγωγή προόδου
        <input type="file" id="import" accept=".json,application/json" style="display:none"></label>
      <p id="syncmsg" class="muted"></p>
    </div>
    <div class="card">
      <h2>🗑️ Επαναφορά</h2>
      <p class="muted">Διαγράφει όλη την πρόοδο σε αυτή τη συσκευή. Η ύλη δεν επηρεάζεται.</p>
      <button class="btn btn-block" style="background:var(--bad)" id="reset">Διαγραφή προόδου</button>
    </div>`;

  document.getElementById('savedate').addEventListener('click', () => {
    const v = document.getElementById('examdate').value;
    if (v) { ctx.state.settings.examDate = v; ctx.save(); ctx.navigate('#/'); }
  });

  const snapshotFile = () => new File(
    [JSON.stringify({ ...ctx.state, exportedAt: new Date().toISOString() }, null, 2)],
    `ale-progress-${dateStr(new Date())}.json`, { type: 'application/json' });

  const shareBtn = document.getElementById('share');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    const msg = document.getElementById('syncmsg');
    try {
      const file = snapshotFile();
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Πρόοδος ALE' });
        msg.textContent = '✅ Η πρόοδος στάλθηκε — άνοιξέ την στην άλλη συσκευή με «Εισαγωγή προόδου».';
      } else {
        msg.textContent = 'ℹ️ Η κοινοποίηση αρχείων δεν υποστηρίζεται σε αυτό το πρόγραμμα περιήγησης — χρησιμοποίησε την Εξαγωγή.';
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        document.getElementById('syncmsg').textContent = '⚠️ Η κοινοποίηση απέτυχε — χρησιμοποίησε την Εξαγωγή.';
      }
    }
  });

  document.getElementById('export').addEventListener('click', () => {
    const blob = new Blob(
      [JSON.stringify({ ...ctx.state, exportedAt: new Date().toISOString() }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ale-progress-${dateStr(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('import').addEventListener('change', async (e) => {
    const msg = document.getElementById('syncmsg');
    const file = e.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      const v = validateSnapshot(imported);
      if (!v.ok) { msg.textContent = `⚠️ ${v.error}`; return; }
      const merged = mergeState(ctx.state, imported);
      Object.assign(ctx.state, merged);
      ctx.save();
      msg.textContent = '✅ Η εισαγωγή ολοκληρώθηκε. Η πρόοδος συγχωνεύτηκε.';
      setTimeout(() => ctx.navigate('#/settings'), 1200);
    } catch {
      msg.textContent = '⚠️ Το αρχείο δεν είναι έγκυρο JSON.';
    }
  });

  document.getElementById('reset').addEventListener('click', () => {
    if (confirm('Σίγουρα; Όλη η πρόοδος σε αυτή τη συσκευή θα διαγραφεί.')) {
      const fresh = freshState();
      Object.keys(ctx.state).forEach((k) => { delete ctx.state[k]; });
      Object.assign(ctx.state, fresh);
      saveState(ctx.state, window.localStorage);
      ctx.navigate('#/');
    }
  });

  const tokenMsg = document.getElementById('tokenmsg');
  const refreshTokenUi = () => {
    const store = loadEdits(window.localStorage);
    document.getElementById('ghtoken').placeholder = store.token ? '••••••• (αποθηκευμένο)' : 'github_pat_…';
    document.getElementById('removetoken').style.display = store.token ? '' : 'none';
    const n = pendingCount(store);
    document.getElementById('pendingn').textContent = n;
    document.getElementById('retrypending').style.display = n ? '' : 'none';
    document.getElementById('clearedits').style.display =
      Object.keys(store.edits).length ? '' : 'none';
  };
  refreshTokenUi();

  document.getElementById('savetoken').addEventListener('click', () => {
    const v = document.getElementById('ghtoken').value.trim();
    if (!v) return;
    const store = loadEdits(window.localStorage);
    store.token = v;
    if (!saveEdits(window.localStorage, store)) { tokenMsg.textContent = STORE_FULL; return; }
    document.getElementById('ghtoken').value = '';
    tokenMsg.textContent = '✅ Το token αποθηκεύτηκε σε αυτή τη συσκευή.';
    refreshTokenUi();
  });

  document.getElementById('testtoken').addEventListener('click', async () => {
    const store = loadEdits(window.localStorage);
    if (!store.token) { tokenMsg.textContent = 'ℹ️ Δεν υπάρχει αποθηκευμένο token.'; return; }
    tokenMsg.textContent = 'Έλεγχος…';
    try {
      await getFile(store.token, 'data/courses.json');
      tokenMsg.textContent = '✅ Η σύνδεση με το GitHub λειτουργεί.';
    } catch (e) {
      tokenMsg.textContent = `⚠️ Αποτυχία σύνδεσης (${e.message}). Έλεγξε το token.`;
    }
  });

  document.getElementById('removetoken').addEventListener('click', () => {
    const store = loadEdits(window.localStorage);
    store.token = '';
    if (!saveEdits(window.localStorage, store)) { tokenMsg.textContent = STORE_FULL; return; }
    tokenMsg.textContent = 'Το token αφαιρέθηκε. Οι τοπικές αλλαγές παραμένουν.';
    refreshTokenUi();
  });

  // The only in-app route back to the repo's own material: the overlay is
  // applied on top of the fetched content, so without this a local edit
  // (especially after the token is removed and every ✏️ disappears) has no
  // way back. Reload rather than re-render — getContent caches the already
  // edited copy for the session.
  document.getElementById('clearedits').addEventListener('click', () => {
    if (!confirm('Θα διαγραφούν όλες οι τοπικές αλλαγές ύλης, και όσες δεν έχουν καταχωρηθεί στο GitHub θα χαθούν. Σίγουρα;')) return;
    const store = loadEdits(window.localStorage);
    store.edits = {}; // the token stays
    if (!saveEdits(window.localStorage, store)) {
      tokenMsg.textContent = '⚠️ Ο καθαρισμός δεν αποθηκεύτηκε — δοκίμασε ξανά.';
      return;
    }
    location.reload();
  });

  document.getElementById('retrypending').addEventListener('click', async () => {
    tokenMsg.textContent = 'Καταχώρηση εκκρεμών αλλαγών…';
    const { retried, pending, conflicts } = await retryPendingAll();
    tokenMsg.textContent = retried
      ? (pending
        ? '⚠️ Μερική καταχώρηση — κάποιες αλλαγές παραμένουν σε εκκρεμότητα.'
        : `✅ Καταχωρήθηκαν ${retried} αλλαγές.`)
      // Nothing went through. A baseline conflict is not a token/network
      // problem and must not be reported as one — the material moved on.
      : conflicts
        ? '⚠️ Οι αλλαγές δεν ταιριάζουν πια με την ύλη στο GitHub — άνοιξε το θέμα και ξαναγράψ\' τες.'
        : '⚠️ Δεν καταχωρήθηκε τίποτα — έλεγξε token/σύνδεση.';
    refreshTokenUi();
  });
}
