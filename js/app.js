"use strict";
/* ============ Utilitaires ============ */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = new Intl.NumberFormat("fr-CA",{style:"currency",currency:"CAD"});
const fmt = n => money.format(Math.abs(n) < 0.005 ? 0 : n);
const fmt0 = n => new Intl.NumberFormat("fr-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0}).format(n);
const r2 = n => Math.round(n*100)/100;
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const monthLabel = k => { const [y,m]=k.split("-"); const s = MONTHS[+m-1]; return s[0].toUpperCase()+s.slice(1)+" "+y; };
const mk = d => d.slice(0,7);
const daysIn = k => { const [y,m]=k.split("-").map(Number); return new Date(y,m,0).getDate(); };
const pad = n => String(n).padStart(2,"0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
const dayDiff = (a,b) => Math.round((Date.parse(a)-Date.parse(b))/864e5);
// Identifiants uniques, stables d'une session à l'autre
const nid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const deaccent = s => String(s??"").normalize("NFD").replace(/[̀-ͯ]/g,"");
const norm = s => deaccent(s).toLowerCase().replace(/[’']/g,"'").replace(/\s+/g," ").trim();

/* ============ Catégories (reprises du fichier Excel) ============ */
const GROUPS = [
  {id:"oblig",name:"Obligatoire",slot:1},
  {id:"sante",name:"Santé et sport",slot:3},
  {id:"loisirs",name:"Divertissement",slot:2},
  {id:"autres",name:"Autres dépenses",slot:7},
];
const CATS = [
  {id:"loyer",name:"Loyer",g:"oblig",fixed:true},{id:"hydro",name:"Hydro",g:"oblig"},{id:"ass_hab",name:"Assurance habitation",g:"oblig",fixed:true},
  {id:"ass_sante",name:"Assurance santé",g:"oblig",fixed:true},{id:"telephone",name:"Téléphone",g:"oblig",fixed:true},{id:"internet",name:"Internet",g:"oblig",fixed:true},
  {id:"courses",name:"Courses",g:"oblig"},{id:"transport",name:"Transports en commun",g:"oblig"},{id:"communauto",name:"Communauto",g:"oblig"},
  {id:"habits",name:"Habits",g:"oblig"},{id:"soins",name:"Coiffure/soins esthétiques",g:"oblig"},{id:"permis",name:"Permis de conduire",g:"oblig"},
  {id:"chien",name:"Chien",g:"oblig"},
  {id:"psy",name:"Psy",g:"sante"},{id:"sante",name:"Santé",g:"sante"},{id:"sport",name:"Sport",g:"sante"},
  {id:"divert",name:"Divertissement",g:"loisirs",subs:["Jeux vidéo","Cinéma/théâtre","Concerts/spectacles","Livres"]},
  {id:"tcg",name:"TCG",g:"loisirs"},{id:"cadeaux",name:"Cadeaux",g:"loisirs"},
  {id:"resto",name:"Restaurants",g:"loisirs",always:true},{id:"bar",name:"Alcool/Bar",g:"loisirs",always:true},
  {id:"abonn",name:"Abonnements",g:"loisirs",subs:["Amazon Prime","Disney+","YouTube Premium","Deezer"]},
  {id:"voyage",name:"Voyage",g:"loisirs"},
  {id:"appart",name:"Dépenses appart",g:"autres"},{id:"chalet",name:"Chalet",g:"autres"},{id:"cig",name:"Cigarettes",g:"autres"},
  {id:"dons",name:"Dons (œuvres de charité)",g:"autres",fixed:true},{id:"job",name:"Job",g:"autres"},{id:"formation",name:"Formation",g:"autres"},
  {id:"frais_cc",name:"Frais cartes de crédit",g:"autres"},{id:"frais_gest",name:"Frais de gestion",g:"autres"},{id:"autres",name:"Autres",g:"autres"},
  {id:"exc",name:"Dépenses exceptionnelles",g:"exc"},
];
CATS.forEach(c=>c.subs=c.subs||[]);
const REV = [{id:"salaire",name:"Salaire"},{id:"bonus",name:"Bonus"},{id:"reer",name:"REER"},{id:"impot",name:"Retours d'impôt"},{id:"dividendes",name:"Dividendes"},{id:"r_cadeaux",name:"Cadeaux reçus"},{id:"rembours",name:"Remboursements"},{id:"assurances",name:"Assurances"},{id:"r_autres",name:"Autres revenus"}];
const EPARGNE = [{id:"celiapp",name:"CeliApp"},{id:"matelas",name:"Matelas de sécurité",virtual:true}];
const catById = id => CATS.find(c=>c.id===id) || REV.find(c=>c.id===id) || EPARGNE.find(c=>c.id===id);
const catName = id => catById(id)?.name || "—";
const groupOf = id => GROUPS.find(g=>g.id===CATS.find(c=>c.id===id)?.g);
const TYPES = {
  depense:{l:"Dépense",count:true}, frais:{l:"Frais bancaires",count:true}, retrait:{l:"Retrait comptant",count:true},
  remboursement:{l:"Remboursement marchand",count:true}, revenu:{l:"Revenu",count:false}, interet:{l:"Intérêt reçu",count:false},
  paiement_carte:{l:"Paiement de carte",count:false}, transfert:{l:"Transfert entre comptes",count:false},
  epargne:{l:"Épargne",count:false}, reglement:{l:"Règlement entre nous",count:false}, interac:{l:"Virement Interac ?",count:false}
};
const counts = t => TYPES[t.type]?.count && t.status !== "ignore";

let S;
function freshState(){
  return {
    names:{A:"Antoine",B:"Amandine"},
    accounts:[
      {id:"a-chq",owner:"A",kind:"cheque",name:"Chèque",last4:null,opening:null,bank:null},
      {id:"a-cc",owner:"A",kind:"carte",name:"Carte de crédit",last4:null},
      {id:"b-chq",owner:"B",kind:"cheque",name:"Chèque",last4:null,opening:null,bank:null},
      {id:"b-cc",owner:"B",kind:"carte",name:"Carte de crédit",last4:null},
      {id:"a-cash",owner:"A",kind:"autre",name:"Comptant / autre",last4:null},
      {id:"b-cash",owner:"B",kind:"autre",name:"Comptant / autre",last4:null},
    ],
    // Commun = 100 % de la dépense ; la vue de chacun ajoute 50 % du commun à son budget perso. Rempli par l'Excel ou à la main.
    budgets:{commun:{},A:{},B:{}},
    savings:{A:{celiapp:8000,matelas:1200},B:{celiapp:0,matelas:0}}, // épargne : objectif annuel réparti sur 12 mois
    openingDebt:{date:"2026-01-01",amount:1124.94}, // positif = B doit à A (solde au 31 décembre 2025)
    excelDebts:null,
    excAnnual:0,
    catMode:{soins:"annee",permis:"annee"},
    salary:{A:0,B:0}, // salaire annuel net
    events:[], // suivi annuel des catégories ponctuelles
    tx:[], rules:{}, imports:[], history:[], historyFile:null,
    planned:[],
    threshold:80, lastBackup:null,
  };
}
const acc = id => S.accounts.find(a=>a.id===id);
const accLabel = a => `${a.name} ${S.names[a.owner]}${a.last4?" ····"+a.last4:""}`;
const budLabel = b => b==="commun"?"Commun":S.names[b];
const other = p => p==="A"?"B":"A";

/* ============ Catégorisation ============ */
function merchantOf(kind, desc, sub){
  let s = (kind==="cheque" && /^(achat pdv|pmt facture)$/i.test(String(desc).trim())) ? sub : (kind==="cheque" ? desc+" "+sub : desc);
  return norm(s).replace(/^(fpos|gpos|apos|pos)\s+/,"").replace(/sq \*/g,"").replace(/#\s?\d+/g,"").replace(/\(tx\. incl\.\)/,"")
       .replace(/\d{4,}/g,"").replace(/\s+montr$/,"").replace(/\s+/g," ").trim();
}
const isInterac = m => /interac/.test(m);
const txMerchant = t => merchantOf(acc(t.acc)?.kind||"carte", t.desc, t.sub);

const KW = [
  [/maxi|metro|iga|provigo|super c|marche|epicerie|intermarche|meat market|boucherie|boulangerie|patisserie|merveilleux|soares|rachel berri/, "courses","commun",85],
  [/pharmaprix|jean coutu|uniprix|familiprix/, "courses","commun",70],
  [/uber eats|doordash/, "resto","commun"],
  [/restaurant|resto|tapa|bistro|brunch|ibericos|pizzeria|sushi|thai|a&w|mcdo|burger/, "resto","commun"],
  [/cafe |cafe$|starbucks|tim hortons/, "resto",null],
  [/ bar|^bar|pub|brasserie|brasseurs|cabaret|rhumerie|siboire|saq|st sacrement|bieres/, "bar","commun"],
  [/communauto/, "communauto",null,85],
  [/stm|opus|bixi|uber|exo /, "transport",null,80],
  [/fizz|videotron|bell|rogers|koodo/, "telephone",null,75],
  [/librairie|renaud|archambault|cinema|theatre/, "divert",null,85],
  [/spotify|netflix|disney|deezer|google|youtube|amazon prime/, "abonn",null,80],
  [/hydro/, "hydro","commun",90],
  [/desjardins/, "ass_hab","commun",80],
  [/equiterre|fondation|centraide/, "dons",null,90],
  [/simons|uniqlo|winners|old navy/, "habits",null,85],
  [/atelier 100|coiffure|ongles/, "soins",null,80],
  [/ikea|home depot|canadian tire|rona|flexispot/, "appart","commun",75],
  [/ryanair|vueling|air canada|hotel|airbnb/, "voyage","commun",70],
];

/* Règles apprises : commerçant -> exemples {montant, catégorie, budget, n} */
function ruleFor(m, amount, owner){
  const raw = S.rules[m]; if (!raw || !raw.length) return null;
  const L = raw.map(e=>({...e,budget:e.budget==="self"?owner:e.budget}));
  const exact = L.find(e=>Math.abs(e.amount-Math.abs(amount))<0.005);
  const cats = new Set(L.map(e=>e.cat+"|"+e.budget));
  if (exact) return {...exact, conf:100, why: cats.size>1 ? `Appris : ${fmt(exact.amount)} chez ce commerçant = ${catName(exact.cat)}` : "Appris de vos corrections"};
  const best = L.slice().sort((a,b)=>b.n-a.n)[0];
  return {...best, conf: cats.size>1 ? 70 : 100, why: cats.size>1 ? `Commerçant classé de plusieurs façons, le plus souvent ${catName(best.cat)}` : "Appris de vos corrections"};
}
function interacHistory(owner, amount){
  return S.tx.filter(t=>t.status==="ok" && acc(t.acc)?.owner===owner && isInterac(txMerchant(t)) && Math.abs(Math.abs(t.amount)-Math.abs(amount))<0.005 && t.type!=="interac")
    .sort((a,b)=>b.date.localeCompare(a.date));
}
function classify(row, account){
  const kind = account?.kind || row.kind, owner = account?.owner || "A";
  const d = norm(row.desc+" "+row.sub);
  const m = merchantOf(kind,row.desc,row.sub);
  const capped = c => Math.min(c, S.threshold-1);
  if (/pai\. carte|paiement du/.test(d)) return {type:"paiement_carte",cat:null,budget:null,conf:100,why:"Paiement de carte reconnu"};
  if (/achat placement|placement|celi/.test(d)) return {type:"epargne",cat:"celiapp",budget:owner,conf:100,why:"Placement reconnu (CeliApp)"};
  if (/salaire|paye/.test(d)) return {type:"revenu",cat:"salaire",budget:owner,conf:100,why:"Salaire reconnu"};
  if (isInterac(m)){
    // Toujours à valider : on propose la catégorie des virements récurrents du même montant
    const h = interacHistory(owner,row.amount);
    if (h.length){ const t=h[0]; const gaps = h.slice(0,4).map((x,i,a)=>i?dayDiff(a[i-1].date,x.date):null).filter(Boolean);
      const rythme = gaps.length && gaps.every(g=>Math.abs(g-gaps[0])<=2) ? (Math.abs(gaps[0]-7)<=1?"chaque semaine":Math.abs(gaps[0]-14)<=2?"aux deux semaines":gaps[0]>=27&&gaps[0]<=32?"chaque mois":`tous les ${gaps[0]} jours`) : null;
      return {type:t.type,cat:t.cat,subcat:t.subcat,budget:t.budget,conf:capped(75),why:`Récurrent : ${h.length} virement(s) de ${fmt(Math.abs(row.amount))}${rythme?" "+rythme:""}, classés « ${t.type==="reglement"?"Règlement entre nous":catName(t.cat)} ». À confirmer.`}; }
    return {type:"interac",cat:null,budget:null,conf:0,why:"Virement Interac : destinataire absent du CSV"};
  }
  const r = ruleFor(m,row.amount,owner);
  if (r){ const c = catById(r.cat); return {type:r.type,cat:r.cat,subcat:r.subcat,budget:r.budget,conf:c?.always?capped(r.conf):r.conf,why:c?.always?`${c.name} : catégorie à confirmer à chaque fois`:r.why}; }
  if (/frais annuels|protection carte/.test(d)) return {type:"frais",cat:"frais_cc",budget:owner,conf:95,why:"Frais de carte reconnus"};
  if (/frais mensuels|frais de service|frais gestion/.test(d)) return {type:"frais",cat:"frais_gest",budget:owner,conf:95,why:"Frais de gestion reconnus"};
  if (/interets?/.test(d)) return {type:"frais",cat:"frais_cc",budget:owner,conf:95,why:"Intérêts"};
  if (/^gab|guichet/.test(d)) return {type:"retrait",cat:"autres",budget:owner,conf:85,why:"Retrait au guichet"};
  if (row.amount > 0) return {type: kind==="carte"?"remboursement":"revenu",cat:kind==="carte"?null:"rembours",budget:owner,conf:40,why:"Crédit à identifier"};
  for (const [re,cat,bud,conf] of KW){
    if (re.test(m)){ const c=catById(cat);
      return {type:"depense",cat,budget:bud||owner,conf:c.always?capped(70):(conf||85),why:c.always?`${c.name} : catégorie à confirmer à chaque fois`:"Mot-clé reconnu"}; }
  }
  return {type:"depense",cat:null,budget:owner,conf:0,why:"Commerçant inconnu"};
}
function applyClass(t){
  const c = classify(t, acc(t.acc));
  Object.assign(t,{type:c.type,cat:c.cat,subcat:c.subcat||null,budget:c.budget,conf:c.conf,why:c.why});
  t.status = c.conf >= S.threshold ? "ok" : "avalider";
  return t;
}
function learnFrom(t){
  const m = txMerchant(t); if (isInterac(m) || t.type==="paiement_carte") return 0;
  const L = S.rules[m] = S.rules[m] || []; const amt = r2(Math.abs(t.amount));
  const bud = t.budget===acc(t.acc).owner ? "self" : t.budget; // « self » = la personne qui paie
  const same = L.find(e=>Math.abs(e.amount-amt)<0.005);
  if (same) Object.assign(same,{type:t.type,cat:t.cat,subcat:t.subcat,budget:bud,n:same.n+1});
  else L.push({amount:amt,type:t.type,cat:t.cat,subcat:t.subcat,budget:bud,n:1});
  if (catById(t.cat)?.always) return 0;
  let n=0;
  for (const o of S.tx){ if (o!==t && o.status==="avalider" && txMerchant(o)===m){ applyClass(o); if(o.status==="ok") n++; } }
  return n;
}

/* ============ Données d'exemple ============ */
/* ============ Calculs ============ */
const monthsAvailable = () => { const s = new Set(S.tx.map(t=>mk(t.date))); s.add(mk(TODAY)); return [...s].sort(); };
const lastDataMonth = () => S.tx.map(t=>mk(t.date)).sort().at(-1) || mk(TODAY);
const shiftMonth = (m,d) => { const [y,mo]=m.split("-").map(Number); const t=new Date(y,mo-1+d,1); return `${t.getFullYear()}-${pad(t.getMonth()+1)}`; };
const MSHORT = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
function pickerHtml(m){
  const y = +(UI.pickYear || m.slice(0,4)); const has = new Set(S.tx.map(t=>mk(t.date)));
  return `<div class="mpick" role="dialog" aria-label="Choisir un mois">
    <div class="mp-head"><button class="icon-btn" data-act="py-prev" aria-label="Année précédente">‹</button><b class="num">${y}</b><button class="icon-btn" data-act="py-next" aria-label="Année suivante">›</button></div>
    <div class="mp-grid">${MSHORT.map((n,i)=>{ const k=`${y}-${pad(i+1)}`; return `<button class="mp-m${k===m?" sel":""}${has.has(k)?" data":""}${k===mk(TODAY)?" now":""}" data-pick="${k}" aria-label="${monthLabel(k)}${has.has(k)?", avec des données":""}">${n}</button>`; }).join("")}</div>
    <div class="mp-foot small muted"><span class="mp-dot"></span> mois avec des transactions</div></div>`;
}
const spendOf = t => -t.amount;
const monthTx = m => S.tx.filter(t=>mk(t.date)===m);
/* Part d'une transaction dans une vue : Commun = 100 % des communes ; personne = 100 % de ses dépenses perso + 50 % des communes */
function shareIn(t, scope){
  if (scope==="commun") return t.budget==="commun" ? 1 : 0;
  if (t.budget===scope) return 1;
  if (t.budget==="commun") return 0.5;
  return 0;
}
function budgetFor(scope, cat){
  const c = S.budgets.commun[cat]||0;
  return scope==="commun" ? c : (S.budgets[scope][cat]||0) + c/2;
}
/* Ordre des catégories : celui de la page Budgets (groupe, puis position), utilisé partout */
const orderedCats = () => [...GROUPS.flatMap(g=>CATS.filter(c=>c.g===g.id)), ...CATS.filter(c=>c.g==="exc")];
const budgetCats = () => orderedCats().filter(c=>c.id!=="exc");
function moveCat(id, targetId, after, groupId){
  const i = CATS.findIndex(c=>c.id===id); if (i<0 || id===targetId) return false;
  const [c] = CATS.splice(i,1);
  if (targetId){ const t = CATS.findIndex(x=>x.id===targetId); CATS.splice(t+(after?1:0),0,c); c.g = CATS.find(x=>x.id===targetId).g; }
  else { c.g = groupId; CATS.push(c); }
  S.catOrder = CATS.map(x=>({id:x.id,g:x.g}));
  return true;
}
function stepCat(id, dir){
  const L = budgetCats(), i = L.findIndex(c=>c.id===id), c = L[i], t = L[i+dir]; if (!t) return false;
  // Dans le même groupe : on échange ; à la frontière : on passe en fin (ou en tête) du groupe voisin
  return t.g===c.g ? moveCat(id, t.id, dir>0, null) : moveCat(id, t.id, dir<0, null);
}
const budgetTotal = scope => budgetCats().reduce((s,c)=>s+budgetFor(scope,c.id),0);
function monthProgress(m){ if (m < mk(TODAY)) return 1; if (m > mk(TODAY)) return 0; return (+TODAY.slice(8,10)) / daysIn(m); }
const isAnnual = id => S.catMode?.[id]==="annee";
/* Dépenses d'une catégorie pour une vue, du 1er janvier jusqu'à la fin du mois donné */
function ytdOf(cat, scope, m){
  const y=m.slice(0,4); return r2(S.tx.filter(t=>counts(t)&&t.cat===cat&&t.date>=`${y}-01-01`&&mk(t.date)<=m).reduce((s,t)=>s+spendOf(t)*shareIn(t,scope),0));
}
const prevMonth = m => { const [y,mo]=m.split("-").map(Number); return mo===1 ? null : `${y}-${pad(mo-1)}`; };
function stats(m, scope){
  const tx = monthTx(m).filter(t=>counts(t) && t.cat!=="exc" && shareIn(t,scope)>0);
  const byCat = {}, actual = {}; let spent=0, fromCommun=0;
  for (const t of tx){ const v = spendOf(t)*shareIn(t,scope); const k=t.cat||"autres"; actual[k]=(actual[k]||0)+v;
    if (isAnnual(k)) continue; byCat[k]=(byCat[k]||0)+v; spent+=v; if (scope!=="commun"&&t.budget==="commun") fromCommun+=v; }
  // Suivi annuel : chaque mois compte 1/12 du budget annuel (provision), plus tout dépassement de l'enveloppe annuelle
  const annual = {}; let prov=0;
  for (const c of budgetCats().filter(c=>isAnnual(c.id))){
    const mb = budgetFor(scope,c.id), yb = mb*12, ytd = ytdOf(c.id,scope,m), pm = prevMonth(m), ytdPrev = pm ? ytdOf(c.id,scope,pm) : 0;
    const over = Math.max(0,ytd-yb) - Math.max(0,ytdPrev-yb);
    if (!mb && !ytd) continue;
    annual[c.id] = {ytd, yb, month:r2(actual[c.id]||0), contrib:r2(mb+over)}; prov += mb+over;
  }
  const reserve = scope!=="commun" ? r2(EPARGNE.reduce((s,e)=>s+(S.savings[scope]?.[e.id]||0),0)/12) : 0;
  const budget = budgetTotal(scope)+reserve, p = monthProgress(m);
  const proj = (p>0&&p<1?spent/p:spent)+prov+reserve;
  return {byCat,actual,annual,prov:r2(prov),spent:r2(spent+prov+reserve),fromCommun:r2(fromCommun),reserve,budget,p,proj:r2(proj)};
}
/* Vue annuelle : dépenses réelles de l'année (catégories annuelles comprises), épargne réservée selon les mois écoulés */
function yearStats(y, scope){
  const curY = TODAY.slice(0,4), cur = y===curY;
  const p = cur ? (+TODAY.slice(5,7)-1 + (+TODAY.slice(8,10))/daysIn(mk(TODAY)))/12 : (y<curY ? 1 : 0);
  const mc = cur ? +TODAY.slice(5,7) : (y<curY ? 12 : 0);
  const tx = S.tx.filter(t=>t.date.startsWith(y) && counts(t) && t.cat!=="exc" && shareIn(t,scope)>0);
  const byCat = {}; let spent=0, fromCommun=0;
  for (const t of tx){ const v = spendOf(t)*shareIn(t,scope); const k=t.cat||"autres"; byCat[k]=(byCat[k]||0)+v; spent+=v; if (scope!=="commun"&&t.budget==="commun") fromCommun+=v; }
  const savAnnual = scope!=="commun" ? EPARGNE.reduce((s,e)=>s+(S.savings[scope]?.[e.id]||0),0) : 0;
  const reserve = r2(savAnnual/12*mc);
  const budget = budgetTotal(scope)*12 + savAnnual;
  const proj = cur && p>0 ? spent/p + savAnnual : spent + reserve;
  const months = Array.from({length:12},(_,i)=>{ const k=`${y}-${pad(i+1)}`; return {k, future: k>mk(TODAY), st: k>mk(TODAY)?null:stats(k,scope)}; });
  return {byCat,actual:byCat,annual:{},prov:0,spent:r2(spent+reserve),fromCommun:r2(fromCommun),reserve,budget,p,proj:r2(proj),mc,months};
}
function settlement(until){
  // positif = B doit à A
  const od = S.openingDebt; let bal = od && (!until || until>=od.date) ? od.amount : 0;
  for (const t of S.tx){
    if (t.status==="ignore" || (until && t.date>until) || (od && t.date<od.date)) continue;
    const owner = acc(t.acc)?.owner;
    if (counts(t) && t.budget && t.budget!==owner){
      const share = t.budget==="commun" ? spendOf(t)/2 : spendOf(t); // pour l'autre : 100 %
      bal += owner==="A" ? share : -share;
    }
    if (t.type==="reglement" && t.amount<0) bal += owner==="B" ? t.amount : -t.amount;
  }
  return r2(bal);
}
function recon(a){
  if (!a.opening) return null;
  const sum = S.tx.filter(t=>t.acc===a.id && t.date>=a.opening.date && t.status!=="ignore").reduce((s,t)=>s+t.amount,0);
  const computed = r2(a.opening.amount + sum);
  return {computed, bank:a.bank?.balance ?? null, gap: a.bank ? r2(a.bank.balance - computed) : null};
}
const toValidate = () => S.tx.filter(t=>t.status==="avalider");
const excUsedYTD = (yr) => { const y = yr || TODAY.slice(0,4); return r2(S.tx.filter(t=>t.cat==="exc"&&counts(t)&&t.date.startsWith(y)).reduce((s,t)=>s+spendOf(t),0)); };
const stateOf = pct => pct>100.5?"bad":pct>=90?"warn":"good";

/* ============ Historique Excel ============ */
const MONTH_SHEETS = MONTHS.map(m=>norm(m));
function mapCat(name, list){
  const n = norm(name); if (!n) return null;
  const hit = list.find(c=>norm(c.name)===n || norm(c.name).replace(/\s*\(.*\)/,"")===n);
  if (hit) return hit.id;
  const alias = {"assurance habitation":"ass_hab","dons":"dons","celiapp":"celiapp","celiap":"celiapp","retours d'impot":"impot","retour d'impots":"impot","cadeaux":list===REV?"r_cadeaux":"cadeaux","autres":list===REV?"r_autres":"autres"}[n];
  return alias && list.some(c=>c.id===alias) ? alias : null;
}
function personOf(v){ const n=norm(v); if (!n) return null; if (/nous|commun|2$/.test(n)) return "commun"; if (n===norm(S.names.A)) return "A"; if (n===norm(S.names.B)) return "B"; return null; }
/* sheets : { nomFeuille: tableau de lignes } (lu par SheetJS dans le navigateur) */
function readHistory(sheets, year, fileName){
  const lines=[], unknownCats={}, problems=[];
  for (const [name,rows] of Object.entries(sheets)){
    const mi = MONTH_SHEETS.indexOf(norm(name)); if (mi<0) continue;
    const hi = rows.findIndex(r=>r && r.filter(v=>norm(v)==="montant").length>=1 && r.some(v=>norm(v)==="categorie"));
    if (hi<0){ problems.push(`${name} : en-tête introuvable`); continue; }
    const H = rows[hi].map(norm);
    const dates = H.map((h,i)=>h==="date"?i:-1).filter(i=>i>=0);
    const blocks = dates.map((i,k)=>({kind:k===0?"dep":"rev",date:i,amt:H.indexOf("montant",i),desc:H.indexOf("description",i),cat:H.indexOf("categorie",i),pour:H.indexOf("pour qui",i),par:k===0?H.indexOf("par qui",i):-1}));
    for (const r of rows.slice(hi+1)){
      if (!r) continue;
      for (const b of blocks){
        const amt = parseFloat(r[b.amt]); if (!amt || isNaN(amt)) continue;
        let day = r[b.date]; let date=null;
        if (typeof day==="number" && day>=1 && day<=31) date = `${year}-${pad(mi+1)}-${pad(Math.round(day))}`;
        else if (typeof day==="number" && day>40000){ const dt=new Date(Math.round((day-25569)*864e5)); date=dt.toISOString().slice(0,10); }
        else if (typeof day==="string"){ const m=day.match(/^(\d{1,2})/); if(m) date=`${year}-${pad(mi+1)}-${pad(+m[1])}`; }
        let noDate=false; if (!date){ date=`${year}-${pad(mi+1)}-01`; noDate=true; problems.push(`${name} : « ${r[b.desc]??""} » (${amt} $) sans date, placée au 1er du mois`); }
        const rawCat = r[b.cat]||"";
        const cat = mapCat(rawCat, b.kind==="dep" ? [...CATS,...EPARGNE] : REV);
        if (rawCat && !cat) unknownCats[rawCat]=(unknownCats[rawCat]||0)+1;
        const pour = personOf(r[b.pour]);
        const payer = b.kind==="dep" ? personOf(r[b.par]) : pour;
        lines.push({id:nid("h"),noDate,kind:b.kind,date,amount:r2(amt),desc:String(r[b.desc]??"").trim(),rawCat:String(rawCat),cat:cat||(b.kind==="dep"?"autres":"r_autres"),budget:pour,payer:payer==="commun"?null:payer,matched:null});
      }
    }
  }
  // Onglet « Budget <prénom> » : budget mensuel par catégorie
  const budget = {}; const budUnknown=[];
  for (const [name,rows] of Object.entries(sheets)){
    const who = ["A","B"].find(p=>norm(name)==="budget "+norm(S.names[p])); if (!who) continue;
    budget[who]=[];
    for (const r of rows){ if(!r) continue; if (/total des depenses/.test(norm(r[0]))) break; const lab=r[1], v=parseFloat(r[2]); if (!lab || isNaN(v) || typeof r[2]!=="number" || v<0) continue;
      const c = mapCat(lab,[...CATS,...EPARGNE]); if (c) budget[who].push({cat:c,amount:v}); else if (!/total|salaire|revenu|rembours|impot|assurance sante/.test(norm(lab))) budUnknown.push(String(lab)); }
  }
  // Salaire mensuel indiqué dans l'onglet Budget (section Revenus)
  const salary = {};
  for (const [name,rows] of Object.entries(sheets)){ const who = ["A","B"].find(p=>norm(name)==="budget "+norm(S.names[p])); if (!who) continue;
    for (const r of rows){ if (r && norm(r[1])==="salaire" && typeof r[2]==="number"){ salary[who]=r2(r[2]*12); break; } } }
  // Onglet « Résumé » : solde « <prénom> doit » à la fin de chaque mois
  let debts=null; const rs = Object.entries(sheets).find(([n])=>norm(n)==="resume");
  if (rs){ const rows=rs[1]; debts={};
    rows.forEach((r,i)=>{ if(!r) return; const lab=norm(r[0]); const sign = lab===norm(S.names.B)+" doit"?1:lab===norm(S.names.A)+" doit"?-1:0; if(!sign) return;
      let hdr=null; for (let k=i-1;k>=0;k--){ if (rows[k] && rows[k].some(v=>MONTH_SHEETS.includes(norm(v)))){ hdr=rows[k]; break; } }
      if (!hdr) return; const seen=new Set();
      hdr.forEach((v,ci)=>{ const mi=MONTH_SHEETS.indexOf(norm(v)); if(mi<0||seen.has(mi)) return; seen.add(mi); const val=parseFloat(r[ci]); if(!isNaN(val)) debts[`${year}-${pad(mi+1)}`]=r2(sign*val); });
    });
    if (!Object.keys(debts).length) debts=null;
  }
  return {fileName,year,lines,unknownCats,problems,budget,budUnknown,debts,salary};
}
function applyExcelBudget(H){
  for (const [p,v] of Object.entries(H.salary||{})) S.salary[p]=v;
  const B = H.budget.A; if (!B) return 0;
  // Catégorie « commune » si la majorité des lignes Excel de cette catégorie sont « Nous 2 »
  const frac = {}; for (const l of H.lines.filter(l=>l.kind==="dep")){ const f=frac[l.cat]=frac[l.cat]||[0,0]; f[1]++; if(l.budget==="commun") f[0]++; }
  S.budgets.A={}; S.budgets.commun={};
  for (const {cat,amount} of B){
    if (EPARGNE.some(e=>e.id===cat)){ S.savings.A[cat] = cat==="celiapp" ? S.savings.A.celiapp : r2(amount*12); continue; }
    const f = frac[cat]; if (f && f[0]/f[1]>=0.5) S.budgets.commun[cat]=r2((S.budgets.commun[cat]||0)+amount*2); else S.budgets.A[cat]=r2((S.budgets.A[cat]||0)+amount);
  }
  return Object.keys(S.budgets.commun).length;
}
/* Trouve la ligne Excel qui correspond à une transaction bancaire : même payeur, même montant, ±4 jours */
function findHistory(t, owner, used){
  if (t.type==="paiement_carte") return null;
  const kind = t.amount<0 ? "dep" : "rev";
  let best=null, bd=99;
  for (const h of S.history){
    if (h.matched || used?.has(h.id) || h.kind!==kind || h.payer!==owner) continue;
    if (Math.abs(h.amount-Math.abs(t.amount))>0.005) continue;
    const hs = EPARGNE.some(e=>e.id===h.cat); if (hs ? t.type!=="epargne" : t.type==="epargne") continue;
    const dd = Math.abs(dayDiff(h.date,t.date)); if (dd<=4 && dd<bd){ best=h; bd=dd; }
  }
  return best;
}
function fromHistory(h){
  if (h.kind==="rev") return {type:"revenu",cat:h.cat,budget:h.budget==="commun"?h.payer:h.budget,conf:100,why:`Repris de votre fichier Excel : « ${h.desc||catName(h.cat)} »`};
  if (EPARGNE.some(e=>e.id===h.cat)) return {type:"epargne",cat:h.cat,budget:h.payer,conf:100,why:`Repris de votre fichier Excel : ${catName(h.cat)}`};
  if (h.budget && h.budget!=="commun" && h.budget!==h.payer && /rembours/.test(norm(h.desc))) return {type:"reglement",cat:null,budget:null,conf:100,why:`Repris de votre fichier Excel : règlement « ${h.desc} »`};
  return {type:"depense",cat:h.cat,budget:h.budget||h.payer,conf:100,why:`Repris de votre fichier Excel : « ${h.desc||catName(h.cat)} »`};
}
function applyHistoryToTx(){
  let n=0; const used=new Set();
  const cand = S.tx.filter(t=>t.why!=="Corrigé à la main" && !String(t.why).startsWith("Repris")).sort((a,b)=>a.date.localeCompare(b.date));
  for (const t of cand){
    const h = findHistory(t, acc(t.acc).owner, used); if (!h) continue;
    used.add(h.id); h.matched=t.id; Object.assign(t, fromHistory(h), {subcat:null,status:"ok"}); n++;
  }
  for (const t of S.tx) if (String(t.why).startsWith("Repris")) learnFrom(t);
  return n;
}

/* ============ Vue & navigation ============ */
const VIEWS = ["tableau","transactions","importer","budgets","comptes","parametres"];
const UI = {view:"tableau", month:null, scope:"commun", f:{acc:"",bud:"",cat:"",status:"",q:""}, pending:null, hist:null};
function go(v){ UI.view=v; try{ history.replaceState(null,"","#"+v);}catch(e){} render(); window.scrollTo(0,0); }
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast.h); toast.h=setTimeout(()=>t.hidden=true,3600); }
/* ---------- Sauvegarde automatique chiffrée ---------- */
let saveTimer=null, saving=Promise.resolve();
function snapshot(){ return {...S, catOrder:CATS.map(c=>({id:c.id,g:c.g})), catFlags:Object.fromEntries(CATS.map(c=>[c.id,{fixed:!!c.fixed,always:!!c.always}]))}; }
function scheduleSave(){ clearTimeout(saveTimer); saveTimer=setTimeout(flushSave, 400); }
/* Suivi des changements pour la synchronisation : chaque transaction modifiée reçoit un horodatage (mod),
   chaque transaction supprimée laisse une trace (deleted), et S.updatedAt avance si quoi que ce soit a changé. */
let lastTx = new Map(), lastJson = "";
function contentJson(){ const {updatedAt, ...rest} = snapshot(); return JSON.stringify(rest); }
function resetBaseline(){ lastTx = new Map(S.tx.map(t=>{ const {mod,...r}=t; return [t.id, JSON.stringify(r)]; })); lastJson = contentJson(); }
function stampChanges(){
  const now = Date.now(), seen = new Set(); S.deleted = S.deleted || {};
  for (const t of S.tx){ const {mod,...r}=t; const j=JSON.stringify(r); seen.add(t.id); if (lastTx.get(t.id)!==j){ t.mod=now; lastTx.set(t.id,j); delete S.deleted[t.id]; } }
  for (const id of [...lastTx.keys()]) if (!seen.has(id)){ S.deleted[id]=now; lastTx.delete(id); }
  const j = contentJson(); if (j!==lastJson){ S.updatedAt = now; lastJson = contentJson(); return true; } return false;
}
function flushSave(){ clearTimeout(saveTimer); if (!S || !Vault.isOpen()) return saving; const changed=stampChanges(); const snap=snapshot();
  saving = saving.then(()=>Vault.save(snap)).then(()=>{ if (changed && typeof Sync!=="undefined") Sync.soon(); }).catch(e=>toast("Enregistrement impossible : "+e.message)); return saving; }
window.addEventListener("pagehide", flushSave);
/* Ouvre l'application avec les données déchiffrées */
const DEFAULT_CATS = CATS.map(c=>({...c}));
function boot(data, keepView){
  const base = freshState(); S = {...base, ...(data||{})};
  for (const k of ["budgets","savings","salary","names"]) S[k] = {...base[k], ...(data?.[k]||{})};
  // Ordre, groupe et étiquettes des catégories
  CATS.length=0; DEFAULT_CATS.forEach(c=>CATS.push({...c, subs:[...c.subs]}));
  if (data?.catOrder){ const pos=Object.fromEntries(data.catOrder.map((x,i)=>[x.id,i])); for (const c of CATS){ const o=data.catOrder.find(x=>x.id===c.id); if(o) c.g=o.g; } CATS.sort((a,b)=>(pos[a.id]??999)-(pos[b.id]??999)); }
  if (data?.catFlags) for (const c of CATS){ const f=data.catFlags[c.id]; if (f){ c.fixed=f.fixed; c.always=f.always; } }
  delete S.catOrder; delete S.catFlags;
  S.deleted = S.deleted || {};
  resetBaseline();
  if (!keepView){ UI.month=null; UI.pending=null; UI.hist=null;
    const h=location.hash.slice(1); UI.view = VIEWS.includes(h) ? h : "tableau"; }
  render();
  if (!keepView && typeof Sync!=="undefined") Sync.onOpen();
}
function download(name, text, type){
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function backupNow(){
  await flushSave(); S.lastBackup = TODAY; await flushSave();
  download(`budget-a-deux-${TODAY}.budget`, Vault.exportFile(), "application/json");
  toast("Sauvegarde chiffrée téléchargée."); render();
}
function render(){
  if (!S) return;
  scheduleSave();
  document.querySelectorAll(".nav-btn").forEach(b=>b.setAttribute("aria-current", b.dataset.view===UI.view?"page":"false"));
  const n = toValidate().length; const bv=$("#badge-val"); bv.hidden=!n; bv.textContent=n;
  const days = S.lastBackup ? dayDiff(TODAY,S.lastBackup) : null;
  $("#side-foot").innerHTML = `<div><span class="status-dot" style="background:${days==null||days>7?"var(--warn)":"var(--good)"}"></span>Sauvegarde : ${days==null?"aucune":days===0?"aujourd'hui":`il y a ${days} j`}</div><div>${Sync.side()}<button class="btn small" data-act="lock" style="margin-top:4px">Verrouiller</button><div class="muted" style="font-size:.7rem">Version 1.1.3</div>`;
  $("#view").innerHTML = ({tableau:vDash,transactions:vTx,importer:vImport,budgets:vBudgets,comptes:vAccounts,parametres:vSettings})[UI.view]();
}
const note = s => `<div class="proto-note">${s}</div>`;

/* ---------- Tableau de bord ---------- */
function vDash(){
  if (!S.tx.length) return `<div class="toolbar"><h1>Tableau de bord</h1></div>
    <div class="card" style="padding:28px"><h2>Aucune transaction pour l'instant</h2>
    <ol class="small" style="margin:12px 0 16px;padding-left:20px;display:grid;gap:6px;max-width:62ch">
      <li>Chargez votre fichier Excel de suivi : catégories, budget d'Antoine, salaire et historique de classement.</li>
      <li>Déposez vos relevés CSV Scotiabank (chèque et carte, un mois ou plusieurs) : ils sont classés comme dans l'Excel.</li>
      <li>Le tableau de bord s'ouvrira sur le dernier mois importé.</li></ol>
    <button class="btn primary" data-act="go-import">Aller à Importer</button>
    <div class="small muted" style="margin-top:12px">Les fichiers sont lus sur cet appareil ; seules les transactions sont conservées, chiffrées.</div></div>`;
  if (!UI.month) UI.month = lastDataMonth();
  const yearMode = UI.period==="annee", Y = UI.year || TODAY.slice(0,4), curY = TODAY.slice(0,4);
  const m = yearMode ? (Y===curY ? mk(TODAY) : `${Y}-12`) : UI.month, sc = UI.scope;
  const st = yearMode ? yearStats(Y, sc) : stats(m, sc);
  const isCur = yearMode ? Y===curY : m===mk(TODAY), fac = yearMode ? 12 : 1;
  const unit = yearMode ? "l'année" : "le mois", ended = yearMode ? "Année terminée" : "Mois terminé";
  const pctAll = st.budget? st.spent/st.budget*100 : 0;
  const expected = st.budget*st.p, paceDiff = expected? (st.spent/expected-1)*100 : 0;
  const paceChip = !isCur ? `<span class="chip neutral">${ended}</span>` : Math.abs(paceDiff)<5 ? `<span class="chip good">● Dans le rythme</span>` : paceDiff>0 ? `<span class="chip ${paceDiff>15?"bad":"warn"}">▲ ${Math.round(paceDiff)} % au-dessus du rythme</span>` : `<span class="chip good">▼ ${Math.round(-paceDiff)} % sous le rythme</span>`;
  const reste = st.budget - st.spent, projState = stateOf(st.budget? st.proj/st.budget*100:0);
  const allCats = budgetCats().filter(c=>yearMode || !isAnnual(c.id)).map(c=>({c,spent:r2(st.byCat[c.id]||0),bud:budgetFor(sc,c.id)*fac})).filter(x=>x.spent||x.bud);
  // Vue Commun : seulement les catégories qui ont un budget commun ; les autres dépenses communes sont signalées à part
  const cats = sc==="commun" ? allCats.filter(x=>S.budgets.commun[x.c.id]>0) : allCats;
  const strays = sc==="commun" ? allCats.filter(x=>!(S.budgets.commun[x.c.id]>0) && x.spent) : [];
  const yearP = (+m.slice(5,7)-1+st.p)/12;
  const annRows = budgetCats().filter(c=>st.annual[c.id]).map(c=>{ const a=st.annual[c.id]; const pct = a.yb? a.ytd/a.yb*100 : (a.ytd?101:0); const s = stateOf(pct); const g=groupOf(c.id);
    return `<button class="cat-row" data-cat="${c.id}" data-year="1"><span class="cat-name"><span class="sw" style="background:var(--s${g.slot})"></span>${esc(c.name)}</span>
    <span class="num small"><b>${fmt(a.ytd)}</b> <span class="muted">/ ${a.yb?fmt0(a.yb)+" par an":"non budgété"}</span> ${s!=="good"?`<span class="chip ${s}">${s==="bad"?"✕":"!"} ${Math.round(pct)} %</span>`:""}</span>
    <span class="bar"><i style="width:${Math.min(100,pct)}%;background:var(--${s})"></i>${a.yb?`<em style="left:${yearP*100}%"></em>`:""}</span>
    <span class="small muted" style="grid-column:1/-1">${a.month?`${fmt(a.month)} dépensés ce mois-ci · `:""}${fmt(a.yb/12)} provisionnés par mois</span></button>`; }).join("");
  // Dépense fixe (loyer, assurances, internet, téléphone) : verte tant qu'elle ne dépasse pas son budget
  const catRow = x=>{ const pct = x.bud? x.spent/x.bud*100 : (x.spent?101:0); const s = x.c.fixed ? (pct>100.5?"bad":"good") : stateOf(pct); const g=groupOf(x.c.id);
    return `<button class="cat-row" data-cat="${x.c.id}"${yearMode?' data-year="1"':""}><span class="cat-name"><span class="sw" style="background:var(--s${g.slot})"></span>${esc(x.c.name)}</span>
    <span class="num small"><b>${fmt(x.spent)}</b> <span class="muted">/ ${x.bud?fmt0(x.bud):"non budgété"}</span> ${s!=="good"?`<span class="chip ${s}">${s==="bad"?"✕":"!"} ${x.bud?Math.round(pct)+" %":"hors budget"}</span>`:""}</span>
    <span class="bar"><i style="width:${Math.min(100,pct)}%;background:var(--${s})"></i>${isCur&&x.bud?`<em style="left:${st.p*100}%"></em>`:""}</span></button>`; };
  // Vue personnelle : les catégories budgétées seulement en commun (loyer, Hydro…) vont dans un bloc à part
  const sharedOnly = id => sc!=="commun" && !(S.budgets[sc][id]>0) && S.budgets.commun[id]>0;
  const ownCats = cats.filter(x=>!sharedOnly(x.c.id)), sharedCats = cats.filter(x=>sharedOnly(x.c.id));
  // En-tête de groupe avec son total dépensé / budget (pour les catégories du bloc)
  const grpHead = (g, items) => { const sp=r2(items.reduce((s,x)=>s+x.spent,0)), bd=items.reduce((s,x)=>s+x.bud,0), pct = bd? sp/bd*100 : (sp?101:0), st0 = stateOf(pct);
    return `<div class="grp-head" style="--gc:var(--s${g.slot})"><span class="grp-name">${esc(g.name)}</span><span class="num small"><b>${fmt(sp)}</b> <span class="muted">/ ${bd?fmt0(bd):"non budgété"}</span> ${st0!=="good"?`<span class="chip ${st0}">${st0==="bad"?"✕":"!"} ${bd?Math.round(pct)+" %":"hors budget"}</span>`:""}</span>
      <span class="grp-bar"><i style="width:${Math.min(100,pct)}%;background:var(--${st0})"></i>${isCur&&bd?`<em style="left:${st.p*100}%"></em>`:""}</span></div>`; };
  const withGroups = L => { let g0=null; return L.map(x=>{ const g=groupOf(x.c.id); const h = g&&g.id!==g0 ? grpHead(g, L.filter(y=>groupOf(y.c.id)?.id===g.id)) : ""; g0=g?.id; return h+catRow(x); }).join(""); };
  const scopes = [["commun","Commun"],["A",S.names.A],["B",S.names.B]];
  const settle = settlement(), who = settle>0 ? [S.names.B,S.names.A] : [S.names.A,S.names.B];
  const val = toValidate().length, exc = excUsedYTD(m.slice(0,4));
  let side = sc!=="commun" ? "" : `<div class="card settle"><div class="card-h"><h2>Avances entre vous</h2><span class="small muted">depuis le début</span></div>
    ${Math.abs(settle)<0.01?`<div class="big">Vous êtes quittes</div>`:`<div class="big num">${fmt(Math.abs(settle))}</div><div>${esc(who[0])} doit cette somme à ${esc(who[1])}.</div>`}
    <div class="small muted">Part de départ : ${S.openingDebt?`${fmt(S.openingDebt.amount)} au ${S.openingDebt.date}. `:""}Commune : 50 % dû par l'autre. Pour l'autre : 100 %. Un « Règlement entre nous » réduit le solde.</div>
    ${S.excelDebts?`<div><button class="btn ghost small" data-act="go-compare" style="padding-left:0">Comparer avec l'Excel, mois par mois</button></div>`:""}</div>`;
  if (sc!=="commun"){
    const y = m.slice(0,4);
    for (const e of EPARGNE){
      const annual = S.savings[sc]?.[e.id]||0;
      const mine = t => t.type==="epargne"&&(t.cat||"celiapp")===e.id&&acc(t.acc).owner===sc;
      const ytd = r2(S.tx.filter(t=>mine(t)&&t.date.startsWith(y)&&t.date<=m+"-31").reduce((s,t)=>s-t.amount,0));
      const ep = r2(monthTx(m).filter(mine).reduce((s,t)=>s-t.amount,0));
      const reserved = r2(annual/12*(+m.slice(5,7)));
      if (annual && e.virtual){ side += `<div class="card"><div class="card-h"><h2>${esc(e.name)} ${y}</h2><span class="chip info">${fmt0(annual/12)} / mois</span></div>
      <div class="settle"><div class="big num">${fmt(reserved)}</div><div class="small">mis de côté ${isCur||!yearMode?"depuis janvier":"sur l'année"}</div><div class="small muted">Montant réservé dans votre budget, sans virement : l'argent reste dans votre compte et vous n'y touchez pas.</div></div></div>`; continue; }
      if (annual) side += `<div class="card"><div class="card-h"><h2>${esc(e.name)} ${y}</h2><span class="chip info">${fmt0(annual)} / an</span></div>
      <div class="num" style="font-weight:600">${fmt(ytd)} versés <span class="muted">sur ${fmt0(annual)}</span></div>
      <div class="pace"><i style="width:${Math.min(100,ytd/annual*100)}%;background:var(--accent)"></i><em style="left:${Math.min(100,reserved/annual*100)}%" title="Mis de côté dans le budget"></em></div>
      <div class="small" style="margin-top:10px;display:grid;gap:4px">${yearMode?"":`<div>Ce mois-ci : <b class="num">${fmt(ep)}</b> versés, <b class="num">${fmt(annual/12)}</b> réservés au budget</div>`}<div>Réservé à ce jour (le trait) : <b class="num">${fmt(reserved)}</b></div><div>Reste à verser cette année : <b class="num">${fmt(Math.max(0,annual-ytd))}</b></div></div></div>`;
      else if (ep) side += `<div class="card"><div class="card-h"><h2>${esc(e.name)}</h2></div><div class="settle"><div class="big num">${fmt(ep)}</div><div class="small muted">Versés ce mois-ci. Aucun objectif annuel fixé (Budgets).</div></div></div>`;
    }
  } else {
    side += `<div class="card"><div class="card-h"><h2>Dépenses exceptionnelles ${m.slice(0,4)}</h2></div>
    <div class="num" style="font-weight:600">${fmt(exc)} <span class="muted">sur ${fmt0(S.excAnnual)}</span></div>
    <div class="pace"><i style="width:${Math.min(100,exc/S.excAnnual*100)}%;background:var(--${stateOf(exc/S.excAnnual*100)})"></i></div>
    <div class="small muted" style="margin-top:8px">Enveloppe annuelle, hors des limites mensuelles.</div></div>`;
  }
  if (val) side += `<div class="card"><div class="card-h"><h2>À valider</h2><span class="chip warn">${val}</span></div><div class="small">Virements Interac, restaurants et bars, commerçants inconnus. Ils sont déjà comptés avec la meilleure supposition.</div><div style="margin-top:10px"><button class="btn primary small" data-act="see-val">Les revoir</button></div></div>`;
  // Répartition par groupe
  const byG = {}; for (const [k,v] of Object.entries(st.actual)){ if (v<=0) continue; const g=groupOf(k); if(g) byG[g.id]=(byG[g.id]||0)+v; }
  const segs = GROUPS.filter(g=>byG[g.id]>0).map(g=>({n:g.name,v:r2(byG[g.id]),col:`var(--s${g.slot})`}));
  const total = segs.reduce((s,x)=>s+x.v,0); let a0=0; const R=58, C=2*Math.PI*R;
  const arcs = total>0 ? segs.map(s=>{ const len=s.v/total*C, gap=segs.length>1?2:0; const el=`<circle r="${R}" cx="75" cy="75" fill="none" stroke="${s.col}" stroke-width="20" stroke-dasharray="${Math.max(0,len-gap)} ${C}" stroke-dashoffset="${-a0}" transform="rotate(-90 75 75)"><title>${esc(s.n)} : ${fmt(s.v)}</title></circle>`; a0+=len; return el; }).join("") : "";
  return `
  ${!S.lastBackup || dayDiff(TODAY,S.lastBackup)>7 ? `<div class="backup-nag"><span>${S.lastBackup?`Dernière sauvegarde il y a ${dayDiff(TODAY,S.lastBackup)} jours.`:"Aucune sauvegarde pour l'instant."} Téléchargez une copie chiffrée et rangez-la dans votre dossier Drive.</span><button class="btn small primary" data-act="backup">Sauvegarder</button></div>`:""}
  ${periodBar()}
  <div class="toolbar">
    ${yearMode?`<div class="month"><button class="icon-btn" data-act="y-prev" aria-label="Année précédente">‹</button><b class="year-lbl num">Année ${Y}</b><button class="icon-btn" data-act="y-next" aria-label="Année suivante">›</button></div>`:`<div class="month"><button class="icon-btn" data-act="m-prev" aria-label="Mois précédent">‹</button><div class="mp-wrap"><button class="month-btn" data-act="m-pick" aria-haspopup="dialog" aria-expanded="${!!UI.picker}">${monthLabel(m)} <span class="caret">▾</span></button>${UI.picker?pickerHtml(m):""}</div><button class="icon-btn" data-act="m-next" aria-label="Mois suivant">›</button></div>`}
    <div class="seg" role="group" aria-label="Budget affiché">${scopes.map(([k,l])=>`<button data-scope="${k}" aria-pressed="${sc===k}">${esc(l)}</button>`).join("")}</div>
  </div>
  ${sc!=="commun"?accountBanner(sc,m,yearMode):""}
  <div class="kpis">
    <div class="card kpi"><div class="lbl">Budget de ${unit}</div><div class="val num">${fmt0(st.budget)}</div><div class="sub">${sc==="commun"?"Dépenses partagées, à 100 %":"Perso + 50 % du commun"}</div></div>
    <div class="card kpi"><div class="lbl">Dépensé</div><div class="val num">${fmt(st.spent)}</div><div class="sub">${sc==="commun"?Math.round(pctAll)+" % du budget":`dont ${fmt0(st.fromCommun)} de part commune${st.reserve?`, ${fmt0(st.reserve)} réservés à l'épargne`:""}`}${st.prov?` · ${fmt0(st.prov)} de provisions annuelles`:""}</div></div>
    <div class="card kpi"><div class="lbl">Reste</div><div class="val num" style="color:${reste<0?"var(--bad)":"inherit"}">${fmt(reste)}</div><div class="sub">${yearMode ? (isCur? `${12-st.mc} mois restant${12-st.mc>1?"s":""} · moyenne ${fmt0(st.spent/Math.max(1,st.mc))} par mois` : `moyenne ${fmt0(st.spent/12)} par mois`) : (isCur? (daysIn(m)-(+TODAY.slice(8,10)))+" jours restants":"fin du mois")}</div></div>
    <div class="card kpi"><div class="lbl">${isCur?(yearMode?"Projection fin d'année":"Projection fin de mois"):"Total final"}</div><div class="val num">${fmt0(st.proj)}</div><div class="sub"><span class="chip ${projState}">${projState==="good"?"✓ Sous le budget":projState==="warn"?"! Proche de la limite":"✕ Dépassement prévu"}</span></div></div>
  </div>
  <div class="card">
    <div class="card-h"><h2>Rythme de dépense</h2>${paceChip}</div>
    <div class="pace" role="img" aria-label="Dépensé ${Math.round(pctAll)} % du budget, ${Math.round(st.p*100)} % de ${unit} écoulé"><i style="width:${Math.min(100,pctAll)}%;background:var(--${stateOf(pctAll)})"></i>${isCur?`<em style="left:${st.p*100}%" title="Aujourd'hui"></em>`:""}</div>
    <div class="small muted" style="margin-top:8px">${isCur?`Le trait marque aujourd'hui (${Math.round(st.p*100)} % de ${unit}). Si la barre le dépasse, la dépense va plus vite que prévu.`:ended+"."}</div>
  </div>
  ${yearMode?monthlyChart(st, sc):""}
  <div class="grid-2">
    <div class="stack">
    <div class="card">
      <div class="card-h"><h2>Budget vs réel par catégorie</h2><span class="small muted">Touchez une catégorie pour voir ses transactions</span></div>
      ${sc!=="commun"?EPARGNE.filter(e=>S.savings[sc]?.[e.id]).map(e=>{ const a=S.savings[sc][e.id]; const got = yearMode? a/12*st.mc : a/12, of = yearMode? a : a/12;
        return `<div class="cat-row" style="cursor:default"><span class="cat-name"><span class="sw" style="background:var(--accent)"></span>${esc(e.name)} (réservé)</span><span class="num small"><b>${fmt(got)}</b> <span class="muted">/ ${fmt0(of)}</span> <span class="chip info">${yearMode?`${st.mc} mois sur 12`:`1/12 de ${fmt0(a)}`}</span></span><span class="bar"><i style="width:${Math.min(100,got/of*100)}%;background:var(--accent)"></i></span></div>`; }).join(""):""}
      ${ownCats.length? withGroups(ownCats) : `<div class="empty">Aucune dépense ${yearMode?"cette année":"ce mois-ci"}.</div>`}
      ${strays.length?`<div class="stray-note"><b>${fmt(strays.reduce((s,x)=>s+x.spent,0))}</b> de dépenses communes dans des catégories sans budget commun : ${strays.map(x=>`<button class="link-btn" data-cat="${x.c.id}"${yearMode?' data-year="1"':""}>${esc(x.c.name)} (${fmt(x.spent)})</button>`).join(", ")}. Comptées dans les totaux ; ajoutez un budget commun ou reclassez-les en personnel.</div>`:""}
    </div>
    ${sharedCats.length?`<div class="card">
      <div class="card-h"><h2>Dépenses communes</h2><span class="small muted">Votre part de 50 % · budget commun seulement</span></div>
      ${withGroups(sharedCats)}
      <div class="small muted" style="padding:8px 6px 0">Total de votre part : <b class="num">${fmt(sharedCats.reduce((s,x)=>s+x.spent,0))}</b> sur <span class="num">${fmt0(sharedCats.reduce((s,x)=>s+x.bud,0))}</span></div>
    </div>`:""}
    ${annRows?`<div class="card">
      <div class="card-h"><h2>Suivi annuel</h2><span class="small muted">Depuis janvier · le trait marque ${Math.round(yearP*100)} % de l'année</span></div>
      ${annRows}
      <div class="small muted" style="padding:8px 6px 0">Dépenses ponctuelles : chaque mois compte 1/12 du budget annuel dans les totaux du haut. Un dépassement de l'enveloppe annuelle s'ajoute au mois où il se produit.</div>
    </div>`:""}
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Répartition par groupe</h2><span class="small muted num">${fmt(total)}</span></div>
        ${total>0?`<div class="donut-wrap"><svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="Répartition des dépenses par groupe">${arcs}<text x="75" y="72" text-anchor="middle" font-size="11" fill="var(--fg-3)">dépensé</text><text x="75" y="90" text-anchor="middle" font-size="15" font-weight="700" fill="var(--fg)">${fmt0(total)}</text></svg>
        <div class="legend">${segs.map(s=>`<div><span class="sw" style="background:${s.col}"></span>${esc(s.n)}<span class="v num">${fmt0(s.v)}</span></div>`).join("")}</div></div>`:`<div class="empty">Rien à afficher.</div>`}
      </div>
      ${side}
    </div>
  </div>`;
}

/* Barre de période du tableau de bord : mois (défaut), année en cours, année choisie */
function periodBar(){
  const curY = TODAY.slice(0,4), yearMode = UI.period==="annee", Y = UI.year||curY;
  const years = [...new Set([curY, ...S.tx.map(t=>t.date.slice(0,4))])].sort().reverse();
  const other = yearMode && Y!==curY;
  return `<div class="period-bar" role="group" aria-label="Période du tableau de bord">
    <button data-act="period-mois" aria-pressed="${!yearMode}">Mois</button>
    <button data-act="period-annee" aria-pressed="${yearMode && Y===curY}">Année en cours</button>
    <label class="pb-year${other?" on":""}"><span>Autre année</span><select id="pick-year" aria-label="Choisir une année"><option value="">—</option>${years.map(y=>`<option value="${y}" ${other&&y===Y?"selected":""}>${y}</option>`).join("")}</select></label>
  </div>`;
}
/* Graphique : dépensé par mois face au budget mensuel */
function monthlyChart(st, sc){
  const bud = st.budget/12, vals = st.months.map(x=>x.st?x.st.spent:0);
  const max = Math.max(bud, ...vals)*1.12 || 1, W=720, H=210, L=46, B=24, T=10, bw=(W-L-8)/12;
  const yv = v => T + (H-T-B)*(1-v/max), tick = n => { const step = Math.pow(10,Math.floor(Math.log10(max/3))); const s=[1,2,5].map(k=>k*step).find(k=>max/k<=5)||10*step; return Array.from({length:Math.floor(max/s)+1},(_,i)=>i*s); };
  const bars = st.months.map((x,i)=>{ if (!x.st) return ""; const v=x.st.spent, pct=bud? v/bud*100 : 0, s=stateOf(pct), x0=L+i*bw+bw*0.18, w=bw*0.64, y0=yv(v);
    return `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0,H-B-y0).toFixed(1)}" rx="4" fill="var(--${s})" data-m="${x.k}" class="mbar"><title>${monthLabel(x.k)} : ${fmt(v)} sur ${fmt0(bud)} (${Math.round(pct)} %)</title></rect>`; }).join("");
  const grid = tick().map(v=>`<line x1="${L}" x2="${W-8}" y1="${yv(v).toFixed(1)}" y2="${yv(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${(yv(v)+4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--fg-3)">${v>=1000?(v/1000).toLocaleString("fr-CA")+" k":v}</text>`).join("");
  const labels = MSHORT.map((n,i)=>`<text x="${(L+i*bw+bw/2).toFixed(1)}" y="${H-7}" text-anchor="middle" font-size="10.5" fill="var(--fg-2)">${n.replace(".","")}</text>`).join("");
  const bl = yv(bud);
  return `<div class="card"><div class="card-h"><h2>Dépensé par mois</h2><span class="small muted">Touchez un mois pour l'ouvrir</span></div>
    <div class="chart-x"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Dépenses de chaque mois comparées au budget mensuel de ${fmt0(bud)}">${grid}${bars}
      <line x1="${L}" x2="${W-8}" y1="${bl.toFixed(1)}" y2="${bl.toFixed(1)}" stroke="var(--fg)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W-10}" y="${(bl-5).toFixed(1)}" text-anchor="end" font-size="10.5" fill="var(--fg)">budget ${fmt0(bud)}</text>${labels}</svg></div>
    <div class="legend" style="grid-auto-flow:column;justify-content:start;gap:16px;margin-top:6px"><div><span class="sw" style="background:var(--good)"></span>Sous le budget</div><div><span class="sw" style="background:var(--warn)"></span>90 à 100 %</div><div><span class="sw" style="background:var(--bad)"></span>Dépassé</div></div>
  </div>`;
}
/* Solde dû sur une carte : solde saisi une fois, puis + achats − paiements et remboursements importés */
function cardOwed(a, until){
  if (!a.cardStart) return null;
  return r2(a.cardStart.balance + S.tx.filter(t=>t.acc===a.id&&t.date>a.cardStart.date&&t.date<=until&&t.status!=="ignore").reduce((s,t)=>s-t.amount,0));
}
/* Événements (chalet entre amis…) : dépenses et remboursements liés, pour connaître le vrai coût */
function applyEvent(t, evId){
  t.event = evId || null; if (!evId) return;
  const ev = S.events.find(e=>e.id===evId);
  Object.assign(t,{type:t.amount>0?"remboursement":"depense",cat:ev.cat,subcat:null,budget:ev.budget,status:"ok",conf:100,why:`Événement : ${ev.name}`});
}
function eventSummary(ev){
  const L = S.tx.filter(t=>t.event===ev.id);
  const out = r2(L.filter(t=>t.amount<0).reduce((s,t)=>s-t.amount,0)), back = r2(L.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0));
  const cost = r2(out-back);
  const share = p => ev.budget==="commun" ? cost/2 : ev.budget===p ? cost : 0;
  return {n:L.length,out,back,cost,A:r2(share("A")),B:r2(share("B"))};
}
function eventsCard(){
  const evs = S.events.slice().sort((a,b)=>b.date.localeCompare(a.date));
  return `<div class="card"><div class="card-h"><h2>Événements</h2><span class="small muted">Activités entre amis : dépenses et remboursements reliés</span></div>
    ${evs.length?`<div class="table-x"><table><thead><tr><th>Événement</th><th>Catégorie</th><th class="r">Payé</th><th class="r">Remboursé</th><th class="r">Vrai coût</th><th class="r">${esc(S.names.A)}</th><th class="r">${esc(S.names.B)}</th><th></th></tr></thead><tbody>
    ${evs.map(ev=>{ const x=eventSummary(ev); return `<tr><td><b>${esc(ev.name)}</b><div class="small muted">${ev.date} · ${x.n} transaction(s)</div></td><td>${esc(catName(ev.cat))}<div class="small muted">${esc(budLabel(ev.budget))}</div></td>
      <td class="r num">${fmt(x.out)}</td><td class="r num amt in">${x.back?"−"+fmt(x.back):fmt(0)}</td><td class="r num"><b>${fmt(x.cost)}</b></td><td class="r num">${fmt(x.A)}</td><td class="r num">${fmt(x.B)}</td>
      <td><button class="btn small" data-act="ev-see" data-ev="${ev.id}">Voir</button></td></tr>`; }).join("")}</tbody></table></div>`:`<div class="small muted">Aucun événement pour l'instant.</div>`}
    <form class="form" data-form="event" style="margin-top:12px">
      <label>Nouvel événement<input id="ev-name" required placeholder="Chalet de février"></label>
      <label>Date<input id="ev-date" type="date" value="${TODAY}" required></label>
      <label>Catégorie<select id="ev-cat">${catOptions("chalet",null,"depense")}</select></label>
      <label>Pour qui<select id="ev-bud">${budOptions("commun")}</select></label>
      <button class="btn" type="submit">Créer</button></form>
    <div class="small muted" style="margin-top:8px">Associez ensuite chaque dépense et chaque virement reçu ou envoyé à l'événement depuis la liste ci-dessous. Les remboursements reçus viennent en déduction dans la catégorie de l'événement : le budget compte le vrai coût.</div>
  </div>`;
}
/* Bandeau des comptes d'une personne : solde du chèque et utilisation de la carte */
function accountBanner(p, m, yearMode){
  const end = m===mk(TODAY) ? TODAY : `${m}-${pad(daysIn(m))}`;
  const items = S.accounts.filter(a=>a.owner===p && (a.kind==="cheque"||a.kind==="carte")).map(a=>{
    if (a.kind==="cheque"){
      if (!a.opening || a.opening.date> end) return `<div class="ab-item"><span class="ab-lbl">${esc(a.name)}</span><span class="ab-val muted">—</span><span class="ab-sub">Importez un relevé</span></div>`;
      const bal = r2(a.opening.amount + S.tx.filter(t=>t.acc===a.id&&t.date>=a.opening.date&&t.date<=end&&t.status!=="ignore").reduce((s,t)=>s+t.amount,0));
      const last = S.tx.filter(t=>t.acc===a.id&&t.date<=end).map(t=>t.date).sort().at(-1);
      return `<div class="ab-item"><span class="ab-lbl">Restant au compte chèque</span><span class="ab-val num">${fmt(bal)}</span><span class="ab-sub">au ${last||a.opening.date}${a.bank&&a.bank.date===last&&Math.abs(a.bank.balance-bal)<0.005?" · ✓ concorde avec la banque":""}</span></div>`;
    }
    const tx = (yearMode ? S.tx.filter(t=>t.date.startsWith(m.slice(0,4))&&t.date<=end) : monthTx(m)).filter(t=>t.acc===a.id);
    const per = yearMode ? `en ${m.slice(0,4)}` : `en ${MONTHS[+m.slice(5,7)-1]}`;
    const used = r2(tx.filter(t=>t.type!=="paiement_carte").reduce((s,t)=>s-t.amount,0));
    const paid = r2(tx.filter(t=>t.type==="paiement_carte").reduce((s,t)=>s+t.amount,0));
    const owed = a.cardStart && a.cardStart.date<=end ? cardOwed(a,end) : null;
    if (owed!=null) return `<div class="ab-item"><span class="ab-lbl">Solde dû sur la ${esc(a.name)}${a.last4?" ····"+a.last4:""}</span><span class="ab-val num">${fmt(owed)}</span><span class="ab-sub">au ${end} · ${fmt(used)} utilisés ${per}, ${fmt(paid)} payés</span></div>`;
    return `<div class="ab-item"><span class="ab-lbl">Utilisé sur la ${esc(a.name)}${a.last4?" ····"+a.last4:""}</span><span class="ab-val num">${fmt(used)}</span><span class="ab-sub">${per} · ${fmt(paid)} payés · <button class="btn ghost small" data-act="go-comptes" style="padding:0">saisir le solde de la carte</button></span></div>`;
  });
  return `<div class="acc-banner" role="group" aria-label="Comptes de ${esc(S.names[p])}">${items.join("")}</div>`;
}

/* ---------- Transactions ---------- */
function catOptions(sel, subSel, type){
  if (type==="revenu") return `<option value="">—</option>`+REV.map(c=>`<option value="${c.id}|" ${sel===c.id?"selected":""}>${esc(c.name)}</option>`).join("");
  if (type==="epargne") return EPARGNE.map(c=>`<option value="${c.id}|" ${sel===c.id?"selected":""}>${esc(c.name)}</option>`).join("");
  let o = `<option value="">—</option>`;
  for (const g of [...GROUPS,{id:"exc",name:"Exceptionnel"}]){
    o += `<optgroup label="${esc(g.name)}">`;
    for (const c of CATS.filter(c=>c.g===g.id)){ o += `<option value="${c.id}|" ${sel===c.id&&!subSel?"selected":""}>${esc(c.name)}</option>`;
      for (const s of c.subs) o += `<option value="${c.id}|${esc(s)}" ${sel===c.id&&subSel===s?"selected":""}>${esc(c.name)} › ${esc(s)}</option>`; }
    o += `</optgroup>`;
  }
  return o;
}
const typeOptions = sel => Object.entries(TYPES).map(([k,v])=>`<option value="${k}" ${sel===k?"selected":""}>${v.l}</option>`).join("");
const budOptions = (sel, label) => `<option value="" ${!sel?"selected":""}>—</option>`+["commun","A","B"].map(b=>`<option value="${b}" ${sel===b?"selected":""}>${esc(label?label(b):budLabel(b))}</option>`).join("");
function prettyDesc(t){
  const m = txMerchant(t), d = norm(t.desc+" "+t.sub);
  if (isInterac(m)) return t.amount>0 ? "Virement Interac reçu" : "Virement Interac envoyé";
  if (/pai\. carte|paiement du/.test(d)) return "Paiement de carte de crédit";
  if (/placement/.test(d)) return "Achat de placement";
  if (/salaire|paye/.test(d)) return "Salaire · "+t.sub.trim();
  return m.replace(/\b\w/g,c=>c.toUpperCase());
}
// « Hors budget » : sans catégorie possible (paiement de carte, transfert, règlement entre vous, Interac non classé)
const horsBudget = t => !(counts(t) || t.type==="revenu" || t.type==="epargne");
function txRow(t){
  const a = acc(t.acc), owner=a?.owner;
  const showCat = !horsBudget(t);
  const showBud = counts(t);
  const forOther = showBud && t.budget && t.budget!=="commun" && t.budget!==owner;
  return `<div class="tx ${t.status==="avalider"?"flag":""} ${!showCat&&t.type!=="interac"?"dim":""}" data-id="${t.id}">
    <div class="c-date num small">${t.date.slice(8,10)} ${MONTHS[+t.date.slice(5,7)-1].slice(0,4)}.</div>
    <div class="desc"><b title="${esc(t.desc+" "+t.sub)}">${esc(prettyDesc(t))}</b>${S.events.length&&t.type!=="paiement_carte"?`<select class="ev-sel" data-f="event" aria-label="Événement"><option value="">＋ événement</option>${S.events.map(e=>`<option value="${e.id}" ${t.event===e.id?"selected":""}>◆ ${esc(e.name)}</option>`).join("")}</select>`:""}<small>${t.status==="avalider"?`<span style="color:var(--warn)">À valider · ${esc(t.why||"")}</span>`:forOther?`<span style="color:var(--accent)">Payé par ${esc(S.names[owner])} pour ${esc(S.names[t.budget])}</span>`:esc(t.matchId?"Apparié avec l'autre compte":t.why||"")}</small></div>
    <div class="c-acc small muted">${esc(a?accLabel(a):"?")}</div>
    <div class="c-cat cell">${showCat?`<select data-f="cat" aria-label="Catégorie">${catOptions(t.cat,t.subcat,t.type)}</select>`:`<span class="small muted">Hors budget</span>`}</div>
    <div class="c-bud cell">${showBud?`<select data-f="budget" aria-label="Pour qui">${budOptions(t.budget)}</select>`:""}</div>
    <div class="c-type cell"><select data-f="type" aria-label="Type">${typeOptions(t.type)}</select></div>
    <div class="amt num ${t.amount>0?"in":""}">${t.amount>0?"+":""}${fmt(t.amount)}${t.status==="avalider"?`<div><button class="btn ghost small" data-act="ok" data-id="${t.id}">Valider</button></div>`:""}</div>
  </div>`;
}
/* Filtre de catégorie avec recherche */
function catFilterHtml(sel){
  const all = [{id:"",name:"Toutes catégories"},...orderedCats(),...REV,...EPARGNE];
  const cur = all.find(c=>c.id===(sel||""))?.name || "Toutes catégories";
  return `<div class="cf-wrap"><button type="button" class="cf-btn" data-act="cf-open" aria-haspopup="listbox" aria-expanded="${!!UI.cfOpen}">${esc(cur)} <span class="caret">▾</span></button>
  ${UI.cfOpen?`<div class="cf-pop"><input type="search" id="cf-q" placeholder="Rechercher une catégorie" autocomplete="off" aria-label="Rechercher une catégorie">
    <div class="cf-list" role="listbox">${catFilterItems("")}</div></div>`:""}</div>`;
}
function catFilterItems(q){
  const n = norm(q); const groups = [...GROUPS.map(g=>({name:g.name,items:CATS.filter(c=>c.g===g.id)})),{name:"Exceptionnel",items:CATS.filter(c=>c.g==="exc")},{name:"Revenus",items:REV},{name:"Épargne",items:EPARGNE}];
  let out = !n ? `<button type="button" class="cf-item${!UI.f.cat?" sel":""}" data-cf="">Toutes catégories</button>` : "";
  for (const g of groups){ const it = g.items.filter(c=>!n || norm(c.name).includes(n)); if (!it.length) continue;
    out += `<div class="cf-grp">${esc(g.name)}</div>` + it.map(c=>`<button type="button" class="cf-item${UI.f.cat===c.id?" sel":""}" data-cf="${c.id}" role="option">${esc(c.name)}</button>`).join(""); }
  return out || `<div class="cf-empty small muted">Aucune catégorie</div>`;
}
/* Totaux des transactions affichées (après filtres) */
function txTotals(L){
  const out = r2(L.filter(t=>t.amount<0).reduce((s,t)=>s-t.amount,0)), inn = r2(L.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)), net = r2(inn-out);
  const bud = r2(L.filter(counts).reduce((s,t)=>s+spendOf(t),0));
  return `<div class="tx-totals" aria-live="polite">
    <div><span class="tt-lbl">Transactions</span><b class="num">${L.length}</b></div>
    <div><span class="tt-lbl">Sorties</span><b class="num">${fmt(-out)}</b></div>
    <div><span class="tt-lbl">Entrées</span><b class="num amt in">+${fmt(inn)}</b></div>
    <div><span class="tt-lbl">Net</span><b class="num ${net>0?"amt in":""}">${net>0?"+":""}${fmt(net)}</b></div>
    <div><span class="tt-lbl">Dans les budgets</span><b class="num">${fmt(bud)}</b></div>
  </div>`;
}
function vTx(){
  const f = UI.f, months = monthsAvailable(); if(!UI.month) UI.month=lastDataMonth();
  const mSel = f.month===undefined? UI.month : f.month;
  let L = S.tx.filter(t=> !mSel || mk(t.date)===mSel);
  if (f.event) L=S.tx.filter(t=>t.event===f.event);
  if (f.acc) L=L.filter(t=>t.acc===f.acc); if (f.bud) L=L.filter(t=>t.budget===f.bud); if (f.cat) L=L.filter(t=>t.cat===f.cat);
  if (f.status==="avalider") L=L.filter(t=>t.status==="avalider"); if (f.status==="neutre") L=L.filter(t=>!counts(t)); if (f.status==="excel") L=L.filter(t=>String(t.why).startsWith("Repris"));
  if (f.q){ const q=norm(f.q); L=L.filter(t=>norm(t.desc+" "+t.sub).includes(q)); }
  // Masque seulement les lignes affichées « Hors budget ». Les transactions à valider restent visibles.
  const nHidden = UI.hideNeutral ? L.filter(t=>horsBudget(t)&&t.status!=="avalider").length : 0;
  if (UI.hideNeutral) L=L.filter(t=>!horsBudget(t)||t.status==="avalider");
  L.sort((a,b)=> UI.sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const nVal = L.filter(t=>t.status==="avalider").length;
  return `<div class="toolbar"><h1>Transactions</h1><button class="btn" data-act="add-open">+ Ajouter à la main</button></div>
  ${eventsCard()}
  ${f.event?`<div class="proto-note">Transactions de l'événement « ${esc(S.events.find(e=>e.id===f.event)?.name)} », tous mois confondus. <button class="btn ghost small" data-act="ev-clear">Retirer ce filtre</button></div>`:""}
  <div id="add-form" hidden class="card"><form class="form" data-form="add">
    <label>Date<input type="date" id="ad-date" value="${TODAY}" required></label>
    <label>Payé par (compte)<select id="ad-acc">${S.accounts.map(a=>`<option value="${a.id}">${esc(accLabel(a))}</option>`).join("")}</select></label>
    <label>Description<input id="ad-desc" required placeholder="Marché Jean-Talon"></label>
    <label>Montant (dépense)<input id="ad-amt" type="number" step="0.01" min="0" required placeholder="25,00"></label>
    <label>Catégorie<select id="ad-cat">${catOptions("courses",null,"depense")}</select></label>
    <label>Pour qui<select id="ad-bud">${budOptions("commun")}</select></label>
    <button class="btn primary" type="submit">Ajouter</button></form></div>
  <div class="card">
    <div class="filters">
      <select id="f-month" aria-label="Mois"><option value="">Tous les mois</option>${months.map(k=>`<option value="${k}" ${mSel===k?"selected":""}>${monthLabel(k)}</option>`).join("")}</select>
      <select id="f-acc" aria-label="Compte"><option value="">Tous les comptes</option>${S.accounts.map(a=>`<option value="${a.id}" ${f.acc===a.id?"selected":""}>${esc(accLabel(a))}</option>`).join("")}</select>
      <select id="f-bud" aria-label="Pour qui"><option value="">Pour tout le monde</option>${["commun","A","B"].map(b=>`<option value="${b}" ${f.bud===b?"selected":""}>${esc(budLabel(b))}</option>`).join("")}</select>
      ${catFilterHtml(f.cat)}
      <select id="f-status" aria-label="État"><option value="">Tous les états</option><option value="avalider" ${f.status==="avalider"?"selected":""}>À valider</option><option value="excel" ${f.status==="excel"?"selected":""}>Repris de l'Excel</option><option value="neutre" ${f.status==="neutre"?"selected":""}>Hors budget</option></select>
      <label class="toggle"><input type="checkbox" id="hide-neutral" ${UI.hideNeutral?"checked":""}> Masquer les transactions hors budget${nHidden?` <span class="muted">(${nHidden})</span>`:""}</label>
      <input id="f-q" type="search" placeholder="Rechercher" value="${esc(f.q)}" aria-label="Rechercher">
      ${nVal?`<button class="btn small" data-act="ok-all">Valider les ${nVal} affichées</button>`:""}
    </div>
    ${txTotals(L)}
    <div class="small muted" style="margin:6px 0 4px">Une correction est retenue pour ce commerçant (et ce montant) et appliquée aux transactions semblables non validées. Les virements Interac et les catégories « à confirmer » restent à valider à chaque fois.</div>
    <div class="tx-list">
      <div class="tx head"><div><button class="sort-h" data-act="sort-toggle" aria-label="Inverser le tri par date">Date ${UI.sortAsc?"▲":"▼"}</button></div><div>Description</div><div>Compte</div><div>Catégorie</div><div>Pour qui</div><div>Type</div><div style="text-align:right">Montant</div></div>
      ${L.map(txRow).join("") || `<div class="empty">Aucune transaction pour ces filtres.</div>`}
    </div>
  </div>`;
}

/* ---------- Import CSV Scotiabank ---------- */
function parseCSV(text){
  text = text.replace(/^﻿/,"");
  const rows=[]; let row=[], cur="", q=false;
  for (let i=0;i<text.length;i++){ const c=text[i];
    if (q){ if (c==='"'){ if (text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else if (c==='"') q=true; else if (c===','){ row.push(cur); cur=""; } else if (c==="\n"||c==="\r"){ if(c==="\r"&&text[i+1]==="\n") i++; row.push(cur); rows.push(row); row=[]; cur=""; } else cur+=c; }
  if (cur!==""||row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r=>r.some(x=>x.trim()!==""));
}
function readScotia(text, fileName){
  const rows = parseCSV(text); if (!rows.length) throw new Error("Le fichier est vide.");
  const H = rows[0].map(h=>norm(h));
  const ix = n => H.indexOf(n);
  const isChq = ix("solde")>=0, isCard = ix("numero de carte associee")>=0;
  if ((!isChq && !isCard) || ix("date")<0 || ix("montant")<0) throw new Error("Format non reconnu. L'outil lit les CSV Scotiabank (colonnes Date, Description, Sous-description, Montant, et Solde ou Numéro de carte associée).");
  let period=null; const pm = (rows[1]?.[ix("filtre")]||"").match(/Date de d[ée]but=(\d{4}-\d\d-\d\d), Date de fin=(\d{4}-\d\d-\d\d)/); if(pm) period={from:pm[1],to:pm[2]};
  const out=[]; let last4=null;
  rows.slice(1).forEach((r,i)=>{
    const date=(r[ix("date")]||"").trim(); if(!/^\d{4}-\d\d-\d\d$/.test(date)) return;
    let amount=parseFloat((r[ix("montant")]||"0").replace(",",".")); if (isCard) amount=-amount;
    const o={line:i+2,kind:isChq?"cheque":"carte",date,desc:(r[ix("description")]||"").replace(/\s+$/,""),sub:(r[ix("sous-description")]||"").trim(),amount:r2(amount)};
    if (isChq) o.balance=parseFloat(r[ix("solde")]);
    if (isCard){ const st=(r[ix("etat")]||"").trim(); o.pending = !!st && !/inscrit/i.test(deaccent(st)); const c=(r[ix("numero de carte associee")]||"").replace(/\D/g,""); if(c) last4=c.slice(-4); }
    out.push(o);
  });
  return {fileName,kind:isChq?"cheque":"carte",period,last4,rows:out};
}
function suggestAccount(p){
  if (p.kind==="carte"){ const a=S.accounts.find(a=>a.kind==="carte"&&a.last4===p.last4); return a?{id:a.id,why:`Reconnu par le numéro de carte ····${p.last4}`}:{id:null,why:`Carte ····${p.last4||"?"} jamais vue : choisissez à qui elle appartient (retenu ensuite).`}; }
  for (const a of S.accounts.filter(a=>a.kind==="cheque")){
    const bals = new Set(S.tx.filter(t=>t.acc===a.id&&t.balance!=null).map(t=>t.balance.toFixed(2)));
    if (p.rows.some(r=>bals.has(r.balance.toFixed(2)))) return {id:a.id,why:"Reconnu par la continuité du solde"};
  }
  // Salaire déjà vu dans l'Excel
  for (const r of p.rows.filter(r=>r.amount>0)){ const h = S.history.find(h=>h.kind==="rev"&&Math.abs(h.amount-r.amount)<0.005&&Math.abs(dayDiff(h.date,r.date))<=4&&h.payer); if (h) return {id:S.accounts.find(a=>a.kind==="cheque"&&a.owner===h.payer).id,why:`Reconnu grâce au fichier Excel (revenu de ${S.names[h.payer]})`}; }
  return {id:null,why:"Le CSV du compte chèque ne contient pas de numéro de compte : choisissez le compte."};
}
function analyze(p, accId){
  const a = acc(accId); const existing = S.tx.filter(t=>t.acc===accId);
  const dkey = (date,amount,m,bal) => [date,amount.toFixed(2),m,bal!=null?bal.toFixed(2):""].join("|");
  const pool = {}; for (const t of existing){ const k=dkey(t.date,t.amount,merchantOf(a.kind,t.desc,t.sub),a.kind==="cheque"?t.balance:null); pool[k]=(pool[k]||0)+1; }
  const usedMatch = new Set(), usedHist = new Set();
  return p.rows.map(r=>{
    const c = classify(r,a);
    const item = {...r,acc:accId,subcat:null,...c,status:c.conf>=S.threshold?"ok":"avalider",include:true,flag:null,matchWith:null,hist:null};
    const k = dkey(r.date,r.amount,merchantOf(a.kind,r.desc,r.sub),a.kind==="cheque"?r.balance:null);
    if (pool[k]){ pool[k]--; item.flag="doublon"; item.include=false; return item; }
    if (r.pending){ item.flag="attente"; item.include=false; return item; }
    if (c.type==="paiement_carte"){
      const o = S.tx.find(t=>t.type==="paiement_carte"&&!t.matchId&&!usedMatch.has(t.id)&&t.acc!==accId&&acc(t.acc)?.owner===a.owner&&Math.abs(t.amount+r.amount)<0.005&&Math.abs(dayDiff(t.date,r.date))<=3);
      if (o){ usedMatch.add(o.id); item.matchWith=o.id; item.flag="apparie"; } else item.flag="paiement";
      return item;
    }
    const h = findHistory({...r,type:c.type}, a.owner, usedHist);
    if (h){ usedHist.add(h.id); Object.assign(item, fromHistory(h), {status:"ok",hist:h.id,flag:"excel"}); }
    return item;
  });
}
function doImport(){
  const P = UI.pending, a = acc(P.accId);
  if (P.parsed.kind==="carte" && P.parsed.last4 && !a.last4) a.last4 = P.parsed.last4;
  const imp = {id:nid("imp"),at:(d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`)(new Date()),file:P.parsed.fileName,acc:a.id,period:P.parsed.period,added:0,skipped:0,fromExcel:0,snapshot:{opening:a.opening?{...a.opening}:null,bank:a.bank?{...a.bank}:null}};
  const added=[];
  for (const it of P.items){
    if (!it.include){ imp.skipped++; continue; }
    const t = {id:nid("t"),acc:a.id,date:it.date,desc:it.desc,sub:it.sub,amount:it.amount,balance:it.balance??null,type:it.type,cat:it.cat,subcat:it.subcat||null,budget:it.budget,conf:it.conf,why:it.why,status:it.status,source:P.parsed.fileName,importId:imp.id,matchId:null};
    if (it.matchWith){ const o=S.tx.find(x=>x.id===it.matchWith); if(o){ o.matchId=t.id; t.matchId=o.id; } }
    if (it.hist){ const h=S.history.find(h=>h.id===it.hist); if(h){ h.matched=t.id; imp.fromExcel++; } }
    S.tx.push(t); added.push(t); imp.added++;
  }
  for (const t of added) if (t.hist || String(t.why).startsWith("Repris")) learnFrom(t);
  if (a.kind==="cheque"){
    const rows = P.parsed.rows.filter(r=>r.balance!=null).map((r,i)=>({...r,i}));
    if (rows.length){
      const oldest = rows.reduce((x,y)=> y.date<x.date || (y.date===x.date && y.i>x.i) ? y : x);
      const newest = rows.reduce((x,y)=> y.date>x.date || (y.date===x.date && y.i<x.i) ? y : x);
      const op = {date:oldest.date,amount:r2(oldest.balance-oldest.amount)};
      if (!a.opening || op.date < a.opening.date) a.opening = op;
      if (!a.bank || newest.date >= a.bank.date) a.bank = {date:newest.date,balance:newest.balance};
    }
  }
  S.imports.unshift(imp); UI.pending=null; UI.month=null;
  toast(`${imp.added} transaction(s) importée(s)${imp.fromExcel?`, dont ${imp.fromExcel} classée(s) grâce à l'Excel`:""}, ${imp.skipped} ignorée(s).`);
  render();
}
function undoImport(id){
  const imp = S.imports.find(i=>i.id===id); if(!imp) return;
  const gone = new Set(S.tx.filter(t=>t.importId===id).map(t=>t.id));
  for (const t of S.tx) if (t.matchId && gone.has(t.matchId)) t.matchId=null;
  for (const h of S.history) if (gone.has(h.matched)) h.matched=null;
  S.tx = S.tx.filter(t=>!gone.has(t.id));
  const a = acc(imp.acc); a.opening=imp.snapshot.opening; a.bank=imp.snapshot.bank;
  imp.undone = true; toast(`Import annulé : ${gone.size} transaction(s) retirée(s).`); render();
}
const FLAG = {doublon:["neutral","Doublon, ignoré"],attente:["neutral","En attente, ignoré"],apparie:["info","Paiement de carte · apparié"],paiement:["info","Paiement de carte · en attente de l'autre relevé"],excel:["good","✓ Trouvé dans l'Excel"]};
function vHistoryCard(){
  const H = UI.hist;
  const matched = S.history.filter(h=>h.matched).length, total = S.history.length;
  let body;
  if (H){
    const byMonth = {}; for (const l of H.lines){ const k=mk(l.date); byMonth[k]=(byMonth[k]||0)+1; }
    const unk = Object.entries(H.unknownCats);
    body = `<dl class="kv" style="margin-top:4px"><dt>Fichier</dt><dd>${esc(H.fileName)}</dd>
      <dt>Année</dt><dd><input id="hist-year" class="amtin num" type="number" value="${H.year}" style="width:90px"> <span class="small muted">les onglets n'indiquent que le jour</span></dd>
      <dt>Lignes lues</dt><dd>${H.lines.filter(l=>l.kind==="dep").length} dépenses et ${H.lines.filter(l=>l.kind==="rev").length} revenus, sur ${Object.keys(byMonth).length} mois</dd>
      <dt>Catégories</dt><dd>${unk.length?`<span class="chip warn">! ${unk.length} inconnue(s)</span> ${unk.map(([k,v])=>esc(k)+" ("+v+")").join(", ")} → classées dans « Autres »`:`<span class="chip good">✓ Toutes reconnues</span>`}</dd>
      <dt>Budget</dt><dd>${H.budget.A?`« Budget ${esc(S.names.A)} » : ${H.budget.A.length} catégories, remplacera le budget actuel. CeliApp remplacé par l'objectif de ${fmt0(S.savings.A.celiapp)} par an ; Matelas de sécurité traité comme épargne.${H.budUnknown.length?` Ignorées : ${H.budUnknown.map(esc).join(", ")}.`:""}`:"aucun onglet Budget trouvé"}${H.budget.B?"":` <span class="small muted">Budget de ${esc(S.names.B)} laissé vide.</span>`}</dd>
      <dt>Avances</dt><dd>${H.debts?`Soldes « ${esc(S.names.B)} doit » lus pour ${Object.keys(H.debts).length} mois, pour comparaison`:"onglet Résumé non trouvé"}</dd>
      ${H.problems.length?`<dt>Remarques</dt><dd class="small">${H.problems.slice(0,4).map(esc).join("<br>")}${H.problems.length>4?"<br>…":""}</dd>`:""}</dl>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap"><button class="btn" data-act="hist-cancel">Abandonner</button><button class="btn primary" data-act="hist-go">Utiliser cet historique</button></div>`;
  } else if (total){
    const months = {}; for (const h of S.history){ const k=mk(h.date); months[k]=months[k]||[0,0]; months[k][0]++; if(h.matched) months[k][1]++; }
    body = `<div class="small" style="margin-bottom:8px">${esc(S.historyFile)} · ${total} lignes · <b>${matched}</b> associées à une transaction bancaire.</div>
      <div class="table-x"><table><thead><tr><th>Mois</th><th class="r">Lignes Excel</th><th class="r">Associées</th><th></th></tr></thead><tbody>
      ${Object.keys(months).sort().map(k=>`<tr><td>${monthLabel(k)}</td><td class="r num">${months[k][0]}</td><td class="r num">${months[k][1]}</td><td>${months[k][1]?"":"<span class='small muted'>Importez les relevés de ce mois</span>"}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="small muted" style="margin-top:8px">Les lignes non associées sont normales tant que les relevés du mois ne sont pas importés.</div>
      ${unmatchedHtml()}`;
  } else body = `<div class="small">Déposez votre fichier Excel de suivi (un onglet par mois, colonnes Date, Montant, Description, Catégorie, Pour qui, Par qui). Chaque transaction bancaire importée de janvier à aujourd'hui sera classée comme dans votre fichier quand le payeur, le montant et la date (±4 jours) concordent. Le fichier est lu dans ce navigateur, rien n'est envoyé.</div>
    <label class="btn" for="xls-in" style="display:inline-block;margin-top:10px">Choisir le fichier Excel</label><input type="file" id="xls-in" accept=".xlsx,.xls" hidden>`;
  return `<div class="card"><div class="card-h"><h2>Historique : votre fichier Excel</h2>${total?`<span class="chip good">✓ Chargé</span>`:""}</div>${body}</div>`;
}
function unmatchedHtml(){
  const have = new Set(S.tx.filter(t=>t.importId).map(t=>acc(t.acc).owner+"|"+mk(t.date)));
  const L = S.history.filter(h=>!h.matched && !h.ignored && h.payer && have.has(h.payer+"|"+mk(h.date))).sort((a,b)=>a.date.localeCompare(b.date));
  if (!L.length) return `<div style="margin-top:12px"><span class="chip good">✓ Aucune ligne orpheline</span> <span class="small muted">pour les mois dont les relevés sont importés.</span></div>`;
  return `<h3 style="margin-top:16px">Lignes Excel sans transaction bancaire (${L.length})</h3>
    <div class="small muted" style="margin:4px 0 8px">Mois déjà importés seulement. Payée comptant ou depuis un autre compte : ajoutez-la. Montant différent (devise, pourboire) ou ligne qui regroupe plusieurs paiements : ignorez-la et corrigez la transaction bancaire.</div>
    <div class="table-x"><table><thead><tr><th>Date</th><th>Par</th><th>Description</th><th>Catégorie</th><th>Pour qui</th><th class="r">Montant</th><th></th></tr></thead><tbody>
    ${L.slice(0,40).map(h=>`<tr><td class="num">${h.date}${h.noDate?' <span class="chip warn">sans date</span>':""}</td><td>${esc(S.names[h.payer])}</td><td>${esc(h.desc)}</td><td>${esc(h.rawCat||"—")}</td><td>${h.budget?esc(budLabel(h.budget)):"—"}</td><td class="r num">${fmt(h.amount)}</td>
      <td style="white-space:nowrap"><button class="btn small" data-act="h-cash" data-h="${h.id}">Ajouter (comptant)</button> <button class="btn ghost small" data-act="h-ign" data-h="${h.id}">Ignorer</button></td></tr>`).join("")}
    </tbody></table></div>${L.length>40?`<div class="small muted">… et ${L.length-40} autres.</div>`:""}`;
}
function vImport(){
  const P = UI.pending; let body = "";
  if (P){
    const it = P.items; const nVal = it.filter(x=>x.include&&x.status==="avalider").length;
    const show = UI.importFilter==="val" ? it.filter(x=>x.include&&x.status==="avalider") : it;
    body = `<div class="card">
      <div class="card-h"><h2>Aperçu : ${esc(P.parsed.fileName)}</h2><span class="chip info">${P.parsed.kind==="cheque"?"Compte chèque":"Carte de crédit"}</span></div>
      <dl class="kv"><dt>Période</dt><dd>${P.parsed.period?`${P.parsed.period.from} au ${P.parsed.period.to}`:"non indiquée"}</dd>
        <dt>Compte</dt><dd><select id="imp-acc">${P.accId?"":`<option value="">Choisir…</option>`}${S.accounts.filter(a=>a.kind===P.parsed.kind).map(a=>`<option value="${a.id}" ${P.accId===a.id?"selected":""}>${esc(accLabel(a))}</option>`).join("")}</select> <span class="small muted">${esc(P.sugg.why)}</span></dd>
        <dt>Lignes</dt><dd>${it.length} lues · ${it.filter(x=>x.include).length} à importer · ${it.filter(x=>x.flag==="excel").length} trouvée(s) dans l'Excel · ${it.filter(x=>x.flag==="doublon").length} doublon(s) · ${nVal} à valider</dd></dl>
      ${P.accId?`<div class="filters" style="margin:14px 0 8px;justify-content:space-between"><div class="seg"><button data-imf="all" aria-pressed="${UI.importFilter!=="val"}">Toutes</button><button data-imf="val" aria-pressed="${UI.importFilter==="val"}">À valider (${nVal})</button></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="imp-cancel">Abandonner</button><button class="btn primary" data-act="imp-go">Importer ${it.filter(x=>x.include).length} transaction(s)</button></div></div>
      <div class="table-x"><table><thead><tr><th></th><th>Date</th><th>Description</th><th>Type</th><th>Catégorie</th><th>Pour qui</th><th>Confiance</th><th class="r">Montant</th></tr></thead><tbody>
      ${show.map(x=>{ const i = it.indexOf(x); return `<tr style="${x.include?"":"opacity:.5"}"><td><input type="checkbox" data-inc="${i}" ${x.include?"checked":""} aria-label="Importer cette ligne"></td><td class="num">${x.date}</td>
        <td><div>${esc(x.desc)}</div><div class="small muted">${esc(x.sub)}</div>${x.flag?`<span class="chip ${FLAG[x.flag][0]}">${FLAG[x.flag][1]}</span>`:""}</td>
        <td>${TYPES[x.type]?.l||x.type}</td><td>${x.cat?esc(catName(x.cat))+(x.subcat?" › "+esc(x.subcat):""):"<span class='muted'>—</span>"}</td><td>${x.budget&&TYPES[x.type]?.count?esc(budLabel(x.budget)):"<span class='muted'>—</span>"}</td>
        <td>${x.status==="avalider"?`<span class="chip warn" title="${esc(x.why)}">${x.conf} % · à valider</span>`:`<span class="chip good" title="${esc(x.why)}">${x.conf} %</span>`}<div class="small muted" style="max-width:220px">${x.status==="avalider"?esc(x.why):""}</div></td>
        <td class="r num ${x.amount>0?"amt in":""}">${x.amount>0?"+":""}${fmt(x.amount)}</td></tr>`;}).join("")}
      </tbody></table></div>
`
      : `<div class="empty">Choisissez le compte pour voir l'aperçu.</div>`}
    </div>`;
  }
  return `<div class="toolbar"><h1>Importer</h1></div>
  <label class="drop" id="drop" for="file-in">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15V3m0 0L7 8m5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>
    <b>Déposez un CSV Scotiabank ici, ou touchez pour choisir</b>
    <span class="small muted">Compte chèque ou carte de crédit · un mois ou plusieurs · rien n'est envoyé</span>
    <input type="file" id="file-in" accept=".csv,text/csv" hidden>
  </label>
  ${UI.importError?`<div class="card" style="border-color:var(--bad);color:var(--bad)">${esc(UI.importError)}</div>`:""}
  ${body}
  <div class="card"><div class="card-h"><h2>Historique des imports</h2></div>
    ${S.imports.length? `<div class="table-x"><table><thead><tr><th>Date</th><th>Fichier</th><th>Compte</th><th>Période</th><th class="r">Ajoutées</th><th class="r">Via Excel</th><th class="r">Ignorées</th><th></th></tr></thead><tbody>
      ${S.imports.map(i=>`<tr style="${i.undone?"opacity:.5":""}"><td class="num">${i.at}</td><td>${esc(i.file)}</td><td>${esc(accLabel(acc(i.acc)))}</td><td class="small">${i.period?i.period.from+" → "+i.period.to:"—"}</td><td class="r num">${i.added}</td><td class="r num">${i.fromExcel||0}</td><td class="r num">${i.skipped}</td><td>${i.undone?"<span class='chip neutral'>Annulé</span>":`<button class="btn small" data-undo="${i.id}">Annuler l'import</button>`}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">Aucun import pendant cette session.</div>`}
  </div>
  ${vHistoryCard()}`;
}
function loadParsed(p){
  UI.importError=null; const sg = suggestAccount(p);
  UI.pending = {parsed:p,accId:sg.id,sugg:sg,items:sg.id?analyze(p,sg.id):[]}; UI.importFilter="all"; render();
}
function handleFile(file){
  const r = new FileReader();
  r.onload = () => { try { loadParsed(readScotia(String(r.result), file.name)); } catch(e){ UI.importError=e.message; UI.pending=null; render(); } };
  r.readAsText(file, "utf-8");
}
let xlsxLoading=null;
function loadXLSX(){
  if (window.XLSX) return Promise.resolve();
  return xlsxLoading = xlsxLoading || new Promise((ok,ko)=>{ const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload=ok; s.onerror=()=>ko(new Error("Impossible de charger le lecteur Excel. Vérifiez la connexion et réessayez.")); document.head.appendChild(s); });
}
function handleExcel(file){
  UI.importError=null;
  loadXLSX().then(()=>new Promise((ok,ko)=>{ const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=()=>ko(new Error("Lecture du fichier impossible.")); r.readAsArrayBuffer(file); }))
  .then(buf=>{
    const wb = XLSX.read(buf,{type:"array"}); const sheets={};
    for (const n of wb.SheetNames) sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null});
    const y = (file.name.match(/20\d\d/)||[TODAY.slice(0,4)])[0];
    UI.histSheets = sheets; UI.hist = readHistory(sheets, y, file.name);
    if (!UI.hist.lines.length) throw new Error("Aucune ligne trouvée : le fichier doit avoir un onglet par mois (Janvier, Février…) avec les colonnes Date, Montant, Catégorie.");
    render();
  }).catch(e=>{ UI.importError=e.message; UI.hist=null; render(); });
}
/* ---------- Budgets ---------- */
function vBudgets(){
  const cols = ["commun","A","B"];
  const monthsTo = d => { const [y,m]=d.split("-").map(Number); const [ty,tm]=TODAY.split("-").map(Number); return Math.max(1,(y-ty)*12+(m-tm)); };
  const tot = f => budgetCats().reduce((s,c)=>s+f(c.id),0);
  const salRow = p => { const sal=S.salary?.[p]||0, mb=budgetTotal(p)+EPARGNE.reduce((s,e)=>s+(S.savings[p]?.[e.id]||0),0)/12, y=TODAY.slice(0,4);
    const got = r2(S.tx.filter(t=>t.type==="revenu"&&t.cat==="salaire"&&acc(t.acc).owner===p&&t.date.startsWith(y)).reduce((s,t)=>s+t.amount,0));
    return `<tr><td>${esc(S.names[p])}</td><td class="r"><input class="amtin num" style="width:110px" type="number" min="0" step="100" id="sal-${p}" value="${sal||""}" placeholder="0" aria-label="Salaire annuel ${esc(S.names[p])}"></td>
      <td class="r num">${sal?fmt(sal/12):"—"}</td><td class="r num">${fmt0(mb)}</td><td class="r num">${sal?`<span class="chip ${sal/12-mb<0?"bad":"good"}">${fmt(sal/12-mb)}</span>`:"—"}</td><td class="r num muted">${fmt(got)}</td></tr>`; };
  return `<div class="toolbar"><h1>Budgets mensuels</h1></div>
  <div class="card"><div class="card-h"><h2>Revenus</h2><span class="small muted">Salaire annuel net, après impôts</span></div>
    <div class="table-x"><table><thead><tr><th>Personne</th><th class="r">Salaire annuel</th><th class="r">Par mois</th><th class="r">Budget du mois</th><th class="r">Marge par mois</th><th class="r">Salaire reçu en ${TODAY.slice(0,4)}</th></tr></thead><tbody>${salRow("A")}${salRow("B")}</tbody></table></div>
    <div class="small muted" style="margin-top:8px">Budget du mois = perso + 50 % du commun + épargne réservée. La marge est ce qui reste chaque mois si le budget est respecté.</div></div>
  ${note(`Montants par mois, sauf en suivi annuel où vous saisissez le montant de l'année (pratique pour la coiffure ou le permis). Étiquettes : « fixe » garde la catégorie verte jusqu'à 100 % de son budget ; « à confirmer » fait valider chaque transaction de la catégorie. Saisissez le commun à 100 % et le perso de chacun. Le budget de ${esc(S.names.A)} et celui de ${esc(S.names.B)} comprennent automatiquement 50 % du commun, comme dans votre fichier Excel (loyer de 1 640 $ → 820 $ chacun).`)}
  ${GROUPS.map(g=>`<div class="card"><div class="card-h"><h2>${esc(g.name)}</h2><span class="small muted">Glissez ⠿ pour réordonner · touchez une étiquette pour l'activer</span></div><div class="table-x"><table class="bud-table"><thead><tr><th>Catégorie</th>${cols.map(b=>`<th class="r">${b==="commun"?"Commun (100 %)":esc(S.names[b])+" perso"}</th>`).join("")}<th class="r">Total ${esc(S.names.A)}</th><th class="r">Total ${esc(S.names.B)}</th><th>Suivi</th></tr></thead><tbody>
    ${CATS.filter(c=>c.g===g.id).length?"":`<tr class="drow-empty" data-group="${g.id}"><td colspan="7" class="small muted">Déposez une catégorie ici</td></tr>`}
    ${CATS.filter(c=>c.g===g.id).map(c=>{ const an=isAnnual(c.id), k=an?12:1;
      return `<tr data-cat="${c.id}"><td><button class="drag-h" data-drag="${c.id}" aria-label="Déplacer ${esc(c.name)} (flèches haut et bas)" title="Glisser pour déplacer">⠿</button>${esc(c.name)}
      <div class="tag-row"><button class="tag${c.fixed?" on":""}" data-tag="fixed" data-c="${c.id}" aria-pressed="${!!c.fixed}" title="Reste verte jusqu'à 100 % du budget">fixe</button><button class="tag${c.always?" on":""}" data-tag="always" data-c="${c.id}" aria-pressed="${!!c.always}" title="Chaque transaction de cette catégorie est à valider">à confirmer</button></div></td>
      ${cols.map(b=>`<td class="r"><input class="amtin num" type="number" min="0" step="${an?10:5}" data-bud="${b}|${c.id}" value="${S.budgets[b][c.id]?r2(S.budgets[b][c.id]*k):""}" placeholder="0" aria-label="${esc(c.name)} ${esc(budLabel(b))}${an?" par an":" par mois"}">${an&&S.budgets[b][c.id]?`<div class="small muted">${fmt(S.budgets[b][c.id])}/mois</div>`:""}</td>`).join("")}
      <td class="r num muted">${fmt0(budgetFor("A",c.id)*k)}${an?"/an":""}</td><td class="r num muted">${fmt0(budgetFor("B",c.id)*k)}${an?"/an":""}</td>
      <td><select class="mode-sel" data-mode="${c.id}" aria-label="Suivi de ${esc(c.name)}"><option value="mois" ${an?"":"selected"}>Mensuel</option><option value="annee" ${an?"selected":""}>Annuel</option></select></td></tr>`; }).join("")}
    ${(()=>{ const L=CATS.filter(c=>c.g===g.id); const sum=b=>L.reduce((s,c)=>s+(S.budgets[b][c.id]||0),0), tot=p=>L.reduce((s,c)=>s+budgetFor(p,c.id),0);
      const cell = v => `<td class="r num">${fmt0(v)}<div class="small muted">${fmt0(v*12)}/an</div></td>`;
      return `<tr class="grp-total"><td>Total ${esc(g.name)} <span class="small muted">par mois</span></td>${cols.map(b=>cell(sum(b))).join("")}${cell(tot("A"))}${cell(tot("B"))}<td></td></tr>`; })()}
  </tbody></table></div></div>`).join("")}
  <div class="card"><div class="table-x"><table><tbody><tr><th>Total par mois</th>${cols.map(b=>`<th class="r num">${fmt0(tot(c=>S.budgets[b][c]||0))}</th>`).join("")}<th class="r num">${esc(S.names.A)} : ${fmt0(budgetTotal("A"))}</th><th class="r num">${esc(S.names.B)} : ${fmt0(budgetTotal("B"))}</th></tr></tbody></table></div></div>
  <div class="grid-2">
    <div class="card"><div class="card-h"><h2>Dépenses planifiées et provisions</h2></div>
      <div class="table-x"><table><thead><tr><th>Dépense</th><th>Pour qui</th><th>Date</th><th class="r">Montant</th><th class="r">À mettre de côté</th></tr></thead><tbody>
      ${S.planned.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(p=>`<tr><td>${esc(p.name)}<div class="small muted">${esc(catName(p.cat))}</div></td><td>${esc(budLabel(p.budget))}</td><td class="num">${p.date}</td><td class="r num">${fmt0(p.amount)}</td><td class="r num"><b>${fmt(p.amount/monthsTo(p.date))}</b>/mois<div class="small muted">sur ${monthsTo(p.date)} mois</div></td></tr>`).join("")}
      </tbody></table></div>
      <form class="form" data-form="plan" style="margin-top:12px">
        <label>Nom<input id="pl-name" required placeholder="Pneus d'hiver"></label>
        <label>Date prévue<input id="pl-date" type="date" required></label>
        <label>Montant<input id="pl-amt" type="number" min="1" step="1" required></label>
        <label>Pour qui<select id="pl-bud">${budOptions("commun")}</select></label>
        <button class="btn" type="submit">Planifier</button></form>
    </div>
    <div class="stack"><div class="card"><div class="card-h"><h2>Épargne planifiée</h2></div>
      <div class="table-x"><table><thead><tr><th>Objectif annuel</th>${["A","B"].map(p=>`<th class="r">${esc(S.names[p])}</th>`).join("")}</tr></thead><tbody>
      ${EPARGNE.map(e=>`<tr><td>${esc(e.name)}</td>${["A","B"].map(p=>`<td class="r"><input class="amtin num" id="sv-${p}-${e.id}" type="number" min="0" step="100" value="${S.savings[p][e.id]||""}" placeholder="aucun" aria-label="${esc(e.name)} ${esc(S.names[p])}"></td>`).join("")}</tr>`).join("")}
      </tbody></table></div>
      <div class="small muted" style="margin-top:8px">Hors dépenses, mais réparti sur 12 mois dans le budget de la personne, quel que soit le rythme des virements. CeliApp : 8 000 $ → ${fmt(8000/12)} par mois (100 $ par mois, puis le solde en décembre). Matelas de sécurité : montant réservé sans virement, l'argent reste dans le compte.</div></div>
    <div class="card"><div class="card-h"><h2>Enveloppe exceptionnelle</h2></div>
      <label class="small muted" for="exc-in">Montant annuel</label>
      <div style="display:flex;gap:8px;align-items:center;margin:6px 0 12px"><input id="exc-in" class="amtin num" type="number" min="0" step="100" value="${S.excAnnual}" style="width:120px"> $ par an</div>
      <div class="num">Utilisé en ${TODAY.slice(0,4)} : <b>${fmt(excUsedYTD())}</b></div>
      <div class="small muted" style="margin-top:8px">Les transactions classées « Dépenses exceptionnelles » sont retirées des budgets mensuels et suivies ici.</div>
    </div></div>
  </div>`;
}

/* ---------- Comptes ---------- */
function vAccounts(){
  return `<div class="toolbar"><h1>Comptes et rapprochement</h1></div>
  ${note(`Le CSV chèque de Scotiabank donne le solde après chaque transaction : le rapprochement se fait sans relevé PDF.`)}
  <div class="acc-grid">${S.accounts.map(a=>{
    if (a.kind==="autre"){ const n=S.tx.filter(t=>t.acc===a.id).length; return `<div class="card"><div class="card-h"><h2>${esc(accLabel(a))}</h2><span class="chip neutral">Hors relevés</span></div><div class="small">${n} transaction(s) ajoutée(s) à la main ou depuis l'Excel (argent comptant, autre compte). Pas de rapprochement.</div></div>`; }
    if (a.kind==="carte"){
      const n = S.tx.filter(t=>t.acc===a.id).length, un = S.tx.filter(t=>t.acc===a.id&&t.type==="paiement_carte"&&!t.matchId).length;
      const lastD = S.tx.filter(t=>t.acc===a.id).map(t=>t.date).sort().at(-1) || TODAY;
      const owed = a.cardStart ? cardOwed(a, lastD>a.cardStart.date?lastD:a.cardStart.date) : null;
      return `<div class="card"><div class="card-h"><h2>${esc(accLabel(a))}</h2><span class="chip neutral">Carte de crédit</span></div>
      ${owed!=null?`<div class="recon-line"><span>Solde de départ (${a.cardStart.date})</span><span class="num">${fmt(a.cardStart.balance)}</span></div><div class="recon-line"><span>+ Achats − paiements et remboursements</span><span class="num">${fmt(owed-a.cardStart.balance)}</span></div><div class="recon-line"><b>Solde dû estimé (${lastD})</b><b class="num">${fmt(owed)}</b></div>`:""}
      <form class="form" style="margin:10px 0" data-form="cardstart" data-acc="${a.id}"><label>Solde dû au<input type="date" id="cs-date-${a.id}" value="${a.cardStart?.date||""}" required></label><label>Montant ($)<input type="number" step="0.01" min="0" id="cs-amt-${a.id}" value="${a.cardStart?.balance??""}" required></label><button class="btn" type="submit">${a.cardStart?"Mettre à jour":"Enregistrer"}</button></form>
      <div class="small muted">Saisissez une fois le solde indiqué sur un relevé PDF ou dans l'application Scotia, à une date donnée. L'outil le tient ensuite à jour avec chaque import. ${n} transactions.</div><div style="margin-top:8px">${un?`<span class="chip warn">! ${un} paiement(s) sans contrepartie chèque</span>`:`<span class="chip good">✓ Tous les paiements sont appariés</span>`}</div></div>`;
    }
    const r = recon(a);
    if (!r) return `<div class="card"><div class="card-h"><h2>${esc(accLabel(a))}</h2></div><div class="empty">Importez un CSV pour établir le solde de départ.</div></div>`;
    const ok = r.gap!=null && Math.abs(r.gap)<0.005; let hints = "";
    if (!ok && r.gap!=null){
      const amt = Math.abs(r.gap), same = S.tx.filter(t=>t.acc===a.id&&Math.abs(Math.abs(t.amount)-amt)<0.005);
      const dups=[], seen={}; for (const t of S.tx.filter(t=>t.acc===a.id)){ const k=t.date+t.amount; if(seen[k]) dups.push(t); seen[k]=1; }
      hints = `<div style="margin-top:12px"><h3>Pistes à vérifier</h3><ul class="small" style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">
        <li>${r.gap<0?`Une sortie de ${fmt(amt)} manque peut-être (frais mensuels du forfait, retrait). Importez le relevé le plus récent.`:`Une entrée de ${fmt(amt)} manque peut-être (dépôt, remboursement).`}</li>
        ${same.length?`<li>${same.length} transaction(s) de ce montant existent déjà : ${same.map(t=>esc(t.date+" "+prettyDesc(t))).join(", ")}.</li>`:`<li>Aucune transaction de ${fmt(amt)} dans ce compte.</li>`}
        <li>${dups.length?`${dups.length} doublon(s) possible(s) : même date et même montant.`:"Aucun doublon apparent."}</li></ul></div>`;
    }
    return `<div class="card"><div class="card-h"><h2>${esc(accLabel(a))}</h2>${ok?`<span class="chip good">✓ Concorde</span>`:`<span class="chip bad">✕ Écart ${fmt(r.gap)}</span>`}</div>
      <div class="recon-line"><span>Solde de départ (${a.opening.date})</span><span class="num">${fmt(a.opening.amount)}</span></div>
      <div class="recon-line"><span>+ Entrées − sorties importées</span><span class="num">${fmt(r.computed-a.opening.amount)}</span></div>
      <div class="recon-line"><b>Solde calculé</b><b class="num">${fmt(r.computed)}</b></div>
      <div class="recon-line"><span>Solde de la banque (${a.bank?.date||"—"})</span><span class="num">${r.bank!=null?fmt(r.bank):"—"}</span></div>${hints}</div>`;
  }).join("")}</div>
  ${compareHtml()}`;
}
function compareHtml(){
  const D = S.excelDebts;
  const months = D ? Object.keys(D).sort() : [];
  const lastImp = S.tx.filter(t=>t.importId).map(t=>mk(t.date)).sort().at(-1) || "";
  const endOf = k => `${k}-${pad(daysIn(k))}`;
  const label = v => Math.abs(v)<0.005 ? "Quittes" : v>0 ? `${esc(S.names.B)} doit ${fmt(v)}` : `${esc(S.names.A)} doit ${fmt(-v)}`;
  return `<div class="card" id="compare"><div class="card-h"><h2>Avances : l'outil comparé à votre Excel</h2><span class="small muted">Solde à la fin de chaque mois</span></div>
    ${D? `<div class="small muted" style="margin-bottom:8px">Départ : ${S.openingDebt?label(S.openingDebt.amount)+" au "+S.openingDebt.date:"aucun"}. Un écart signale une dépense absente des relevés importés, classée autrement, ou un mois où les relevés d'une seule personne sont importés.</div>
      <div class="table-x"><table><thead><tr><th>Fin de mois</th><th class="r">Excel</th><th class="r">Outil</th><th class="r">Écart</th><th>Relevés importés</th></tr></thead><tbody>
      ${months.filter(k=>k<=mk(TODAY) && k<=lastImp).map(k=>{ const e=D[k], o=settlement(endOf(k)), g=r2(o-e);
        const who = ["A","B"].filter(p=>S.tx.some(t=>t.importId&&acc(t.acc).owner===p&&mk(t.date)===k)).map(p=>S.names[p]);
        return `<tr><td>${monthLabel(k)}</td><td class="r num">${label(e)}</td><td class="r num">${label(o)}</td><td class="r">${Math.abs(g)<0.01?'<span class="chip good">✓</span>':`<span class="chip ${who.length===2?"bad":"neutral"} num">${fmt(g)}</span>`}</td><td class="small">${who.length?who.join(" et "):'<span class="muted">aucun</span>'}</td></tr>`; }).join("")}
      </tbody></table></div>${months.some(k=>k>lastImp&&k<=mk(TODAY))?`<div class="small muted" style="margin-top:8px">Les mois suivants apparaîtront au fil des imports.</div>`:""}`
    : `<div class="small">Chargez votre fichier Excel dans Importer : l'outil lira la ligne « ${esc(S.names.B)} doit » de l'onglet Résumé et la comparera à son propre calcul, mois par mois.</div>`}
  </div>`;
}

/* ---------- Paramètres ---------- */
function vSettings(){
  return `<div class="toolbar"><h1>Paramètres</h1></div>
  <div class="grid-2"><div class="stack">
    <div class="card"><div class="card-h"><h2>Vous deux</h2></div><div class="form">
      <label>Personne A<input id="nm-A" value="${esc(S.names.A)}"></label><label>Personne B<input id="nm-B" value="${esc(S.names.B)}"></label></div>
      <div class="small muted" style="margin-top:8px">Les noms servent aussi à lire les colonnes « Pour qui » et « Par qui » de votre fichier Excel.</div></div>
    <div class="card"><div class="card-h"><h2>Solde de départ des avances</h2></div><div class="form">
      <label>Date<input type="date" id="od-date" value="${S.openingDebt?.date||""}"></label>
      <label>${esc(S.names.B)} doit à ${esc(S.names.A)}<input type="number" step="0.01" id="od-amt" value="${S.openingDebt?.amount??""}"></label></div>
      <div class="small muted" style="margin-top:8px">Montant négatif si c'est ${esc(S.names.A)} qui doit. Les mois suivants sont calculés par l'outil.</div></div>
    <div class="card"><div class="card-h"><h2>Seuil de confiance</h2><b class="num" id="th-val">${S.threshold} %</b></div>
      <input type="range" id="th" min="50" max="100" step="5" value="${S.threshold}" style="width:100%" aria-label="Seuil de confiance">
      <div class="small muted">Sous ce seuil, une transaction est marquée « à valider ». Repris de l'Excel ou appris : 100 %. Mot-clé connu : 70 à 90 %. Toujours à valider, quel que soit le seuil : virements Interac, restaurants, alcool/bar.</div></div>
    <div class="card"><div class="card-h"><h2>Règles apprises</h2><span class="small muted">${Object.keys(S.rules).length} commerçants</span></div>
      <div class="table-x" style="max-height:260px;overflow:auto"><table><tbody>${Object.entries(S.rules).sort().map(([m,L])=>`<tr><td>${esc(m)}</td><td class="small">${L.map(e=>`${esc(catName(e.cat))} · ${esc(e.budget==="self"?"qui paie":e.budget?budLabel(e.budget):"")}${L.length>1?` (${fmt(e.amount)})`:""}`).join("<br>")}</td></tr>`).join("")}</tbody></table></div></div>
  </div><div class="stack">
    <div class="card"><div class="card-h"><h2>Sécurité</h2><span class="chip good">✓ Chiffré</span></div>
      <div class="small">Vos données sont chiffrées sur cet appareil (AES-256). Le mot de passe et la clé de récupération ne quittent jamais l'appareil. Verrouillage automatique après ${Lock.AUTO_LOCK_MIN} minutes d'inactivité.</div>
      <form class="form" data-form="pwd" style="margin-top:12px" autocomplete="off">
        <label>Nouveau mot de passe<input type="password" id="np1" minlength="10" required autocomplete="new-password"></label>
        <label>Confirmer<input type="password" id="np2" required autocomplete="new-password"></label>
        <button class="btn" type="submit">Changer le mot de passe</button></form>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-act="new-recovery">Générer une nouvelle clé de récupération</button><button class="btn" data-act="lock">Verrouiller maintenant</button></div>
      <div class="small muted" style="margin-top:8px">Une nouvelle clé de récupération remplace l'ancienne, qui ne fonctionnera plus.</div></div>
    ${Sync.card()}
    <div class="card"><div class="card-h"><h2>Sauvegarde</h2></div>
      <dl class="kv"><dt>Dernière sauvegarde</dt><dd>${S.lastBackup||"aucune"} ${!S.lastBackup||dayDiff(TODAY,S.lastBackup)>7?`<span class="chip warn">! plus de 7 jours</span>`:`<span class="chip good">✓</span>`}</dd>
</dl>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn primary" data-act="backup">Télécharger une sauvegarde chiffrée</button><button class="btn" data-act="exp-csv">Exporter les transactions (CSV)</button></div>
      <form class="form" data-form="restore" style="margin-top:12px" autocomplete="off">
        <label>Restaurer un fichier .budget<input type="file" id="rs-file" accept=".budget,application/json" required></label>
        <label>Son mot de passe ou sa clé<input type="password" id="rs-secret" required></label>
        <button class="btn" type="submit">Restaurer</button></form>
      <div class="small muted" style="margin-top:8px">La sauvegarde est chiffrée avec le mot de passe en vigueur au moment du téléchargement. Restaurer remplace toutes les données de cet appareil. L'export CSV, lui, n'est pas chiffré.</div></div>
    <div class="card"><div class="card-h"><h2>Données</h2></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="wipe-ask">Effacer toutes les transactions</button><button class="btn" data-act="destroy-ask">Supprimer le coffre de cet appareil</button></div>
      ${UI.confirm?`<div class="confirm-box"><b>${UI.confirm==="wipe"?"Effacer toutes les transactions, imports et règles apprises ?":"Supprimer toutes les données de cet appareil ?"}</b><div class="small">${UI.confirm==="wipe"?"Catégories, budgets, objectifs et historique Excel sont gardés.":"Sans sauvegarde, elles seront perdues. Les autres appareils et vos fichiers .budget ne sont pas touchés."}</div>
        <div style="display:flex;gap:8px;margin-top:8px"><button class="btn" data-act="confirm-no">Annuler</button><button class="btn danger" data-act="${UI.confirm==="wipe"?"wipe":"destroy"}">Confirmer</button></div></div>`:""}
      <div class="small muted" style="margin-top:8px">« Effacer » garde catégories, budgets, objectifs et historique Excel.</div></div>
  </div></div>`;
}


/* ============ Événements ============ */
document.addEventListener("click", e=>{
  const tg = e.target.closest("[data-tag]"); if (tg){ const c=catById(tg.dataset.c); c[tg.dataset.tag]=!c[tg.dataset.tag];
    S.catFlags = Object.fromEntries(CATS.map(x=>[x.id,{fixed:!!x.fixed,always:!!x.always}]));
    if (tg.dataset.tag==="always") for (const t of S.tx) if (t.cat===c.id && t.importId && !["Corrigé à la main","Validé"].includes(t.why) && !String(t.why).startsWith("Repris")) applyClass(t);
    toast(`« ${c.name} » : ${tg.dataset.tag==="fixed"?"fixe":"à confirmer"} ${c[tg.dataset.tag]?"activé":"retiré"}.`); render(); return; }
  const cf = e.target.closest("[data-cf]"); if (cf){ UI.f.cat=cf.dataset.cf; UI.cfOpen=false; render(); return; }
  if (UI.cfOpen && !e.target.closest(".cf-wrap")){ UI.cfOpen=false; render(); }
  const pk = e.target.closest("[data-pick]"); if (pk){ UI.month=pk.dataset.pick; UI.picker=false; render(); return; }
  if (UI.picker && !e.target.closest(".mpick") && !e.target.closest('[data-act="m-pick"]')){ UI.picker=false; render(); }
  const nb = e.target.closest(".nav-btn"); if (nb){ go(nb.dataset.view); return; }
  const sc = e.target.closest("[data-scope]"); if (sc){ UI.scope=sc.dataset.scope; render(); return; }
  const mb = e.target.closest(".mbar"); if (mb){ UI.period="mois"; UI.month=mb.dataset.m; render(); window.scrollTo(0,0); return; }
  const lb = e.target.closest(".link-btn[data-cat]"); if (lb){ UI.f={acc:"",bud:"commun",cat:lb.dataset.cat,status:"",q:"",month:lb.dataset.year?"":UI.month}; go("transactions"); return; }
  const cr = e.target.closest(".cat-row"); if (cr && cr.dataset.cat){ UI.f={acc:"",bud:"",cat:cr.dataset.cat,status:"",q:"",month:cr.dataset.year?"":UI.month}; go("transactions"); return; }
  const imf = e.target.closest("[data-imf]"); if (imf){ UI.importFilter=imf.dataset.imf; render(); return; }
  const un = e.target.closest("[data-undo]"); if (un){ undoImport(un.dataset.undo); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, ms = monthsAvailable();
  if (act==="period-mois"){ UI.period="mois"; render(); return; }
  if (act==="period-annee"){ UI.period="annee"; UI.year=TODAY.slice(0,4); render(); return; }
  if (act==="y-prev"||act==="y-next"){ UI.period="annee"; UI.year=String(+(UI.year||TODAY.slice(0,4))+(act==="y-prev"?-1:1)); render(); return; }
  if (act==="m-prev"||act==="m-next"){ UI.month=shiftMonth(UI.month,act==="m-prev"?-1:1); UI.picker=false; render(); }
  else if (act==="m-pick"){ UI.picker=!UI.picker; UI.pickYear=UI.month.slice(0,4); render(); document.querySelector(".mp-m.sel, .mp-m")?.focus(); }
  else if (act==="py-prev"||act==="py-next"){ UI.pickYear=String(+UI.pickYear+(act==="py-prev"?-1:1)); render(); }
  else if (act==="go-import"){ go("importer"); }
  else if (act==="sort-toggle"){ setSort(!UI.sortAsc); }
  else if (act==="cf-open"){ UI.cfOpen=!UI.cfOpen; render(); $("#cf-q")?.focus(); }
  else if (act==="see-val"){ UI.f={acc:"",bud:"",cat:"",status:"avalider",q:"",month:""}; go("transactions"); }
  else if (act==="ok"){ const t=S.tx.find(x=>x.id===b.dataset.id); t.status="ok"; t.conf=100; t.why="Validé"; const n=learnFrom(t); toast(n?`Validé. Appliqué à ${n} autre(s) transaction(s) semblable(s).`:"Validé."); render(); }
  else if (act==="ok-all"){ document.querySelectorAll(".tx[data-id]").forEach(r=>{ const t=S.tx.find(x=>x.id===r.dataset.id); if(t&&t.status==="avalider"){t.status="ok";t.why="Validé";learnFrom(t);} }); toast("Transactions validées."); render(); }
  else if (act==="add-open"){ $("#add-form").hidden=!$("#add-form").hidden; }
  else if (act==="imp-cancel"){ UI.pending=null; render(); }
  else if (act==="imp-go"){ doImport(); }
  else if (act==="hist-cancel"){ UI.hist=null; render(); }
  else if (act==="hist-go"){ const H=UI.hist; S.history=H.lines; S.historyFile=H.fileName; S.excelDebts=H.debts; if (H.budget.A) applyExcelBudget(H); UI.hist=null; const n=applyHistoryToTx(); toast(`${H.lines.length} lignes chargées. ${n} transaction(s) déjà importée(s) reclassée(s) selon votre Excel.`); render(); }
  else if (act==="go-comptes"){ go("comptes"); }
  else if (act==="ev-see"){ UI.f={acc:"",bud:"",cat:"",status:"",q:"",month:"",event:b.dataset.ev}; render(); }
  else if (act==="ev-clear"){ UI.f.event=""; render(); }
  else if (act==="go-compare"){ go("comptes"); setTimeout(()=>document.getElementById("compare")?.scrollIntoView(),50); }
  else if (act==="h-cash"||act==="h-ign"){ const h=S.history.find(x=>x.id===b.dataset.h); if(!h) return;
    if (act==="h-ign") h.ignored=true;
    else { const t={id:nid("t"),acc:h.payer+"".toLowerCase()==="A"?"a-cash":"a-cash",date:h.date,desc:h.desc||catName(h.cat),sub:"",amount:h.kind==="dep"?-h.amount:h.amount,balance:null,...fromHistory(h),subcat:null,status:"ok",source:"Excel",importId:null,matchId:null};
      t.acc = h.payer==="A"?"a-cash":"b-cash"; S.tx.push(t); h.matched=t.id; }
    toast(act==="h-ign"?"Ligne ignorée.":"Ajoutée au compte « Comptant / autre »."); render(); }
  else if (act==="exp-csv"){ download(`transactions-${TODAY}.csv`, "\uFEFF"+"date,compte,description,montant,type,categorie,sous_categorie,pour_qui,etat\n"+S.tx.map(t=>[t.date,accLabel(acc(t.acc)),prettyDesc(t),t.amount.toFixed(2),t.type,catName(t.cat),t.subcat||"",t.budget?budLabel(t.budget):"",t.status].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n"), "text/csv"); }
  else if (act==="backup"){ backupNow(); }
  else if (act==="sync-connect"){ Sync.connect(); }
  else if (act==="sync-now"){ Sync.now(); }
  else if (act==="sync-create"){ Sync.linkCreate(); }
  else if (act==="sync-existing"){ Sync.linkExisting(); }
  else if (act==="sync-cancel"){ Sync.cancelAsk(); }
  else if (act==="sync-unlink"){ Sync.unlink(); }
  else if (act==="lock"){ Lock.lockNow(); }
  else if (act==="new-recovery"){ Vault.newRecovery().then(k=>Lock.showRecovery(k, ()=>{ document.getElementById("lock").hidden=true; document.getElementById("app").hidden=false; render(); toast("Nouvelle clé de récupération enregistrée."); })); }
  else if (act==="wipe-ask"||act==="destroy-ask"){ UI.confirm=act==="wipe-ask"?"wipe":"destroy"; render(); }
  else if (act==="confirm-no"){ UI.confirm=null; render(); }
  else if (act==="destroy"){ UI.confirm=null; Vault.destroy().then(()=>{ S=null; location.hash=""; location.reload(); }); }
  else if (act==="wipe"){ UI.confirm=null; S.tx=[]; S.imports=[]; S.rules={}; for (const h of S.history) h.matched=null; for(const a of S.accounts){ if(a.kind==="cheque"){a.opening=null;a.bank=null;} } UI.month=null; toast("Transactions effacées."); go("importer"); }
});
document.addEventListener("change", e=>{
  const el = e.target, row = el.closest(".tx[data-id]");
  if (row && el.dataset.f==="event"){ const t=S.tx.find(x=>x.id===row.dataset.id); applyEvent(t, el.value); toast(el.value?`Associée à « ${S.events.find(e=>e.id===el.value).name} ».`:"Retirée de l'événement."); render(); return; }
  if (row && el.dataset.f){
    const t = S.tx.find(x=>x.id===row.dataset.id), owner = acc(t.acc).owner;
    if (el.dataset.f==="cat"){ const [c,s]=el.value.split("|"); t.cat=c||null; t.subcat=s||null; if (c && !t.budget) t.budget=owner; }
    else if (el.dataset.f==="budget") t.budget = el.value||null;
    else if (el.dataset.f==="type"){ t.type=el.value; if (t.type==="epargne"){ t.cat="celiapp"; t.budget=owner; } else if (t.type==="revenu"){ t.cat="r_autres"; t.budget=owner; } else if(!TYPES[t.type].count){ t.cat=null; t.subcat=null; t.budget=null; } else { if(catById(t.cat)&&!CATS.includes(catById(t.cat))) t.cat=null; if(!t.budget) t.budget=owner; } }
    t.status="ok"; t.conf=100; t.why="Corrigé à la main";
    const n = learnFrom(t); toast(n?`Retenu pour « ${prettyDesc(t)} » et appliqué à ${n} autre(s).`:`Retenu pour « ${prettyDesc(t)} ».`); render(); return;
  }
  if (el.id==="pick-year"){ if (el.value){ UI.period="annee"; UI.year=el.value; } render(); return; }
  if (el.id==="hide-neutral"){ UI.hideNeutral=el.checked; try{ localStorage.setItem("hideNeutral", el.checked?"1":""); }catch(_){} render(); return; }
  if (el.id && el.id.startsWith("f-")){ UI.f[el.id.slice(2)]=el.value; render(); return; }
  if (el.id==="imp-acc"){ const P=UI.pending; P.accId=el.value||null; P.items=P.accId?analyze(P.parsed,P.accId):[]; render(); return; }
  if (el.dataset.inc!=null){ UI.pending.items[+el.dataset.inc].include = el.checked; render(); return; }
  if (el.id==="file-in" && el.files[0]){ handleFile(el.files[0]); el.value=""; return; }
  if (el.id==="xls-in" && el.files[0]){ handleExcel(el.files[0]); el.value=""; return; }
  if (el.id==="hist-year"){ UI.hist = readHistory(UI.histSheets, el.value, UI.hist.fileName); render(); return; }
  if (el.dataset.bud){ const [b,c]=el.dataset.bud.split("|"); const v=parseFloat(el.value)/(isAnnual(c)?12:1); if(v>0) S.budgets[b][c]=r2(v*100)/100; else delete S.budgets[b][c]; render(); return; }
  if (el.id==="od-date"||el.id==="od-amt"){ S.openingDebt={date:$("#od-date").value||"2026-01-01",amount:parseFloat($("#od-amt").value)||0}; render(); return; }
  if (el.id && el.id.startsWith("sv-")){ const [,p,c]=el.id.split("-"); S.savings[p][c]=Math.max(0,parseFloat(el.value)||0); render(); return; }
  if (el.dataset.mode){ S.catMode[el.dataset.mode]=el.value; const c=catById(el.dataset.mode); toast(`« ${c.name} » suivie sur une base ${el.value==="annee"?"annuelle":"mensuelle"}.`); render(); return; }
  if (el.id && el.id.startsWith("sal-")){ S.salary[el.id.slice(4)]=Math.max(0,parseFloat(el.value)||0); render(); return; }
  if (el.id==="exc-in"){ S.excAnnual=Math.max(0,parseFloat(el.value)||0); render(); return; }
  if (el.id==="nm-A"||el.id==="nm-B"){ S.names[el.id.slice(3)]=el.value.trim()||el.id.slice(3); render(); return; }
  if (el.id==="th"){ S.threshold=+el.value; for (const t of S.tx){ if (t.importId && !["Corrigé à la main","Validé"].includes(t.why) && !String(t.why).startsWith("Repris")) applyClass(t); } render(); }
});
document.addEventListener("input", e=>{ if (e.target.id==="cf-q"){ const l=document.querySelector(".cf-list"); if(l) l.innerHTML=catFilterItems(e.target.value); } });
document.addEventListener("keydown", e=>{
  if (!UI.cfOpen) return;
  if (e.key==="Escape"){ UI.cfOpen=false; render(); document.querySelector('[data-act="cf-open"]')?.focus(); return; }
  if (e.key==="Enter" && e.target.id==="cf-q"){ e.preventDefault(); const first=document.querySelector(".cf-list [data-cf]"); if (first) first.click(); }
  if (e.key==="ArrowDown" || e.key==="ArrowUp"){ const items=[...document.querySelectorAll(".cf-list [data-cf]")]; if(!items.length) return; e.preventDefault();
    const i=items.indexOf(document.activeElement); const n = e.key==="ArrowDown" ? (i<0?0:Math.min(items.length-1,i+1)) : (i<=0?-1:i-1);
    if (n<0) $("#cf-q").focus(); else items[n].focus(); }
});
document.addEventListener("input", e=>{ if (e.target.id==="th") $("#th-val").textContent=e.target.value+" %"; if (e.target.id==="f-q"){ UI.f.q=e.target.value; clearTimeout(window.__q); window.__q=setTimeout(()=>{ render(); const q=$("#f-q"); if(q){q.focus(); q.setSelectionRange(q.value.length,q.value.length);} },300);} });
document.addEventListener("submit", e=>{
  e.preventDefault(); const f=e.target.dataset.form;
  if (f==="add"){ const amt=parseFloat($("#ad-amt").value); const [c,s]=$("#ad-cat").value.split("|");
    S.tx.push({id:nid("t"),acc:$("#ad-acc").value,date:$("#ad-date").value,desc:$("#ad-desc").value,sub:"",amount:-Math.abs(amt),balance:null,type:"depense",cat:c||null,subcat:s||null,budget:$("#ad-bud").value||null,conf:100,why:"Saisie manuelle",status:"ok",source:"Manuel",importId:null,matchId:null});
    toast("Transaction ajoutée."); render(); }
  if (f==="cardstart"){ const id=e.target.dataset.acc; acc(id).cardStart={date:$("#cs-date-"+id).value,balance:r2(parseFloat($("#cs-amt-"+id).value)||0)}; toast("Solde de la carte enregistré."); render(); }
  if (f==="event"){ const ev={id:nid("ev"),name:$("#ev-name").value.trim(),date:$("#ev-date").value,cat:($("#ev-cat").value.split("|")[0])||"autres",budget:$("#ev-bud").value||"commun"}; S.events.push(ev); toast(`Événement « ${ev.name} » créé.`); render(); }
  if (f==="pwd"){ const a=$("#np1").value, b=$("#np2").value; if (a.length<10) return toast("Le mot de passe doit contenir au moins 10 caractères."); if (a!==b) return toast("Les deux mots de passe ne sont pas identiques.");
    Vault.setPassword(a).then(()=>{ toast("Mot de passe changé. Pensez à faire une nouvelle sauvegarde."); render(); }); return; }
  if (f==="sync-secret"){ const b=e.target.querySelector("button[type=submit]"); b.disabled=true; b.textContent="Un instant…";
    Sync.finishLink($("#sy-secret").value).catch(x=>{ toast(x.message); b.disabled=false; b.textContent="Relier cet appareil"; }); return; }
  if (f==="restore"){ const fl=$("#rs-file").files[0]; if(!fl) return; fl.text().then(t=>Vault.importFile(t,$("#rs-secret").value)).then(d=>{ boot(d); toast("Sauvegarde restaurée."); }).catch(x=>toast(x.message)); return; }
  if (f==="plan"){ S.planned.push({id:nid("p"),name:$("#pl-name").value,date:$("#pl-date").value,amount:parseFloat($("#pl-amt").value),budget:$("#pl-bud").value||"commun",cat:"autres"}); toast("Dépense planifiée."); render(); }
});
["dragover","dragleave","drop"].forEach(ev=>document.addEventListener(ev,e=>{
  const d=e.target.closest?.("#drop"); if(!d) return; e.preventDefault();
  d.classList.toggle("over", ev==="dragover");
  if (ev==="drop" && e.dataTransfer.files[0]){ const f=e.dataTransfer.files[0]; /\.xlsx?$/i.test(f.name) ? handleExcel(f) : handleFile(f); }
}));
/* Glisser-déposer des catégories (page Budgets) : souris, tactile et clavier */
let drag=null;
document.addEventListener("pointerdown", e=>{
  const h = e.target.closest(".drag-h"); if (!h) return;
  e.preventDefault(); const row = h.closest("tr");
  drag = {id:h.dataset.drag,row,target:null,after:false,group:null,y:e.clientY}; row.classList.add("dragging");
  try{ h.setPointerCapture(e.pointerId); }catch(_){}
});
document.addEventListener("pointermove", e=>{
  if (!drag) return;
  document.querySelectorAll(".drop-before,.drop-after").forEach(r=>r.classList.remove("drop-before","drop-after"));
  const el = document.elementFromPoint(e.clientX,e.clientY); const tr = el?.closest("tr[data-cat], tr.drow-empty");
  drag.target=null; drag.group=null;
  if (tr && tr!==drag.row){ const r=tr.getBoundingClientRect(); const after = e.clientY > r.top+r.height/2;
    if (tr.dataset.cat){ drag.target=tr.dataset.cat; drag.after=after; tr.classList.add(after?"drop-after":"drop-before"); }
    else { drag.group=tr.dataset.group; tr.classList.add("drop-before"); } }
  if (e.clientY < 60) window.scrollBy(0,-12); else if (e.clientY > innerHeight-90) window.scrollBy(0,12);
});
function endDrag(){
  if (!drag) return; const d=drag; drag=null;
  document.querySelectorAll(".drop-before,.drop-after,.dragging").forEach(r=>r.classList.remove("drop-before","drop-after","dragging"));
  if ((d.target||d.group) && moveCat(d.id,d.target,d.after,d.group)){ const c=catById(d.id); toast(`« ${c.name} » déplacée dans ${GROUPS.find(g=>g.id===c.g).name}.`); render(); }
}
document.addEventListener("pointerup", endDrag); document.addEventListener("pointercancel", endDrag);
document.addEventListener("keydown", e=>{ if (e.key==="Escape" && UI.picker){ UI.picker=false; render(); document.querySelector('[data-act="m-pick"]')?.focus(); } });
document.addEventListener("keydown", e=>{
  const h = e.target.closest?.(".drag-h"); if (!h || (e.key!=="ArrowUp"&&e.key!=="ArrowDown")) return;
  e.preventDefault(); const id=h.dataset.drag;
  if (stepCat(id, e.key==="ArrowUp"?-1:1)){ render(); document.querySelector(`.drag-h[data-drag="${id}"]`)?.focus(); }
});
window.addEventListener("hashchange",()=>{ const h=location.hash.slice(1); if(VIEWS.includes(h)&&h!==UI.view){UI.view=h;render();} });

S = null;
Lock.beforeLock = () => flushSave();
Lock.initialData = () => { const d=freshState(); return d; };
Lock.start(boot);
if ("serviceWorker" in navigator && location.protocol==="https:") navigator.serviceWorker.register("sw.js").catch(()=>{});
try{ UI.hideNeutral = localStorage.getItem("hideNeutral")==="1"; UI.sortAsc = localStorage.getItem("sortAsc")==="1"; }catch(_){}
function setSort(asc){ UI.sortAsc=asc; try{ localStorage.setItem("sortAsc", asc?"1":""); }catch(_){} render(); }

