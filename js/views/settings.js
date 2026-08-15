import { fmtDate, escapeHtml } from '../ui.js';
import { validateSnapshot, mergeState } from '../core/merge.js';
import { freshState, saveState } from '../core/store.js';
import { dateStr, BADGES } from '../core/stats.js';

export async function render(el, ctx) {
  const s = ctx.state.stats;
  el.innerHTML = `
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
}
