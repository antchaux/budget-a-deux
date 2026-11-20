"use strict";
/* ==========================================================================
   Écrans de verrouillage : création du coffre, déverrouillage, récupération,
   verrouillage automatique après inactivité.
   ========================================================================== */
const Lock = (() => {
  const AUTO_LOCK_MIN = 5;
  const el = () => document.getElementById("lock");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let onOpen = null, lastActivity = Date.now(), timer = null, mode = null;

  function show(html){
    const L = el(); L.innerHTML = `<div class="lock-card"><div class="lock-brand">Budget à deux</div>${html}</div>`;
    L.hidden = false; document.getElementById("app").hidden = true;
    L.querySelector("input")?.focus();
  }
  function hide(){ el().hidden = true; el().innerHTML = ""; document.getElementById("app").hidden = false; }
  function err(msg){ const e = el().querySelector(".lock-err"); if (e){ e.textContent = msg; e.hidden = !msg; } }
  function busy(on, label){ const b = el().querySelector("button[type=submit]"); if (b){ b.disabled = on; if (label) b.textContent = on ? "Un instant…" : label; } }
  const strong = p => p.length >= 10;

  /* ---------- Première ouverture : créer le mot de passe ---------- */
  function setupScreen(){
    mode = "setup";
    show(`<h1>Créer votre coffre</h1>
      <p>Vos données financières seront chiffrées sur cet appareil avec un mot de passe que vous partagez tous les deux. Personne d'autre, ni Google ni l'hébergeur, ne pourra les lire.</p>
      <form id="lk-form" autocomplete="off">
        <label>Mot de passe (10 caractères minimum)<input type="password" id="lk-p1" autocomplete="new-password" required minlength="10"></label>
        <label>Confirmer le mot de passe<input type="password" id="lk-p2" autocomplete="new-password" required></label>
        <p class="lock-err" hidden></p>
        <button class="btn primary" type="submit">Créer le coffre</button>
      </form>
      <p class="lock-alt">Vous avez déjà une sauvegarde ? <button class="link-btn" data-lk="restore">Restaurer un fichier</button></p>`);
  }
  function recoveryScreen(key, next){
    mode = "recovery-show";
    show(`<h1>Votre clé de récupération</h1>
      <p>Si vous oubliez le mot de passe, cette clé est le <b>seul</b> moyen de rouvrir vos données. Notez-la maintenant et gardez-la en lieu sûr, chacun de votre côté (gestionnaire de mots de passe, copie papier).</p>
      <div class="key" id="lk-key">${esc(key)}</div>
      <div class="lock-row"><button class="btn" type="button" data-lk="copy">Copier</button></div>
      <form id="lk-form"><label class="lock-check"><input type="checkbox" id="lk-ok" required> J'ai noté la clé de récupération en lieu sûr</label>
        <button class="btn primary" type="submit">Continuer</button></form>`);
    recoveryScreen.next = next;
  }
  /* ---------- Ouverture habituelle ---------- */
  function unlockScreen(msg){
    mode = "unlock";
    show(`<h1>Déverrouiller</h1>
      ${msg ? `<p class="lock-info">${esc(msg)}</p>` : ""}
      <form id="lk-form"><label>Mot de passe<input type="password" id="lk-p" autocomplete="current-password" required></label>
        <p class="lock-err" hidden></p>
        <button class="btn primary" type="submit">Ouvrir</button></form>
      <p class="lock-alt"><button class="link-btn" data-lk="forgot">Mot de passe oublié ?</button></p>`);
  }
  function forgotScreen(){
    mode = "forgot";
    show(`<h1>Mot de passe oublié</h1>
      <p>Saisissez la clé de récupération notée à la création du coffre. Vous choisirez ensuite un nouveau mot de passe.</p>
      <form id="lk-form" autocomplete="off"><label>Clé de récupération<input id="lk-r" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" required spellcheck="false" autocapitalize="characters"></label>
        <p class="lock-err" hidden></p>
        <button class="btn primary" type="submit">Rouvrir</button></form>
      <p class="lock-alt"><button class="link-btn" data-lk="back">Retour</button></p>`);
  }
  function newPasswordScreen(data){
    mode = "newpwd";
    show(`<h1>Nouveau mot de passe</h1>
      <p>Le coffre est ouvert. Choisissez le nouveau mot de passe que vous utiliserez tous les deux.</p>
      <form id="lk-form" autocomplete="off"><label>Nouveau mot de passe (10 caractères minimum)<input type="password" id="lk-p1" autocomplete="new-password" required minlength="10"></label>
        <label>Confirmer<input type="password" id="lk-p2" autocomplete="new-password" required></label>
        <p class="lock-err" hidden></p>
        <button class="btn primary" type="submit">Enregistrer et ouvrir</button></form>`);
    newPasswordScreen.data = data;
  }
  function restoreScreen(){
    mode = "restore";
    show(`<h1>Restaurer une sauvegarde</h1>
      <p>Choisissez un fichier de sauvegarde Budget à deux (.budget), puis saisissez son mot de passe ou sa clé de récupération.</p>
      <form id="lk-form" autocomplete="off"><label>Fichier<input type="file" id="lk-file" accept=".budget,application/json" required></label>
        <label>Mot de passe ou clé de récupération<input type="password" id="lk-s" required></label>
        <p class="lock-err" hidden></p>
        <button class="btn primary" type="submit">Restaurer</button></form>
      <p class="lock-alt"><button class="link-btn" data-lk="back">Retour</button></p>`);
  }

  function opened(data){ hide(); lastActivity = Date.now(); startTimer(); onOpen(data); }

  async function submit(e){
    e.preventDefault(); err("");
    const v = id => document.getElementById(id)?.value || "";
    try {
      if (mode === "setup" || mode === "newpwd"){
        const p1 = v("lk-p1"), p2 = v("lk-p2");
        if (!strong(p1)) return err("Le mot de passe doit contenir au moins 10 caractères.");
        if (p1 !== p2) return err("Les deux mots de passe ne sont pas identiques.");
        busy(true, mode === "setup" ? "Créer le coffre" : "Enregistrer et ouvrir");
        if (mode === "setup"){
          const data = Lock.initialData();
          const key = await Vault.create(p1, data);
          recoveryScreen(key, () => opened(data));
        } else { await Vault.setPassword(p1); opened(newPasswordScreen.data); }
      } else if (mode === "recovery-show"){
        if (!document.getElementById("lk-ok").checked) return;
        recoveryScreen.next();
      } else if (mode === "unlock"){
        busy(true, "Ouvrir"); opened(await Vault.unlock(v("lk-p")));
      } else if (mode === "forgot"){
        busy(true, "Rouvrir"); newPasswordScreen(await Vault.unlockWithRecovery(v("lk-r")));
      } else if (mode === "restore"){
        const f = document.getElementById("lk-file").files[0]; if (!f) return err("Choisissez un fichier.");
        busy(true, "Restaurer"); opened(await Vault.importFile(await f.text(), v("lk-s")));
      }
    } catch (x) {
      err(x.message || "Une erreur est survenue."); busy(false, ({setup:"Créer le coffre",unlock:"Ouvrir",forgot:"Rouvrir",restore:"Restaurer",newpwd:"Enregistrer et ouvrir"})[mode]);
    }
  }
  function clicks(e){
    const b = e.target.closest("[data-lk]"); if (!b) return;
    const a = b.dataset.lk;
    if (a === "forgot") forgotScreen();
    else if (a === "restore") restoreScreen();
    else if (a === "back") Vault.exists().then(x => x ? unlockScreen() : setupScreen());
    else if (a === "copy"){ const t = document.getElementById("lk-key").textContent;
      try { navigator.clipboard.writeText(t).then(() => b.textContent = "Copiée", () => {}); } catch {} }
  }

  /* ---------- Verrouillage automatique ---------- */
  function startTimer(){
    clearInterval(timer);
    timer = setInterval(() => { if (Vault.isOpen() && Date.now() - lastActivity > AUTO_LOCK_MIN * 60000) Lock.lockNow("Verrouillé après 5 minutes d'inactivité."); }, 15000);
  }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(ev => document.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Vault.isOpen() && Date.now() - lastActivity > AUTO_LOCK_MIN * 60000) Lock.lockNow("Verrouillé après 5 minutes d'inactivité.");
  });

  return {
    AUTO_LOCK_MIN,
    initialData: () => ({}),
    async start(cb){
      onOpen = cb;
      el().addEventListener("submit", submit);
      el().addEventListener("click", clicks);
      if (!window.crypto?.subtle) return show(`<h1>Navigateur non compatible</h1><p>Le chiffrement nécessite une page sécurisée (https). Ouvrez l'application depuis son adresse https.</p>`);
      (await Vault.exists()) ? unlockScreen() : setupScreen();
    },
    async lockNow(msg){ if (Lock.beforeLock) await Lock.beforeLock(); Vault.lock(); clearInterval(timer); unlockScreen(msg); },
    showRecovery: recoveryScreen,
  };
})();
