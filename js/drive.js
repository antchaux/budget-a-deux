"use strict";
/* ==========================================================================
   Google Drive — connexion, choix du dossier ou du fichier, lecture/écriture.
   Portée « drive.file » : l'application ne voit que les fichiers qu'elle a créés
   ou que vous lui avez montrés avec le sélecteur Google. Le fichier est toujours
   l'enveloppe chiffrée : Google ne voit qu'un contenu illisible.
   ========================================================================== */
const Drive = (() => {
  const CFG = {
    clientId: "724735177228-5punjbth0l3242cf0q0k614gp7kkjhc0.apps.googleusercontent.com",
    apiKey: "AIzaSyA5LcNzpBoFkuRwoJVqycb6NcBYD2U6x0A",
    appId: "724735177228",
    scope: "https://www.googleapis.com/auth/drive.file",
    fileName: "budget-a-deux.budget",
  };
  const API = "https://www.googleapis.com/drive/v3/files", UP = "https://www.googleapis.com/upload/drive/v3/files";
  const LS = "driveLink";
  let token = null, tokenExp = 0, tokenClient = null, pending = null;

  /* Lien de cet appareil vers le fichier (aucune donnée financière : identifiant et version) */
  const getLink = () => { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch { return null; } };
  const setLink = v => { try { v ? localStorage.setItem(LS, JSON.stringify(v)) : localStorage.removeItem(LS); } catch {} };

  const loadScript = src => new Promise((ok, ko) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok;
    s.onerror = () => ko(new Error("Impossible de joindre Google. Vérifiez la connexion Internet.")); document.head.appendChild(s);
  });
  const gisReady = () => loadScript("https://accounts.google.com/gsi/client");
  const pickerReady = () => loadScript("https://apis.google.com/js/api.js").then(() => new Promise(ok => gapi.load("picker", ok)));
  // Préchargement : le bouton de connexion doit ouvrir la fenêtre Google sans délai (sinon le navigateur la bloque)
  const preload = () => gisReady().then(initClient).catch(() => {});

  function initClient(){
    if (tokenClient || !window.google?.accounts?.oauth2) return;
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CFG.clientId, scope: CFG.scope,
      callback: r => { const p = pending; pending = null;
        if (r.error){ p?.ko(new Error(r.error === "access_denied" ? "Accès à Google Drive refusé." : "Connexion Google impossible (" + r.error + ").")); return; }
        token = r.access_token; tokenExp = Date.now() + (r.expires_in - 120) * 1000;
        const l = getLink(); if (l && r.scope) setLink({ ...l, authorized: true });
        p?.ok(token); },
      error_callback: e => { const p = pending; pending = null; p?.ko(new Error(e.type === "popup_closed" ? "Fenêtre Google fermée avant la fin." : e.type === "popup_failed_to_open" ? "Le navigateur a bloqué la fenêtre Google. Touchez « Se connecter »." : "Connexion Google impossible.")); },
    });
  }
  /* À appeler directement dans un clic (geste de l'utilisateur) */
  function requestToken(){
    if (token && Date.now() < tokenExp) return Promise.resolve(token);
    initClient();
    if (!tokenClient) return gisReady().then(() => { initClient(); return requestToken(); });
    return new Promise((ok, ko) => { pending = { ok, ko }; const l = getLink();
      tokenClient.requestAccessToken({ prompt: l?.authorized ? "" : "consent", login_hint: l?.email || undefined }); });
  }
  const hasToken = () => !!token && Date.now() < tokenExp;

  async function call(url, opt = {}){
    if (!hasToken()) { const e = new Error("Connexion Google requise."); e.code = "AUTH"; throw e; }
    const r = await fetch(url, { ...opt, headers: { Authorization: "Bearer " + token, ...(opt.headers || {}) } });
    if (r.status === 401) { token = null; const e = new Error("Connexion Google expirée."); e.code = "AUTH"; throw e; }
    if (r.status === 404) { const e = new Error("Le fichier de synchronisation est introuvable sur Drive (supprimé ou accès retiré)."); e.code = "GONE"; throw e; }
    if (!r.ok) throw new Error("Google Drive a refusé la demande (" + r.status + ").");
    return r;
  }
  const api = {
    meta: id => call(`${API}/${id}?fields=id,name,version,modifiedTime,trashed,parents&supportsAllDrives=true`).then(r => r.json()),
    download: id => call(`${API}/${id}?alt=media&supportsAllDrives=true`).then(r => r.text()),
    update: (id, text) => call(`${UP}/${id}?uploadType=media&fields=id,name,version,modifiedTime&supportsAllDrives=true`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: text }).then(r => r.json()),
    create: (folderId, text) => {
      const b = "budget" + Math.random().toString(36).slice(2);
      const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: CFG.fileName, parents: folderId ? [folderId] : undefined, mimeType: "application/json" })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${b}--`;
      return call(`${UP}?uploadType=multipart&fields=id,name,version,modifiedTime&supportsAllDrives=true`, { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body }).then(r => r.json());
    },
    email: () => call("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)").then(r => r.json()).then(j => j.user?.emailAddress || null).catch(() => null),
  };

  /* Sélecteur Google : un dossier (premier appareil) ou le fichier existant (autre appareil) */
  async function pick(kind){
    await pickerReady();
    return new Promise((ok, ko) => {
      const P = google.picker;
      const views = kind === "folder"
        ? [new P.DocsView(P.ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true).setMimeTypes("application/vnd.google-apps.folder").setOwnedByMe(true),
           new P.DocsView(P.ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true).setMimeTypes("application/vnd.google-apps.folder").setOwnedByMe(false)]
        : [// 1. Parcourir les dossiers partagés avec moi (le dossier commun d'Antoine pour Amandine)
           new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setOwnedByMe(false).setLabel("Partagés avec moi"),
           // 2. Parcourir Mon Drive
           new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false).setOwnedByMe(true).setLabel("Mon Drive"),
           // 3. Recherche directe par nom
           new P.DocsView(P.ViewId.DOCS).setQuery("budget-a-deux").setIncludeFolders(false).setLabel("Recherche")];
      let b = new P.PickerBuilder().setOAuthToken(token).setDeveloperKey(CFG.apiKey).setAppId(CFG.appId).setLocale("fr")
        .setTitle(kind === "folder" ? "Choisissez votre dossier partagé" : `Choisissez le fichier ${CFG.fileName}`)
        .setCallback(d => { if (d.action === P.Action.PICKED) ok(d.docs[0]); else if (d.action === P.Action.CANCEL) ko(new Error("Aucun élément choisi.")); });
      views.forEach(v => b = b.addView(v));
      b.build().setVisible(true);
    });
  }

  return {
    CFG, api, getLink, setLink, preload, requestToken, hasToken, pick,
    linked: () => !!getLink()?.fileId,
    /* Premier appareil : créer le fichier dans le dossier choisi */
    async createIn(folder, text){
      const f = await api.create(folder.id, text);
      const email = await api.email();
      setLink({ fileId: f.id, fileName: f.name, folderName: folder.name, version: f.version, authorized: true, email });
      return f;
    },
    unlink(){ setLink(null); token = null; },
    _setTokenForTests(t){ token = t; tokenExp = Date.now() + 3600e3; },
  };
})();
