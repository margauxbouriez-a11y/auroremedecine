// ==UserScript==
// @name         Carnet de révisions — erreurs EDN
// @namespace    https://margauxbouriez-a11y.github.io/auroremedecine/
// @version      1.4.0
// @description  Sur EDN.fr : après chaque réponse, te demande si tu la mets dans ton carnet d'erreurs, avec un commentaire.
// @match        https://www.edn.fr/*
// @match        https://edn.fr/*
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      margauxbouriez2.app.n8n.cloud
// @connect      api-v2.edn.fr
// @run-at       document-idle
// @updateURL    https://margauxbouriez-a11y.github.io/auroremedecine/edn-carnet.user.js
// @downloadURL  https://margauxbouriez-a11y.github.io/auroremedecine/edn-carnet.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (window.__carnetEdn) return; window.__carnetEdn = true;

  const N8N = 'https://margauxbouriez2.app.n8n.cloud/webhook/carnet-erreur-edn';
  const API = 'https://api-v2.edn.fr/api/';
  const CORR = (sid) => 'https://www.edn.fr/app/trainings/training/correction/' + sid;
  const POLL = 5000;

  /* ---------- stockage (gestionnaire de scripts, sinon localStorage) ---------- */
  const getV = async (k, d) => {
    try { if (typeof GM !== 'undefined' && GM.getValue) { const v = await GM.getValue(k); return v === undefined ? d : v; } } catch (e) {}
    try { if (typeof GM_getValue === 'function') { const v = GM_getValue(k); return v === undefined ? d : v; } } catch (e) {}
    try { const v = localStorage.getItem('carnet-edn-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  };
  const setV = async (k, v) => {
    try { if (typeof GM !== 'undefined' && GM.setValue) return await GM.setValue(k, v); } catch (e) {}
    try { if (typeof GM_setValue === 'function') return GM_setValue(k, v); } catch (e) {}
    try { localStorage.setItem('carnet-edn-' + k, JSON.stringify(v)); } catch (e) {}
  };

  /* ---------- requêtes ---------- */
  const gmReq = (opts) => new Promise((ok, ko) => {
    const f = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : (typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null);
    if (!f) return ko(new Error('pas de GM.xmlHttpRequest'));
    f(Object.assign({}, opts, { onload: (r) => ok(r), onerror: () => ko(new Error('réseau')), ontimeout: () => ko(new Error('délai')), timeout: 30000 }));
  });
  async function n8n(body) {
    const data = JSON.stringify(Object.assign({ k: CFG.cle }, body));
    try {
      const r = await gmReq({ method: 'POST', url: N8N, headers: { 'Content-Type': 'application/json' }, data });
      return JSON.parse(r.responseText);
    } catch (e) {
      const r = await fetch(N8N, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data });
      return r.json();
    }
  }
  function jeton() {
    let v = localStorage.getItem('ECNIV2_AUTH_token');
    if (!v) return null;
    try { const p = JSON.parse(v); if (typeof p === 'string') v = p; else if (p && p.token) v = p.token; } catch (e) {}
    return v;
  }
  async function ednGet(u) {
    const t = jeton(); if (!t) throw new Error('SESSION');
    const H = { Authorization: 'Bearer ' + t, Accept: 'application/ld+json' };
    let status, txt;
    try { const r = await fetch(API + u, { headers: H }); status = r.status; txt = await r.text(); }
    catch (e) { const r = await gmReq({ method: 'GET', url: API + u, headers: H }); status = r.status; txt = r.responseText; }
    if (status === 401 || status === 403) throw new Error('SESSION');
    if (status < 200 || status >= 300) throw new Error('HTTP ' + status);
    return JSON.parse(txt);
  }
  async function tout(base) {
    const acc = [];
    for (let p = 1; p < 20; p++) {
      const j = await ednGet(base + (base.includes('?') ? '&' : '?') + 'page=' + p);
      acc.push(...(j['hydra:member'] || j.member || []));
      const vue = j['hydra:view'] || j.view || {};
      if (!vue['hydra:next'] && !vue.next) break;
    }
    return acc;
  }

  /* ---------- lecture d'une réponse EDN (même logique que la mise à jour du carnet) ---------- */
  const txt = (h) => { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.innerText || d.textContent || '').replace(/\s+/g, ' ').trim(); };
  const STATUTS = { WIN: 'juste', MANDATORY: 'obligatoire', FAIL: 'fausse', ELIMINATORY: 'éliminatoire' };
  function lire(a, sid) {
    const q = a.question || {};
    if (!q.id) return null;
    const g = a.grade, mg = a.maxGrade, sr = a.successRate;
    if (g == null && sr == null) return null; /* pas encore corrigée */
    const faux = (g != null && mg != null) ? g < mg : (sr > 1 ? sr < 100 : sr < 1);
    const coches = new Set((a.answers || []).map(x => (x && typeof x === 'object') ? (x.id || x['@id']) : x).map(x => String(x).split('/').pop()));
    const props = (q.corrections || []).map(c => ({
      t: txt(c.label || c.content || c.statement || c.text || c.proposal || c.wording || Object.entries(c).filter(([k, v]) => typeof v === 'string' && v.length > 2 && !/^(@|id$|status$|type$)/.test(k)).map(([k, v]) => v)[0] || '').slice(0, 300),
      s: STATUTS[c.status] || String(c.status || '').toLowerCase(), c: coches.has(String(c.id))
    }));
    const juste = props.filter(p => p.s === 'juste' || p.s === 'obligatoire');
    const tort = props.filter(p => p.c && (p.s === 'fausse' || p.s === 'éliminatoire')).map(p => 'coché à tort : ' + p.t);
    const oubli = props.filter(p => !p.c && (p.s === 'juste' || p.s === 'obligatoire')).map(p => 'oublié : ' + p.t);
    const url = CORR(sid);
    return {
      cle: q.id + '|' + url, faux,
      erreur: {
        qid: q.id, url, d: String(a.answeredAt || new Date().toISOString()).slice(0, 10), g, mg,
        it: [...new Set((q.notions || []).map(n => n.course && n.course.ecniNumber).filter(n => n != null))],
        q: txt(q.problemStatement).slice(0, 700),
        mine: tort.concat(oubli).join(' ; ') || (faux ? 'Réponse incomplète.' : 'Bonne réponse.'),
        good: juste.map(p => p.t).join(' ; '),
        why: txt(q.correctionStatement).slice(0, 1500)
      }
    };
  }

  /* ---------- lecture de la question affichée (mode révisions/ancrage, où l'API ne donne pas les réponses) ---------- */
  const hash = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const feuilles = (racineEl, test) => [...racineEl.querySelectorAll('h1,h2,h3,h4,h5,div,span,p,strong,b,label')].filter(e => e.offsetParent !== null && test((e.textContent || '').trim()) && ![...e.children].some(c => test((c.textContent || '').trim())));
  function teinte(el) {
    const m = (getComputedStyle(el).color || '').match(/\d+/g); if (!m) return '';
    const [r, g, b] = m.map(Number);
    if (g > r + 40 && g >= b) return 'vert';
    if (r > g + 40 && r > b) return 'rouge';
    return '';
  }
  function coche(el) {
    let row = el; for (let i = 0; i < 5 && row; i++, row = row.parentElement) {
      const c = row.querySelector('input[type=checkbox],input[type=radio],[role=checkbox],[aria-checked]');
      if (c) { if (c.checked != null && c.tagName === 'INPUT') return c.checked; const a = c.getAttribute('aria-checked'); if (a != null) return a === 'true'; return /checked|selected|active/i.test(c.className || ''); }
    }
    return null;
  }
  let diagEcran = '';
  const estTitre = t => /^Question\s*(n°\s*)?\d+\b/i.test(t) && t.length < 40;
  const estCorr = t => /^Correction\b/i.test(t) && t.length < 40;
  function lireEcran() {
    const titre = feuilles(document.body, estTitre)[0];
    const corr = feuilles(document.body, estCorr)[0];
    diagEcran = 'écran : titre ' + (titre ? 'oui' : 'non') + ', correction ' + (corr ? 'oui' : 'non');
    if (!titre || !corr) return null;
    let carte = titre; while (carte.parentElement && !carte.contains(corr)) carte = carte.parentElement;
    const lignes = carte.innerText.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const sc = carte.innerText.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*pts/i);
    const g = sc ? Number(sc[1].replace(',', '.')) : null, mg = sc ? Number(sc[2].replace(',', '.')) : null;
    let iQ = lignes.findIndex(l => estTitre(l)), iC = lignes.findIndex((l, i) => i > iQ && estCorr(l));
    if (iQ < 0) iQ = 0; if (iC < 0) iC = lignes.length;
    const props = [];
    for (let i = iQ + 1; i < iC; i++) {
      let m = lignes[i].match(/^([A-H])\.\s*(.*)$/);
      if (!m) continue;
      let t = m[2]; if (!t && lignes[i + 1] && i + 1 < iC) t = lignes[++i];
      t = t.replace(/\s*\d+(?:,\d+)?\s*%$/, '').trim();
      const el = feuilles(carte, x => x.indexOf(t.slice(0, 30)) >= 0 && x.length < t.length + 40)[0];
      props.push({ l: m[1], t, teinte: el ? teinte(el) : '', c: el ? coche(el) : null });
    }
    diagEcran += ', ' + props.length + ' proposition' + (props.length > 1 ? 's' : '') + ' (' + props.map(p => p.l + (p.teinte === 'vert' ? '✓' : p.teinte === 'rouge' ? '✗' : '·')).join(' ') + ')' + (sc ? ', note ' + sc[1] + '/' + sc[2] : ', note ?');
    if (!props.length) return null;
    const iP = lignes.findIndex((l, i) => i > iQ && /^[A-H]\.\s*/.test(l));
    const enonce = lignes.slice(iQ + 1, iP).filter(l => !/répondent juste|\d\s*\/\s*\d+(?:[.,]\d+)?\s*pts|^(QRM|QRU|QROC|QRP|KFP|[A-Z])$/.test(l)).join(' ');
    const fin = lignes.findIndex((l, i) => i > iC && /Ajouter une note|Je connaissais|Je me rappelais|Je ne savais pas|Ne plus revoir|Supprimer de l/.test(l));
    const why = lignes.slice(iC + 1, fin > 0 ? fin : undefined).filter(l => !/^Fiche de cours$/.test(l)).join(' ');
    const itm = (document.body.innerText.match(/Item\s+(\d{1,3})\s*:/) || [])[1];
    const justes = props.filter(p => p.teinte === 'vert');
    const tort = props.filter(p => p.teinte === 'rouge').map(p => 'coché à tort : ' + p.l + '. ' + p.t);
    const oubli = props.filter(p => p.teinte === 'vert' && p.c === false).map(p => 'oublié : ' + p.l + '. ' + p.t);
    const faux = g != null && mg != null ? g < mg : tort.length > 0;
    const cle = 'ecran-' + hash(enonce + '|' + props.map(p => p.t).join('|'));
    return {
      cle: cle + '|' + 'https://www.edn.fr/app/trainings/training/revisions', faux, vu: cle,
      erreur: {
        qid: cle, url: 'https://www.edn.fr/app/trainings/training/revisions', d: new Date().toISOString().slice(0, 10), g, mg,
        it: itm ? [Number(itm)] : [], q: enonce.slice(0, 700),
        mine: tort.concat(oubli).join(' ; ') || (faux ? 'Réponse incomplète.' : 'Bonne réponse.'),
        good: justes.map(p => p.l + '. ' + p.t).join(' ; '), why: why.slice(0, 1500)
      }
    };
  }

  /* ---------- état ---------- */
  const CFG = { cle: '', aussiJustes: true };
  let decides = new Set();      /* déjà au carnet ou refusées (n8n) + décisions locales */
  const vus = new Set();        /* déjà proposées dans cette page */
  let file = [];                /* réponses en attente de ta décision */
  let ecranActif = false, premierPassage = true;
  let sid = null, ouvert = false, msg = '', occupe = false, reglages = false, attente = '', brouillon = '';

  /* numéro de série : dans l'adresse si possible (identifiant EDN de 26 caractères), sinon la dernière série ouverte, demandée à EDN */
  function sessionDeLAdresse() {
    const m = (location.pathname + location.search + location.hash).match(/(?:^|[\/=#?&])([0-9A-HJKMNP-TV-Z]{26})(?=$|[\/?&#])/i);
    return m ? m[1].toUpperCase() : null;
  }
  let derniereSerie = null, derniereSerieA = 0, diag = '';
  async function serieEnCours() {
    if (Date.now() - derniereSerieA < 30000) return derniereSerie;
    derniereSerieA = Date.now();
    try {
      const j = await ednGet('training_sessions/me/list_my_training_sessions?perPage=10&partial=true');
      const L = j['hydra:member'] || j.member || [];
      const quand = (x) => Date.parse(x.updatedAt || x.lastAnsweredAt || x.startedAt || x.createdAt || 0) || 0;
      const ouvertes = L.filter(x => x && x.id && x.status !== 'CLOSED');
      const choix = (ouvertes.length ? ouvertes : L.filter(x => x && x.id)).sort((a, b) => quand(b) - quand(a))[0];
      derniereSerie = choix ? String(choix.id) : null;
      diag = choix ? 'série EDN la plus récente (' + (choix.status || '?') + ')' : 'aucune série trouvée chez EDN';
    } catch (e) { derniereSerie = null; diag = e.message === 'SESSION' ? 'pas connecté à EDN' : 'EDN : ' + e.message; }
    return derniereSerie;
  }
  async function sessionDeLaPage() {
    const a = sessionDeLAdresse();
    if (a) { diag = 'série lue dans l\'adresse'; return a; }
    if (!/\/app\//.test(location.pathname)) { diag = 'page sans série'; return null; }
    return serieEnCours();
  }

  async function chargerDecisions() {
    try { const r = await n8n({ action: 'etat' }); if (r && r.ok) { (r.ajoutees || []).forEach(k => decides.add(k)); (r.ignorees || []).forEach(k => decides.add(k)); return true; } if (r && r.erreur === 'cle') { msg = 'Clé du carnet refusée : vérifie-la dans les réglages.'; reglages = true; } }
    catch (e) { msg = 'Carnet injoignable pour l\'instant.'; }
    return false;
  }

  /* une nouvelle question arrive : celles laissées sans réponse passent en « Non »,
     sauf si tu as commencé un commentaire ou choisi « Plus tard » */
  function expirer() {
    const garder = [], partir = [];
    file.forEach((r, i) => { ((i === 0 && brouillon.trim()) || r.garder) ? garder.push(r) : partir.push(r); });
    if (!partir.length) return;
    file = garder;
    for (const r of partir) {
      decides.add(r.cle);
      n8n({ action: 'ignorer', erreur: Object.assign({}, r.erreur, { com: '' }) }).catch(() => {});
    }
    if (!garder.length) brouillon = '';
    msg = partir.length + ' question' + (partir.length > 1 ? 's' : '') + ' sans réponse passée' + (partir.length > 1 ? 's' : '') + ' en « Non ».';
  }

  function sonderEcran(manuel) {
    if (!CFG.cle) return;
    let r = null; try { r = lireEcran(); } catch (e) { r = null; diagEcran = 'écran : erreur ' + e.message; }
    if (manuel) {
      if (!r) { msg = 'Je ne trouve pas de question corrigée à l\'écran (' + diagEcran + ').'; dessiner(); return; }
      vus.delete(r.vu); decides.delete(r.cle); if (file.some(x => x.vu === r.vu)) { dessiner(); return; }
    }
    if (!r) return;
    if (!ecranActif) { ecranActif = true; diag = 'question lue à l\'écran'; attente = ''; }
    if (vus.has(r.vu) || decides.has(r.cle)) return;
    vus.add(r.vu);
    if (!r.faux && !CFG.aussiJustes && !manuel) return;
    if (!manuel) expirer();
    file.push(r); ouvert = true; if (file.length === 1 && !/sans réponse/.test(msg)) msg = '';
    dessiner();
  }

  async function sonder() {
    if (ecranActif) return; /* la lecture à l'écran suffit : pas d'API */
    const s = await sessionDeLaPage();
    if (s !== sid) { sid = s; attente = s ? 'En attente de ta première réponse corrigée…' : ''; if (!racine.querySelector('#com')) dessiner(); }
    if (!sid || !CFG.cle || document.hidden) return;
    try {
      const ans = await tout('training_sessions/' + sid + '/list_my_training_session_question_answers?perPage=50&partial=true');
      let nouveaux = 0, expire = false;
      diag = diag.replace(/ · \d+ réponse.*$/, '') + ' · ' + ans.length + ' réponse' + (ans.length > 1 ? 's' : '') + ' lue' + (ans.length > 1 ? 's' : '');
      for (const a of ans) {
        const r = lire(a, sid);
        if (!r || vus.has(r.cle) || decides.has(r.cle)) continue;
        if (!r.faux && !CFG.aussiJustes) continue;
        if (!expire && premierPassage) { expire = true; } else if (!expire) { expirer(); expire = true; }
        vus.add(r.cle); file.push(r); nouveaux++;
      }
      premierPassage = false;
      /* on ne redessine que s'il y a du nouveau : sinon le commentaire en cours de frappe serait effacé */
      const avant = attente; attente = '';
      if (nouveaux) { if (!ouvert) ouvert = true; if (file.length === nouveaux) msg = ''; dessiner(); }
      else if (avant) dessiner();
    } catch (e) {
      const t = e.message === 'SESSION' ? 'Connecte-toi à EDN pour que le panneau voie tes réponses.' : 'EDN ne donne pas les réponses de cette série (' + e.message + ').';
      if (attente !== t) { attente = t; dessiner(); }
    }
  }

  async function decider(action) {
    const r = file[0]; if (!r || occupe) return;
    const com = ((racine.querySelector('#com') || {}).value || brouillon || '');
    if (action === 'plustard') { r.garder = true; file.push(file.shift()); brouillon = ''; dessiner(); return; }
    occupe = true; brouillon = com; dessiner();
    try {
      const rep = await n8n({ action: action === 'oui' ? 'ajouter' : 'ignorer', erreur: Object.assign({}, r.erreur, { com: com.trim() }) });
      if (rep && rep.ok) {
        decides.add(r.cle); file.shift(); brouillon = '';
        msg = action === 'oui' ? 'Ajoutée à ton carnet d\'erreurs.' : 'D\'accord, elle ne sera pas ajoutée.';
        if (!file.length) setTimeout(() => { if (!file.length) { ouvert = false; msg = ''; dessiner(); } }, 2500);
      } else msg = rep && rep.erreur === 'cle' ? 'Clé du carnet refusée : vérifie-la dans les réglages.' : 'Pas enregistré, réessaie.';
    } catch (e) { msg = 'Carnet injoignable, réessaie dans un instant.'; }
    occupe = false; dessiner();
  }

  /* ---------- interface (Shadow DOM : n'affecte pas la page EDN) ---------- */
  const hote = document.createElement('div');
  hote.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646';
  const racine = hote.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(hote);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const note = (g, mg) => g == null ? '' : String(Math.round(g * 100) / 100).replace('.', ',') + (mg != null ? ' / ' + String(mg).replace('.', ',') : '');
  const CSS = `
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
    .tab{display:flex;align-items:center;gap:8px;background:#1f3b8f;color:#fff;border:0;border-radius:999px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(16,24,40,.25)}
    .tab b{background:#fff;color:#1f3b8f;border-radius:999px;padding:1px 7px;font-size:12px}
    .card{width:360px;max-width:calc(100vw - 32px);max-height:min(560px,calc(100vh - 32px));overflow:auto;background:#fff;color:#16213d;border:1px solid #d5dbe7;border-radius:14px;box-shadow:0 12px 40px rgba(16,24,40,.28);padding:14px;display:flex;flex-direction:column;gap:10px;font-size:13.5px;line-height:1.45}
    .hd{display:flex;align-items:center;gap:8px}.hd h3{margin:0;font-size:14px;flex:1}
    .x{border:0;background:#eef1f6;border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:15px;color:#16213d}
    .tag{display:inline-block;border-radius:6px;padding:2px 8px;font-weight:700;font-size:12px}
    .ko{background:#fde8e6;color:#b42318}.okk{background:#e3f4ea;color:#1f7a4a}
    .meta{color:#5d6782;font-size:12px}
    .q{font-weight:600;max-height:7.5em;overflow:auto}
    .k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5d6782;font-weight:700;margin-bottom:2px}
    .mine{color:#b42318}.good{color:#1f7a4a}
    textarea,input[type=text]{width:100%;border:1px solid #d5dbe7;border-radius:9px;padding:8px 10px;font-size:13px;color:#16213d;background:#fff}
    textarea{min-height:64px;resize:vertical}
    .row{display:flex;gap:8px;flex-wrap:wrap}
    .b{border:1px solid #d5dbe7;background:#fff;color:#16213d;border-radius:9px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer}
    .b.p{background:#1f3b8f;border-color:#1f3b8f;color:#fff}.b:disabled{opacity:.55;cursor:default}
    .msg{font-size:12.5px;color:#1f7a4a}.msg.e{color:#b42318}
    .lien{background:none;border:0;color:#1f3b8f;font-size:12px;cursor:pointer;padding:0;text-decoration:underline}
    label.chk{display:flex;gap:8px;align-items:center;font-size:12.5px}
    details summary{cursor:pointer;font-size:12px;color:#5d6782}`;

  function dessiner() {
    const n = file.length;
    if (!ouvert) {
      racine.innerHTML = `<style>${CSS}</style><button class="tab" id="ouvrir" title="Carnet d'erreurs">Carnet d'erreurs${n ? ` <b>${n}</b>` : ''}</button>`;
      racine.getElementById('ouvrir').onclick = () => { ouvert = true; dessiner(); };
      return;
    }
    let corps = '';
    if (!CFG.cle || reglages) {
      corps = `<div><div class="k">Clé de ton carnet</div><input type="text" id="cle" value="${esc(CFG.cle)}" placeholder="Colle la clé de ton carnet de révisions" autocomplete="off"></div>
        <label class="chk"><input type="checkbox" id="justes" ${CFG.aussiJustes ? 'checked' : ''}> Me demander aussi pour les réponses justes</label>
        <div class="row"><button class="b p" id="enr">Enregistrer</button>${CFG.cle ? '<button class="b" id="annul">Retour</button>' : ''}</div>
        <div class="meta">La clé est dans le lien de ton carnet (après <b>k=</b>), ou dans le carnet : elle reste sur cet ordinateur.</div>`;
    } else if (n) {
      const r = file[0], e = r.erreur;
      corps = `<div class="row" style="align-items:center"><span class="tag ${r.faux ? 'ko' : 'okk'}">${r.faux ? '✗ Erreur' : '✓ Juste'}${e.g != null ? ' · ' + note(e.g, e.mg) : ''}</span><span class="meta">${e.it.length ? 'Item ' + e.it.join(', ') : ''}${n > 1 ? ` · ${n - 1} autre${n > 2 ? 's' : ''} en attente` : ''}</span></div>
        <div class="q">${esc(e.q || 'Question')}</div>
        ${e.mine && r.faux ? `<div><div class="k">Ce que tu as fait</div><div class="mine">${esc(e.mine)}</div></div>` : ''}
        <details><summary>Bonnes réponses et correction</summary><div style="margin-top:6px"><div class="good">${esc(e.good)}</div>${e.why ? `<div class="meta" style="margin-top:4px">${esc(e.why.slice(0, 600))}</div>` : ''}</div></details>
        <div><div class="k">Ton commentaire (facultatif)</div><textarea id="com" placeholder="Ex. piège classique : seuil à 1,5 g/L, pas 1 g/L">${esc(brouillon)}</textarea></div>
        <div class="row"><button class="b p" id="oui" ${occupe ? 'disabled' : ''}>Ajouter au carnet</button><button class="b" id="non" ${occupe ? 'disabled' : ''}>Non</button><button class="b" id="tard" ${occupe ? 'disabled' : ''}>Plus tard</button></div>`;
    } else {
      corps = `<div class="meta">${esc(ecranActif ? 'Réponds à la question : je te la proposerai dès que la correction s\'affiche.' : attente || (sid ? 'Toutes tes réponses de cette série sont traitées. Réponds à la question suivante : je te la proposerai dès qu\'elle est corrigée.' : 'Ouvre une série de questions EDN : je te demanderai après chaque réponse si tu veux la garder dans ton carnet.'))}</div>
        <div class="row"><button class="b" id="lire">Lire cette question</button></div>
        <div class="meta" style="font-size:11px;opacity:.75">Diagnostic : ${esc(diagEcran)} · ${esc(diag || '…')}${sid ? ' · série ' + esc(sid.slice(0, 6)) + '…' : ''} · ${esc(location.pathname.slice(0, 60))}</div>`;
    }
    racine.innerHTML = `<style>${CSS}</style><div class="card" role="dialog" aria-label="Carnet d'erreurs">
      <div class="hd"><h3>Carnet d'erreurs</h3>${CFG.cle && !reglages ? '<button class="lien" id="regl">Réglages</button>' : ''}<button class="x" id="fermer" title="Réduire">–</button></div>
      ${corps}${msg ? `<div class="msg${/refusée|injoignable|réessaie|Pas enregistré/.test(msg) ? ' e' : ''}">${esc(msg)}</div>` : ''}</div>`;
    const on = (id, f) => { const el = racine.getElementById(id); if (el) el.onclick = f; };
    const ta = racine.getElementById('com'); if (ta) ta.oninput = () => { brouillon = ta.value; };
    on('fermer', () => { ouvert = false; dessiner(); });
    on('regl', () => { reglages = true; dessiner(); });
    on('annul', () => { reglages = false; dessiner(); });
    on('lire', () => { sonderEcran(true); });
    on('oui', () => decider('oui')); on('non', () => decider('non')); on('tard', () => decider('plustard'));
    on('enr', async () => {
      CFG.cle = racine.getElementById('cle').value.trim(); CFG.aussiJustes = racine.getElementById('justes').checked;
      await setV('cle', CFG.cle); await setV('aussiJustes', CFG.aussiJustes);
      reglages = false; msg = ''; decides = new Set(); if (await chargerDecisions()) msg = 'Carnet relié.'; dessiner(); sonder();
    });
  }

  (async function demarrer() {
    CFG.cle = await getV('cle', ''); CFG.aussiJustes = await getV('aussiJustes', true);
    if (CFG.cle) await chargerDecisions();
    sid = await sessionDeLaPage(); if (!CFG.cle) ouvert = true;
    dessiner(); sonder();
    setInterval(sonder, POLL);
    setInterval(() => sonderEcran(false), 1500);
    let derniere = location.href;
    setInterval(() => { if (location.href !== derniere) { derniere = location.href; sonder(); } }, 1000);
  })();
})();
