"use strict";
/* ==========================================================================
   Coffre chiffré — Budget à deux
   - Une clé de données aléatoire (AES-GCM 256 bits) chiffre toutes les données.
   - Cette clé est enveloppée deux fois :
       1. par une clé dérivée du mot de passe (PBKDF2-SHA-256, 600 000 itérations) ;
       2. par une clé dérivée de la clé de récupération (24 caractères aléatoires).
   - Oublier le mot de passe ne fait rien perdre : la clé de récupération rouvre
     le coffre et permet d'en choisir un nouveau.
   - Rien n'est jamais stocké en clair : IndexedDB et le fichier de sauvegarde
     ne contiennent que l'enveloppe chiffrée.
   ========================================================================== */
const Vault = (() => {
  const ITER = 600000, ITER_RECOVERY = 100000, VERSION = 1;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));

  /* --- Clé de récupération : 24 caractères sans ambiguïté (pas de 0/O, 1/I/L) --- */
  const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function newRecoveryKey(){
    const r = rand(24); let s = "";
    for (let i = 0; i < 24; i++) s += ALPHA[r[i] % ALPHA.length];
    return s.match(/.{4}/g).join("-");
  }
  const normRecovery = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  async function kek(secret, salt, iter){
    const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
      base, { name: "AES-KW", length: 256 }, false, ["wrapKey", "unwrapKey"]);
  }
  async function wrap(dataKey, secret, iter){
    const salt = rand(16);
    const w = await crypto.subtle.wrapKey("raw", dataKey, await kek(secret, salt, iter), "AES-KW");
    return { salt: b64(salt), iter, key: b64(w) };
  }
  async function unwrap(slot, secret){
    const k = await kek(secret, unb64(slot.salt), slot.iter);
    return crypto.subtle.unwrapKey("raw", unb64(slot.key), k, "AES-KW",
      { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  }
  async function seal(dataKey, obj){
    const iv = rand(12);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dataKey, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function open(dataKey, box){
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, dataKey, unb64(box.ct));
    return JSON.parse(dec.decode(pt));
  }

  /* --- IndexedDB : une seule entrée « vault » --- */
  const DB = "budget-a-deux", STORE = "kv";
  function idb(){
    return new Promise((ok, ko) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
    });
  }
  async function idbGet(k){ const db = await idb(); return new Promise((ok, ko) => { const r = db.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); }
  async function idbSet(k, v){ const db = await idb(); return new Promise((ok, ko) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, k); t.oncomplete = () => ok(); t.onerror = () => ko(t.error); }); }
  async function idbDel(k){ const db = await idb(); return new Promise((ok, ko) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).delete(k); t.oncomplete = () => ok(); t.onerror = () => ko(t.error); }); }

  let dataKey = null, envelope = null;

  return {
    newRecoveryKey,
    async exists(){ return !!(await idbGet("vault")); },
    isOpen: () => !!dataKey,
    /* Création : renvoie la clé de récupération à montrer une seule fois */
    async create(password, data){
      dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const recovery = newRecoveryKey();
      envelope = { app: "budget-a-deux", v: VERSION,
        pwd: await wrap(dataKey, password, ITER), rec: await wrap(dataKey, normRecovery(recovery), ITER_RECOVERY),
        updated: new Date().toISOString(), keysUpdated: Date.now(), box: await seal(dataKey, data) };
      await idbSet("vault", envelope);
      return recovery;
    },
    async unlock(password){
      envelope = envelope || await idbGet("vault");
      try { dataKey = await unwrap(envelope.pwd, password); }
      catch { dataKey = null; throw new Error("Mot de passe incorrect."); }
      return open(dataKey, envelope.box);
    },
    async unlockWithRecovery(recovery){
      envelope = envelope || await idbGet("vault");
      try { dataKey = await unwrap(envelope.rec, normRecovery(recovery)); }
      catch { dataKey = null; throw new Error("Clé de récupération incorrecte."); }
      return open(dataKey, envelope.box);
    },
    async setPassword(password){
      envelope.pwd = await wrap(dataKey, password, ITER); envelope.keysUpdated = Date.now();
      await idbSet("vault", envelope);
    },
    async newRecovery(){
      const recovery = newRecoveryKey();
      envelope.rec = await wrap(dataKey, normRecovery(recovery), ITER_RECOVERY); envelope.keysUpdated = Date.now();
      await idbSet("vault", envelope);
      return recovery;
    },
    async save(data){
      if (!dataKey) return;
      envelope.box = await seal(dataKey, data);
      envelope.updated = new Date().toISOString();
      await idbSet("vault", envelope);
    },
    lock(){ dataKey = null; },
    async destroy(){ dataKey = null; envelope = null; await idbDel("vault"); },
    /* Fichier de sauvegarde : l'enveloppe telle quelle (toujours chiffrée) */
    exportFile(){ return JSON.stringify(envelope); },
    /* Restaurer un fichier : il faut son mot de passe ou sa clé de récupération */
    async importFile(text, secret){
      let env;
      try { env = JSON.parse(text); } catch { throw new Error("Ce fichier n'est pas une sauvegarde de Budget à deux."); }
      if (env.app !== "budget-a-deux" || !env.box) throw new Error("Ce fichier n'est pas une sauvegarde de Budget à deux.");
      let k;
      try { k = await unwrap(env.pwd, secret); }
      catch { try { k = await unwrap(env.rec, normRecovery(secret)); } catch { throw new Error("Mot de passe ou clé de récupération incorrect pour ce fichier."); } }
      const data = await open(k, env.box);
      dataKey = k; envelope = env; await idbSet("vault", envelope);
      return data;
    },
    updated: () => envelope?.updated || null,
    /* Synchronisation : lire une enveloppe distante avec la clé déjà ouverte.
       Le mot de passe et la clé de récupération les plus récents sont adoptés. */
    async openRemote(text){
      let env; try { env = JSON.parse(text); } catch { throw new Error("Le fichier Drive est illisible."); }
      if (env.app !== "budget-a-deux" || !env.box) throw new Error("Le fichier Drive n'est pas un fichier Budget à deux.");
      let data;
      try { data = await open(dataKey, env.box); }
      catch { const e = new Error("Le fichier Drive a été chiffré avec un autre coffre. Rouvrez-le depuis Paramètres › Synchronisation."); e.code = "KEY"; throw e; }
      if ((env.keysUpdated || 0) > (envelope.keysUpdated || 0)){ envelope.pwd = env.pwd; envelope.rec = env.rec; envelope.keysUpdated = env.keysUpdated; await idbSet("vault", envelope); }
      return data;
    },
    /* Déchiffrer un fichier avec un secret sans toucher au coffre local (pour fusionner) */
    async peekFile(text, secret){
      let env; try { env = JSON.parse(text); } catch { throw new Error("Ce fichier n'est pas une sauvegarde de Budget à deux."); }
      if (env.app !== "budget-a-deux" || !env.box) throw new Error("Ce fichier n'est pas une sauvegarde de Budget à deux.");
      let k;
      try { k = await unwrap(env.pwd, secret); }
      catch { try { k = await unwrap(env.rec, normRecovery(secret)); } catch { throw new Error("Mot de passe ou clé de récupération incorrect pour ce fichier."); } }
      return { env, key: k, data: await open(k, env.box) };
    },
    /* Adopter les clés d'un fichier (le coffre de cet appareil devient celui du fichier) */
    async adopt(peek, data){
      dataKey = peek.key; envelope = { ...peek.env, box: await seal(dataKey, data), updated: new Date().toISOString() };
      await idbSet("vault", envelope);
    },
  };
})();
