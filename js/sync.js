"use strict";
/* ==========================================================================
   Synchronisation entre appareils via le fichier chiffré sur Google Drive.
   - À l'ouverture, au retour sur l'application, toutes les 2 minutes et
     quelques secondes après chaque modification.
   - Si les deux côtés ont changé, fusion : transactions une par une (la plus
     récente gagne, les suppressions sont respectées), règles et événements
     réunis, comptes fusionnés champ par champ, le reste selon le plus récent.
   ========================================================================== */

/* ---------- Fusion de deux versions des données ---------- */
function mergeData(L, R){
  if (!L) return R; if (!R) return L;
  const lt = L.updatedAt || 0, rt = R.updatedAt || 0;
  const newer = lt >= rt ? L : R, older = newer === L ? R : L;
  const out = { ...older, ...newer };
  // Suppressions : on garde la plus récente
  const del = { ...(older.deleted || {}) };
  for (const [id, t] of Object.entries(newer.deleted || {})) del[id] = Math.max(del[id] || 0, t);
  // Transactions : par identifiant, la version modifiée le plus récemment
  const tx = new Map();
  for (const t of [...(older.tx || []), ...(newer.tx || [])]){
    const cur = tx.get(t.id);
    if (!cur || (t.mod || 0) >= (cur.mod || 0)) tx.set(t.id, t);
  }
  out.tx = [...tx.values()].filter(t => !(del[t.id] && del[t.id] >= (t.mod || 0)));
  out.deleted = del;
  // Appariements de paiements de carte : retirer ceux qui pointent vers une transaction disparue
  const ids = new Set(out.tx.map(t => t.id));
  out.tx = out.tx.map(t => t.matchId && !ids.has(t.matchId) ? { ...t, matchId: null } : t);
  // Listes à identifiant : réunion
  const unionById = (a = [], b = []) => { const m = new Map(); for (const x of [...a, ...b]) m.set(x.id, x); return [...m.values()]; };
  out.imports = unionById(older.imports, newer.imports).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  // Événements : la version modifiée le plus récemment, sans ceux supprimés d'un côté
  const delEv = { ...(older.deletedEv || {}) };
  for (const [id, x] of Object.entries(newer.deletedEv || {})) delEv[id] = Math.max(delEv[id] || 0, x);
  const evm = new Map();
  for (const e of [...(older.events || []), ...(newer.events || [])]){ const c = evm.get(e.id); if (!c || (e.mod || 0) >= (c.mod || 0)) evm.set(e.id, e); }
  out.events = [...evm.values()].filter(e => !delEv[e.id]);
  out.deletedEv = delEv;
  out.planned = unionById(older.planned, newer.planned);
  // Règles apprises : réunion par commerçant et montant
  const rules = JSON.parse(JSON.stringify(older.rules || {}));
  for (const [m, list] of Object.entries(newer.rules || {})){
    const cur = rules[m] = rules[m] || [];
    for (const e of list){ const i = cur.findIndex(x => Math.abs(x.amount - e.amount) < 0.005); if (i >= 0) cur[i] = e; else cur.push(e); }
  }
  out.rules = rules;
  // Comptes : champ par champ (chacun importe souvent ses propres relevés)
  out.accounts = (newer.accounts || []).map(a => {
    const o = (older.accounts || []).find(x => x.id === a.id) || {};
    const pick = (x, y, f) => !x ? y : !y ? x : f(x, y);
    return { ...o, ...a,
      last4: a.last4 || o.last4 || null,
      opening: pick(a.opening, o.opening, (x, y) => x.date <= y.date ? x : y),
      bank: pick(a.bank, o.bank, (x, y) => x.date >= y.date ? x : y),
      cardStart: a.cardStart || o.cardStart || null };
  });
  // Historique Excel : celui qui en a un
  if (!(newer.history || []).length && (older.history || []).length){ out.history = older.history; out.historyFile = older.historyFile; out.excelDebts = older.excelDebts; }
  out.lastBackup = [L.lastBackup, R.lastBackup].filter(Boolean).sort().pop() || null;
  out.updatedAt = Math.max(lt, rt);
  return out;
}

const Sync = (() => {
  const st = { status: Drive.linked() ? "idle" : "off", msg: "", at: null, busy: false, ask: null };
  let soonTimer = null, everyTimer = null;
  const set = (status, msg = "") => { st.status = status; st.msg = msg; if (S) render(); };
  const hhmm = d => d ? new Date(d).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }) : "";

  async function run(){
    if (st.busy || !S || !Vault.isOpen() || !Drive.linked()) return;
    if (!Drive.hasToken()) return set("auth");
    st.busy = true; set("busy");
    try {
      await flushSave();
      const link = Drive.getLink();
      const meta = await Drive.api.meta(link.fileId);
      if (meta.trashed){ const e = new Error("Le fichier de synchronisation est dans la corbeille de Drive."); e.code = "GONE"; throw e; }
      const remoteChanged = String(meta.version) !== String(link.version);
      const localDirty = (S.updatedAt || 0) > (link.syncedAt || 0);
      if (remoteChanged){
        const remote = await Vault.openRemote(await Drive.api.download(link.fileId));
        const merged = localDirty ? mergeData(snapshot(), remote) : remote;
        if (localDirty) merged.updatedAt = Date.now();
        boot(merged, true);
        await Vault.save(snapshot());
      }
      let version = meta.version;
      if (localDirty){ const f = await Drive.api.update(link.fileId, Vault.exportFile()); version = f.version; }
      Drive.setLink({ ...link, version, syncedAt: S.updatedAt || 0, at: Date.now() });
      st.at = Date.now(); st.busy = false; set("idle");
      if (remoteChanged) toast(localDirty ? "Synchronisé : vos modifications et celles de l'autre appareil ont été réunies." : "Synchronisé : données mises à jour depuis Drive.");
    } catch (e) {
      st.busy = false;
      if (e.code === "AUTH") set("auth");
      else set("error", e.message);
    }
  }
  const linkInfo = () => Drive.getLink();

  return {
    st,
    now: run,
    soon(){ clearTimeout(soonTimer); if (Drive.linked()) soonTimer = setTimeout(run, 4000); },
    onOpen(){
      Drive.preload();
      clearInterval(everyTimer); everyTimer = setInterval(run, 120000);
      st.status = Drive.linked() ? (Drive.hasToken() ? "idle" : "auth") : "off";
      if (Drive.linked()) run();
    },
    /* Clic sur « Se connecter » : doit rester dans le geste de l'utilisateur */
    connect(){ Drive.requestToken().then(run).catch(e => set("error", e.message)); },
    /* Premier appareil : choisir le dossier partagé et y créer le fichier */
    async linkCreate(){
      try {
        await Drive.requestToken();
        const folder = await Drive.pick("folder");
        set("busy"); await flushSave();
        await Drive.createIn(folder, Vault.exportFile());
        Drive.setLink({ ...Drive.getLink(), syncedAt: S.updatedAt || 0, at: Date.now() });
        st.at = Date.now(); set("idle"); toast(`Fichier créé dans « ${folder.name} ». La synchronisation est active.`);
      } catch (e) { set(Drive.linked() ? "error" : "off", e.message); toast(e.message); }
    },
    /* Autre appareil, coffre déjà ouvert : choisir le fichier existant, puis demander son mot de passe */
    async linkExisting(){
      try {
        await Drive.requestToken();
        const file = await Drive.pick("file");
        set("busy");
        const [text, meta, email] = await Promise.all([Drive.api.download(file.id), Drive.api.meta(file.id), Drive.api.email()]);
        st.ask = { file, text, meta, email }; set("off");
      } catch (e) { set("off", e.message); toast(e.message); }
    },
    /* Le mot de passe du fichier est saisi : fusion des deux côtés, adoption des clés du fichier */
    async finishLink(secret){
      const a = st.ask; if (!a) return;
      const peek = await Vault.peekFile(a.text, secret);
      await flushSave();
      const merged = mergeData(snapshot(), peek.data); merged.updatedAt = Date.now();
      await Vault.adopt(peek, merged);
      boot(merged, true);
      const f = await Drive.api.update(a.file.id, Vault.exportFile());
      Drive.setLink({ fileId: a.file.id, fileName: a.meta.name, folderName: null, version: f.version, syncedAt: S.updatedAt, at: Date.now(), authorized: true, email: a.email });
      st.ask = null; st.at = Date.now(); set("idle");
      toast("Appareil relié. Les données de cet appareil et celles du fichier ont été réunies. Le mot de passe est désormais celui du fichier.");
    },
    cancelAsk(){ st.ask = null; set(Drive.linked() ? "idle" : "off"); },
    unlink(){ Drive.unlink(); st.status = "off"; st.ask = null; render(); toast("Synchronisation désactivée sur cet appareil. Le fichier reste sur Drive."); },
    /* Écran de création : rejoindre un coffre qui existe déjà sur Drive */
    async fetchForJoin(){
      await Drive.requestToken();
      const file = await Drive.pick("file");
      const [text, meta, email] = await Promise.all([Drive.api.download(file.id), Drive.api.meta(file.id), Drive.api.email()]);
      return { file, text, meta, email };
    },
    finishJoin(j){ Drive.setLink({ fileId: j.file.id, fileName: j.meta.name, folderName: null, version: j.meta.version, syncedAt: 0, at: Date.now(), authorized: true, email: j.email }); },

    /* ---------- Affichage ---------- */
    side(){
      const s = st.status, l = linkInfo();
      const dot = c => `<span class="status-dot" style="background:var(--${c})"></span>`;
      if (s === "off") return `<div>${dot("fg-3")}Drive : non relié</div>`;
      if (s === "busy") return `<div>${dot("accent")}Drive : synchronisation…</div>`;
      if (s === "auth") return `<div>${dot("warn")}Drive : connexion requise</div><button class="btn small" data-act="sync-connect">Se connecter à Google</button>`;
      if (s === "error") return `<div title="${esc(st.msg)}">${dot("bad")}Drive : erreur</div><button class="btn small" data-act="sync-now">Réessayer</button>`;
      return `<div>${dot("good")}Drive : à jour${l?.at ? " à " + hhmm(l.at) : ""}</div>`;
    },
    card(){
      const l = linkInfo(), s = st.status;
      if (st.ask) return `<div class="card"><div class="card-h"><h2>Synchronisation Google Drive</h2></div>
        <div class="small">Fichier trouvé : <b>${esc(st.ask.meta.name)}</b>. Saisissez son mot de passe (ou sa clé de récupération). Les données de cet appareil seront réunies avec celles du fichier, puis cet appareil utilisera le mot de passe du fichier.</div>
        <form class="form" data-form="sync-secret" style="margin-top:10px" autocomplete="off"><label>Mot de passe du fichier<input type="password" id="sy-secret" required></label><button class="btn primary" type="submit">Relier cet appareil</button><button class="btn" type="button" data-act="sync-cancel">Annuler</button></form></div>`;
      if (!l) return `<div class="card"><div class="card-h"><h2>Synchronisation Google Drive</h2><span class="chip neutral">Non relié</span></div>
        <div class="small">Le fichier chiffré est déposé dans votre dossier Drive partagé. Les deux appareils le lisent et l'écrivent automatiquement. Google ne voit qu'un contenu illisible.</div>
        ${st.msg ? `<p class="small" style="color:var(--bad)">${esc(st.msg)}</p>` : ""}
        <div style="display:grid;gap:8px;margin-top:12px">
          <button class="btn primary" data-act="sync-create">Premier appareil : créer le fichier dans le dossier partagé</button>
          <button class="btn" data-act="sync-existing">Autre appareil : ouvrir le fichier existant</button></div>
        <div class="small muted" style="margin-top:8px">Une fenêtre Google s'ouvre pour vous connecter, puis pour choisir le dossier ou le fichier. L'application ne voit que ce fichier, pas le reste de votre Drive.</div></div>`;
      return `<div class="card"><div class="card-h"><h2>Synchronisation Google Drive</h2>${s === "idle" ? `<span class="chip good">✓ Active</span>` : s === "auth" ? `<span class="chip warn">Connexion requise</span>` : s === "error" ? `<span class="chip bad">Erreur</span>` : `<span class="chip info">En cours…</span>`}</div>
        <dl class="kv"><dt>Fichier</dt><dd>${esc(l.fileName || "budget-a-deux.budget")}${l.folderName ? ` · dossier « ${esc(l.folderName)} »` : ""}</dd>
          <dt>Compte Google</dt><dd>${esc(l.email || "—")}</dd>
          <dt>Dernière synchro</dt><dd>${l.at ? new Date(l.at).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd></dl>
        ${s === "error" ? `<p class="small" style="color:var(--bad)">${esc(st.msg)}</p>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          ${s === "auth" ? `<button class="btn primary" data-act="sync-connect">Se connecter à Google</button>` : `<button class="btn primary" data-act="sync-now">Synchroniser maintenant</button>`}
          <button class="btn" data-act="sync-unlink">Désactiver sur cet appareil</button></div>
        <div class="small muted" style="margin-top:8px">Synchronisation automatique à l'ouverture, au retour sur l'application, après chaque modification et toutes les 2 minutes. Google demande de se reconnecter environ toutes les heures : un bouton apparaît alors dans le menu.</div></div>`;
    },
  };
})();

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S && Vault.isOpen()) Sync.now(); });
window.addEventListener("online", () => { if (S && Vault.isOpen()) Sync.now(); });
