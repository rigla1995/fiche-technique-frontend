#!/usr/bin/env node
// Contrôle du contexte React du vocabulaire (lot 2, spec §2.3) — `node scripts/controle-contexte.mjs [--strict]`
//
// Monte le VRAI AuthProvider (src/context/AuthContext.tsx), le vrai useVocabulaire et le vrai i18n dans un
// navigateur sans tête, API bouchonnée (scripts/controle-contexte/api-bouchon.ts), AUCUN réseau : toute
// requête hors du harnais est refusée. Vérifie ce qu'aucun test Node ne voit :
//   - le vocabulaire est posé AVANT le premier rendu d'un écran connecté (connexion, rechargement) ;
//   - l'objet `voc` ne change pas tant que le lexique ne change pas ;
//   - retour sur l'onglet : au plus un /auth/me par 5 min, silencieux ; une réponse IDENTIQUE ne remplace
//     pas l'objet `user` (un formulaire alimenté par un effet [user] — « Mon profil » — garde sa saisie) ;
//   - changement de lexique, déconnexion, rôles (admin et boss : vocabulaire par défaut) ;
//   - exemples de saisie (voc.ex, balise [[ex:…]] de fr.json) : ceux d'aujourd'hui tant que le vocabulaire est
//     celui par défaut (non connecté, restauration, admin, boss), neutres et construits pour un autre domaine ;
//   - lexique allégé (lot 2b §5.7) : le serveur rend `domaine.lexique: null` pour le vocabulaire par défaut (compte
//     restauration, acheteur d'un vendeur restauration), au login comme à /auth/me ; la bascule « lexique complet
//     → null » au retour sur l'onglet garde l'objet vocabDefaut.
//
// Dépendances : rolldown (livré avec vite, dans node_modules de ce dépôt) et puppeteer, pris dans un dépôt
// voisin — par défaut ../labflow-site ; sinon LABFLOW_PUPPETEER=<chemin d'un package.json qui résout puppeteer>.
// Codes de sortie : 0 = tout passe ; 1 = au moins un échec ; 2 = contrôle NON exécuté (puppeteer introuvable).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(ICI, '..');
const HARNAIS = path.join(ICI, 'controle-contexte');
const STRICT = process.argv.includes('--strict');

// ── Puppeteer (dépôt voisin) ─────────────────────────────────────────────────
const ancre = process.env.LABFLOW_PUPPETEER || path.join(FRONT, '..', 'labflow-site', 'package.json');
let puppeteer;
try {
  puppeteer = createRequire(ancre)('puppeteer');
} catch {
  console.error(`controle-contexte : puppeteer introuvable depuis ${ancre} — contrôle NON exécuté (LABFLOW_PUPPETEER=<package.json>).`);
  process.exit(2);
}

// ── Bundle du harnais (rolldown du dépôt), écrit hors dépôt ──────────────────
const { build } = await import(pathToFileURL(path.join(FRONT, 'node_modules', 'rolldown', 'dist', 'index.mjs')).href);
const sortie = fs.mkdtempSync(path.join(os.tmpdir(), 'controle-contexte-'));
const FAUX_IMPORTEUR = path.join(FRONT, 'src', '__harnais__.tsx');
const posix = (p) => p.replace(/\\/g, '/');
await build({
  input: path.join(HARNAIS, 'harnais.tsx'),
  tsconfig: path.join(FRONT, 'tsconfig.app.json'),
  transform: { define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.VITE_API_URL': '"http://mock.test"' }, jsx: 'react-jsx' },
  plugins: [{
    name: 'harnais',
    async resolveId(source, importer) {
      if (source.startsWith('@front/')) return this.resolve(`./${source.slice('@front/'.length)}`, FAUX_IMPORTEUR, { skipSelf: true });
      if (source.startsWith('@front-scripts/')) return path.join(FRONT, 'scripts', source.slice('@front-scripts/'.length));
      // Le seul module remplacé : le client HTTP, et seulement pour AuthContext.
      if (importer && posix(importer).endsWith('src/context/AuthContext.tsx') && source === '../api/client') return path.join(HARNAIS, 'api-bouchon.ts');
      // Imports nus du harnais : résolus comme depuis `src` (une seule copie de react, react-i18next…).
      if (importer && posix(importer).startsWith(posix(HARNAIS)) && !source.startsWith('.') && !path.isAbsolute(source)) return this.resolve(source, FAUX_IMPORTEUR, { skipSelf: true });
      return null;
    },
  }],
  output: { file: path.join(sortie, 'bundle.js'), format: 'iife' },
  logLevel: 'warn',
});
const bundle = fs.readFileSync(path.join(sortie, 'bundle.js'), 'utf8');
fs.rmSync(sortie, { recursive: true, force: true });

const HTML = `<!doctype html><meta charset="utf-8"><div id="root"></div>
<script>
  window.__strict = ${STRICT};
  window.__calls = [];
  window.__mock = { me: window.__preMock || null, token: 'jeton-1' };
  window.__decalage = 0;
  const vraiNow = Date.now.bind(Date);
  Date.now = () => vraiNow() + window.__decalage;
  window.fetch = async (url, opts) => {
    window.__calls.push(['fetch', String(url), opts && opts.headers && opts.headers.Authorization]);
    if (window.__mock.fetchStatus && window.__mock.fetchStatus !== 200) return { ok: false, status: window.__mock.fetchStatus, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => window.__copie(window.__mock.me) };
  };
</script>
<script src="/bundle.js"></script>`;

const browser = await puppeteer.launch({ headless: true });
const resultats = [];
const verifier = (nom, ok, detail = '') => { resultats.push([nom, !!ok]); console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom}${!ok && detail ? ` — ${detail}` : ''}`); };

const ouvrir = async (avant) => {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u === 'http://harnais.test/') return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    if (u === 'http://harnais.test/bundle.js') return req.respond({ status: 200, contentType: 'application/javascript; charset=utf-8', body: bundle });
    if (u.endsWith('/favicon.ico')) return req.respond({ status: 204, body: '' });
    return req.respond({ status: 404, body: '' }); // aucun réseau
  });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') erreurs.push(`${m.type()}: ${m.text()}`); });
  if (avant) await page.evaluateOnNewDocument(avant);
  await page.goto('http://harnais.test/');
  await page.waitForSelector('#ecran');
  page.__erreurs = erreurs;
  return page;
};
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const etat = (page) => page.evaluate(() => ({
  ecran: document.querySelector('#ecran')?.textContent, memo: document.querySelector('#memo')?.textContent,
  protege: document.querySelector('#protege')?.textContent, etat: document.querySelector('#etat')?.textContent,
  hors: document.querySelector('#hors')?.textContent,
  nom: document.querySelector('#profil-nom')?.value, tel: document.querySelector('#profil-tel')?.value,
}));
// Exemple de saisie (voc.ex) et libellé à balise [[ex:…]] tels que le navigateur les affiche, et voc.estDefaut.
const exemple = (page) => page.evaluate(() => {
  const e = document.querySelector('#exemple');
  return [e?.getAttribute('placeholder'), e?.getAttribute('aria-label'), e?.getAttribute('data-defaut')].join(' | ');
});
const EXEMPLE_DEFAUT = "Ex: Poulet entier | Nom de l'activité (ex: Restaurant A) | true";
const EXEMPLE_HOTELLERIE = 'Ex: Fourniture A | Nom du service (ex: Service A) | false';
const EXEMPLE_CERAMIQUE = 'Ex: Matière première A | Nom du point de vente (ex: Point de vente A) | false';
const SIX_MINUTES = 6 * 60 * 1000;
// Retour sur l'onglet, 6 minutes après le dernier /auth/me (ou tout de suite).
const retourOnglet = async (page, plusTard = true) => {
  await page.evaluate((ms) => { window.__decalage += ms; window.__log.length = 0; window.__calls.length = 0; document.dispatchEvent(new Event('visibilitychange')); }, plusTard ? SIX_MINUTES : 0);
  await attendre(300);
  return page.evaluate(() => ({ log: window.__log.slice(), calls: window.__calls.slice() }));
};

// ── A. Non connecté → connexion Hôtellerie → /auth/me répétés → retours d'onglet → changement de lexique → déconnexion
{
  const page = await ouvrir();
  let e = await etat(page);
  verifier('A1 non connecté : vocabulaire par défaut', e.ecran === 'le labo | Stock Labo' && e.memo === 'Mes activités' && e.etat === 'login', JSON.stringify(e));
  verifier('A1b hors provider : vocabulaire par défaut', e.hors === "l'activité", e.hors);
  verifier('A1c non connecté : exemple de saisie et libellé d\'origine (voc.ex, balise ex)', await exemple(page) === EXEMPLE_DEFAUT, await exemple(page));

  await page.evaluate(() => {
    window.__mock.me = { id: 7, name: 'Test', email: 'client@test.local', phone: '20111222', role: 'client', onboardingStep: 9, modeCompte: 'actif', domaine: { id: 2, slug: 'hotellerie', nom: 'Hôtellerie', lexique: 'hotellerie', composants: [], regles: {} } };
    window.__log.length = 0;
  });
  await page.evaluate(async () => { await window.__auth.login('a', 'b'); });
  const logLogin = await page.evaluate(() => window.__log.slice());
  e = await etat(page);
  verifier('A2 après connexion Hôtellerie : écran et t()', e.ecran === 'la cuisine centrale | Stock Cuisine' && e.memo === 'Mes services' && e.protege === 'Espace Cuisine | Mes services', JSON.stringify(e));
  verifier('A2b après connexion Hôtellerie : exemple de saisie et libellé neutres, construits avec les termes du domaine', await exemple(page) === EXEMPLE_HOTELLERIE, await exemple(page));
  const incoherents = logLogin.filter((l) => (l.c === 'Ecran' || l.c === 'EcranProtege') && l.user && (l.le !== 'la cuisine centrale' || l.t !== 'Stock Cuisine'));
  verifier('A3 aucun rendu avec user connecté ET vocabulaire par défaut', incoherents.length === 0, JSON.stringify(incoherents));
  const mixtes = logLogin.filter((l) => l.c === 'Ecran' && ((l.le === 'la cuisine centrale') !== (l.t === 'Stock Cuisine')));
  verifier('A3b aucun rendu mixte (voc d\'un domaine, t() d\'un autre) pendant la connexion', mixtes.length === 0, JSON.stringify(mixtes));
  const premierProtege = logLogin.find((l) => l.c === 'EcranProtege');
  verifier('A3c premier rendu de l\'écran protégé déjà en Hôtellerie', premierProtege && premierProtege.le === 'la cuisine centrale' && premierProtege.t === 'Stock Cuisine', JSON.stringify(premierProtege));

  // /auth/me répétés (activites-changed × 3) : même lexique → même objet voc, aucun effet [voc] relancé.
  const vocAvant = logLogin.filter((l) => l.c === 'Ecran').pop().voc;
  await page.evaluate(() => { window.__log.length = 0; window.__calls.length = 0; for (let i = 0; i < 3; i += 1) window.dispatchEvent(new Event('activites-changed')); });
  await attendre(300);
  const logMe = await page.evaluate(() => ({ log: window.__log.slice(), calls: window.__calls.slice() }));
  verifier('A4 3 × /auth/me (même lexique) : objet voc inchangé, effet [voc] non relancé, composant mémoïsé non re-rendu',
    logMe.calls.length === 3 && logMe.log.filter((l) => l.c === 'Ecran').every((l) => l.voc === vocAvant) && !logMe.log.some((l) => l.c === 'effet[voc]') && !logMe.log.some((l) => l.c === 'Memo'),
    JSON.stringify(logMe.log.map((l) => [l.c, l.voc])));

  await page.evaluate(() => { window.__log.length = 0; window.__auth.updateUser({ onboardingStep: 10 }); });
  await attendre(100);
  const logUp = await page.evaluate(() => window.__log.slice());
  verifier('A5 updateUser : voc inchangé', logUp.filter((l) => l.c === 'Ecran').every((l) => l.voc === vocAvant) && !logUp.some((l) => l.c === 'effet[voc]'), JSON.stringify(logUp.map((l) => [l.c, l.voc])));
  // updateUser a changé onboardingStep : le serveur le rendra aussi.
  await page.evaluate(() => { window.__mock.me.onboardingStep = 10; });

  // Retour d'onglet : 10 événements tout de suite → 0 appel (moins de 5 min depuis le dernier /auth/me).
  await page.evaluate(() => { window.__calls.length = 0; for (let i = 0; i < 10; i += 1) document.dispatchEvent(new Event('visibilitychange')); });
  await attendre(200);
  let calls = await page.evaluate(() => window.__calls.slice());
  verifier('A6 visibilitychange × 10 avant 5 min : 0 appel', calls.length === 0, JSON.stringify(calls));

  // L'utilisateur saisit dans « Mon profil », change d'onglet, revient 6 min plus tard : /auth/me est IDENTIQUE.
  await page.type('#profil-nom', ' modifié');
  await page.evaluate(() => { window.__decalage += 6 * 60 * 1000; window.__log.length = 0; window.__calls.length = 0; for (let i = 0; i < 10; i += 1) document.dispatchEvent(new Event('visibilitychange')); });
  await attendre(300);
  const vis = await page.evaluate(() => ({ log: window.__log.slice(), calls: window.__calls.slice() }));
  verifier('A7 visibilitychange × 10 après 6 min : exactement 1 fetch /auth/me avec le jeton, hors axios',
    vis.calls.length === 1 && vis.calls[0][0] === 'fetch' && vis.calls[0][1] === 'http://mock.test/auth/me' && vis.calls[0][2] === 'Bearer jeton-1', JSON.stringify(vis.calls));
  verifier('A7b ce rafraîchissement (même lexique) ne change pas voc', !vis.log.some((l) => l.c === 'effet[voc]') && vis.log.filter((l) => l.c === 'Ecran').every((l) => l.voc === vocAvant), JSON.stringify(vis.log.map((l) => [l.c, l.voc])));
  verifier('A7c réponse identique : l\'objet user n\'est pas remplacé (aucun effet [user] relancé, aucun re-rendu)',
    !vis.log.some((l) => l.c === 'effet[user]') && !vis.log.some((l) => l.c === 'Ecran'), JSON.stringify(vis.log.map((l) => l.c)));
  e = await etat(page);
  verifier('A7d réponse identique : la saisie en cours dans « Mon profil » est conservée', e.nom !== 'Test' && e.nom.includes('modifié') && e.tel === '20111222', JSON.stringify([e.nom, e.tel]));

  // Le compte a réellement changé côté serveur (téléphone) : le retour d'onglet l'applique.
  await page.evaluate(() => { window.__mock.me.phone = '20999888'; });
  const chg = await retourOnglet(page);
  e = await etat(page);
  verifier('A7e réponse différente : le user est remplacé (effet [user] relancé une fois, formulaire réaligné), voc inchangé',
    chg.calls.length === 1 && chg.log.filter((l) => l.c === 'effet[user]').length === 1 && e.tel === '20999888' && !chg.log.some((l) => l.c === 'effet[voc]'),
    JSON.stringify([chg.calls.length, chg.log.map((l) => l.c), e.tel]));
  const stocke = await page.evaluate(() => JSON.parse(localStorage.getItem('user')).phone);
  verifier('A7f réponse différente : localStorage « user » mis à jour', stocke === '20999888', stocke);

  // Onglet caché : pas d'appel.
  await page.evaluate(() => { window.__decalage += 6 * 60 * 1000; window.__calls.length = 0; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await attendre(100);
  calls = await page.evaluate(() => window.__calls.slice());
  verifier('A8 onglet caché : aucun appel', calls.length === 0, JSON.stringify(calls));

  // Serveur en erreur au retour d'onglet : silencieux, l'utilisateur reste connecté, pas de boucle.
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); window.__mock.fetchStatus = 503; window.__calls.length = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await attendre(200);
  e = await etat(page);
  calls = await page.evaluate(() => window.__calls.slice());
  verifier('A9 503 au retour d\'onglet : silencieux, session conservée', calls.length === 1 && e.protege === 'Espace Cuisine | Mes services', JSON.stringify([calls.length, e.protege]));
  await page.evaluate(() => { window.__calls.length = 0; for (let i = 0; i < 5; i += 1) document.dispatchEvent(new Event('visibilitychange')); });
  await attendre(150);
  calls = await page.evaluate(() => window.__calls.slice());
  verifier('A9b après une erreur : pas de nouvel essai avant 5 min', calls.length === 0, JSON.stringify(calls));

  // L'admin change le lexique (Céramique) : il arrive au prochain retour d'onglet ; t() suit, même mémoïsé.
  await page.evaluate(() => { window.__mock.fetchStatus = 200; window.__mock.me.domaine.lexique = 'ceramique'; });
  await retourOnglet(page);
  e = await etat(page);
  verifier('A10 changement de lexique au retour d\'onglet : écran, t() et composant mémoïsé suivent',
    e.ecran === 'le site de production | Stock Site' && e.memo === 'Mes points de vente' && e.protege === 'Espace Site | Mes points de vente', JSON.stringify(e));
  verifier('A10b changement de lexique : l\'exemple de saisie et le libellé suivent', await exemple(page) === EXEMPLE_CERAMIQUE, await exemple(page));

  await page.evaluate(() => { window.__log.length = 0; window.__auth.logout(); });
  await attendre(150);
  e = await etat(page);
  verifier('A11 déconnexion : retour au vocabulaire par défaut (voc et t())', e.ecran === 'le labo | Stock Labo' && e.memo === 'Mes activités' && e.etat === 'login', JSON.stringify(e));
  verifier('A11c déconnexion : retour à l\'exemple de saisie et au libellé d\'origine', await exemple(page) === EXEMPLE_DEFAUT, await exemple(page));
  const ls = await page.evaluate(() => [localStorage.getItem('token'), localStorage.getItem('user')]);
  verifier('A11b déconnexion : localStorage vidé', ls[0] === null && ls[1] === null, JSON.stringify(ls));
  await page.evaluate(() => { window.__decalage += 6 * 60 * 1000; window.__calls.length = 0; document.dispatchEvent(new Event('visibilitychange')); });
  await attendre(150);
  calls = await page.evaluate(() => window.__calls.slice());
  verifier('A12 déconnecté : plus d\'écouteur de visibilité', calls.length === 0, JSON.stringify(calls));
  verifier('A aucune erreur console', page.__erreurs.length === 0, page.__erreurs.join(' | '));
  await page.close();
}

// ── B. Rechargement de page avec un jeton stocké (compte Hôtellerie)
{
  const page = await ouvrir(() => {
    localStorage.setItem('token', 'jeton-1');
    window.__preMock = { id: 7, name: 'Test', email: 'client@test.local', role: 'client', onboardingStep: 9, modeCompte: 'actif', domaine: { id: 2, slug: 'hotellerie', nom: 'Hôtellerie', lexique: 'hotellerie' } };
  });
  await page.waitForSelector('#protege', { timeout: 5000 }).catch(() => {});
  const log = await page.evaluate(() => window.__log.slice());
  const protege = log.filter((l) => l.c === 'EcranProtege');
  verifier('B1 rechargement avec jeton : l\'écran protégé n\'est jamais rendu en vocabulaire par défaut', protege.length > 0 && protege.every((l) => l.le === 'la cuisine centrale' && l.t === 'Stock Cuisine'), JSON.stringify(protege));
  const charges = log.filter((l) => l.c === 'Ecran' && l.isLoading === false && l.user);
  verifier('B2 dès que isLoading est faux avec un user, le vocabulaire est celui du compte', charges.length > 0 && charges.every((l) => l.le === 'la cuisine centrale' && l.t === 'Stock Cuisine'), JSON.stringify(charges));
  // Après un rechargement, le user vient de /auth/me : le premier retour d'onglet (réponse identique) ne pose rien.
  const vis = await retourOnglet(page);
  verifier('B3 premier retour d\'onglet après rechargement (réponse identique) : 1 appel, aucun rendu', vis.calls.length === 1 && vis.log.length === 0, JSON.stringify([vis.calls.length, vis.log.map((l) => l.c)]));
  verifier('B aucune erreur console', page.__erreurs.length === 0, page.__erreurs.join(' | '));
  await page.close();
}

// ── C. Rôles
for (const [role, attendu, note] of [
  ['acheteur', 'la cuisine centrale | Stock Cuisine', 'acheteur : vocabulaire du vendeur'],
  ['gerant', 'la cuisine centrale | Stock Cuisine', 'gérant : vocabulaire du compte parent'],
  ['super_admin', 'le labo | Stock Labo', 'admin : défaut même si un lexique est présent'],
  ['boss', 'le labo | Stock Labo', 'boss : défaut même si un lexique est présent'],
]) {
  const page = await ouvrir();
  await page.evaluate((r) => { window.__mock.me = { id: 7, name: 'Test', email: `${r}@test.local`, role: r, modeCompte: 'actif', domaine: { id: 2, slug: 'hotellerie', nom: 'Hôtellerie', lexique: 'hotellerie' } }; }, role);
  await page.evaluate(async () => { await window.__auth.login('a', 'b'); });
  const e = await etat(page);
  verifier(`C ${note}`, e.ecran === attendu, e.ecran);
  const parDefaut = role === 'super_admin' || role === 'boss';
  verifier(`C ${role} : exemple de saisie ${parDefaut ? 'd\'origine' : 'neutre (domaine du compte)'}`, await exemple(page) === (parDefaut ? EXEMPLE_DEFAUT : EXEMPLE_HOTELLERIE), await exemple(page));
  await page.close();
}

// ── D. Compte restauration : le serveur renvoie `lexique: null` (lot 2b §5.7), au login comme à /auth/me.
// L'objet vocabDefaut lui-même.
{
  const page = await ouvrir();
  await page.evaluate(() => { window.__mock.me = { id: 7, name: 'Test', email: 'resto@test.local', role: 'client', modeCompte: 'actif', domaine: { id: 1, slug: 'restauration', nom: 'Restauration', lexique: null, composants: [], regles: {} } }; window.__log.length = 0; });
  await page.evaluate(async () => { await window.__auth.login('a', 'b'); });
  const log = await page.evaluate(() => window.__log.slice());
  verifier('D restauration : voc reste l\'objet vocabDefaut, composant mémoïsé non re-rendu, effet [voc] non relancé',
    log.filter((l) => l.c === 'Ecran').every((l) => l.voc === 1) && !log.some((l) => l.c === 'Memo') && !log.some((l) => l.c === 'effet[voc]'), JSON.stringify(log.map((l) => [l.c, l.voc])));
  verifier('D1b restauration : exemple de saisie et libellé d\'origine, voc.estDefaut vrai', await exemple(page) === EXEMPLE_DEFAUT, await exemple(page));
  const vis = await retourOnglet(page);
  verifier('D2 restauration, retour d\'onglet (/auth/me identique, lexique null) : aucun rendu', vis.calls.length === 1 && vis.log.length === 0, JSON.stringify([vis.calls.length, vis.log.map((l) => l.c)]));
  const stocke = await page.evaluate(() => JSON.parse(localStorage.getItem('user')).domaine);
  verifier('D3 restauration : user stocké avec lexique null', stocke && stocke.lexique === null && stocke.slug === 'restauration', JSON.stringify(stocke));
  verifier('D aucune erreur console', page.__erreurs.length === 0, page.__erreurs.join(' | '));
  await page.close();
}

// ── D4. Rechargement avec un jeton stocké, compte restauration (/auth/me rend lexique null)
{
  const page = await ouvrir(() => {
    localStorage.setItem('token', 'jeton-1');
    window.__preMock = { id: 7, name: 'Test', email: 'resto@test.local', role: 'client', onboardingStep: 9, modeCompte: 'actif', domaine: { id: 1, slug: 'restauration', nom: 'Restauration', lexique: null, composants: [], regles: {} } };
  });
  await page.waitForSelector('#protege', { timeout: 5000 }).catch(() => {});
  const log = await page.evaluate(() => window.__log.slice());
  const rendus = log.filter((l) => l.c === 'Ecran' || l.c === 'EcranProtege');
  verifier('D4 rechargement, lexique null : tous les rendus en vocabDefaut (objet id 1), effet [voc] seulement sur vocabDefaut',
    rendus.length > 0 && rendus.every((l) => l.voc === 1 && l.le === 'le labo' && l.t === 'Stock Labo') && log.filter((l) => l.c === 'effet[voc]').every((l) => l.voc === 1),
    JSON.stringify(rendus.map((l) => [l.c, l.voc, l.le])));
  verifier('D4b rechargement, lexique null : exemple de saisie d\'origine', await exemple(page) === EXEMPLE_DEFAUT, await exemple(page));
  verifier('D4 aucune erreur console', page.__erreurs.length === 0, page.__erreurs.join(' | '));
  await page.close();
}

// ── D5. Acheteur d'un vendeur restauration : domaine réduit { id, slug, nom, lexique: null }
{
  const page = await ouvrir();
  await page.evaluate(() => { window.__mock.me = { id: 8, name: 'Acheteur', email: 'acheteur@test.local', role: 'acheteur', modeCompte: 'actif', domaine: { id: 1, slug: 'restauration', nom: 'Restauration', lexique: null } }; window.__log.length = 0; });
  await page.evaluate(async () => { await window.__auth.login('a', 'b'); });
  const log = await page.evaluate(() => window.__log.slice());
  const e = await etat(page);
  verifier('D5 acheteur, vendeur restauration (lexique null) : vocabDefaut, aucun effet [voc] relancé',
    e.ecran === 'le labo | Stock Labo' && log.filter((l) => l.c === 'Ecran').every((l) => l.voc === 1) && !log.some((l) => l.c === 'effet[voc]'), JSON.stringify([e.ecran, log.map((l) => [l.c, l.voc])]));
  verifier('D5b acheteur, vendeur restauration : exemple de saisie d\'origine', await exemple(page) === EXEMPLE_DEFAUT, await exemple(page));
  const vis = await retourOnglet(page);
  verifier('D5c acheteur, retour d\'onglet (/auth/me identique, lexique null) : aucun rendu', vis.calls.length === 1 && vis.log.length === 0, JSON.stringify([vis.calls.length, vis.log.map((l) => l.c)]));
  verifier('D5 aucune erreur console', page.__erreurs.length === 0, page.__erreurs.join(' | '));
  await page.close();
}

// ── D6. Bascule du serveur (lot 2b §5.7) : connecté avec le lexique par défaut COMPLET (ancien serveur), le
// retour sur l'onglet reçoit `lexique: null`. Le domaine diffère : le user est reposé UNE fois ; voc reste
// l'objet vocabDefaut (aucun effet [voc]) ; le retour suivant ne pose plus rien.
{
  const page = await ouvrir();
  await page.evaluate(() => { window.__mock.me = { id: 7, name: 'Test', email: 'resto@test.local', role: 'client', modeCompte: 'actif', domaine: { id: 1, slug: 'restauration', nom: 'Restauration', lexique: 'defaut', composants: [], regles: {} } }; });
  await page.evaluate(async () => { await window.__auth.login('a', 'b'); });
  await page.evaluate(() => { window.__mock.me.domaine.lexique = null; });
  let vis = await retourOnglet(page);
  let e = await etat(page);
  verifier('D6 lexique complet → null au retour d\'onglet : user reposé une fois, voc toujours vocabDefaut, effet [voc] non relancé',
    vis.calls.length === 1 && vis.log.filter((l) => l.c === 'effet[user]').length === 1 && !vis.log.some((l) => l.c === 'effet[voc]')
    && vis.log.filter((l) => l.c === 'Ecran').every((l) => l.voc === 1) && e.ecran === 'le labo | Stock Labo',
    JSON.stringify([vis.calls.length, vis.log.map((l) => [l.c, l.voc]), e.ecran]));
  verifier('D6b après la bascule : exemple de saisie d\'origine, user stocké avec lexique null',
    await exemple(page) === EXEMPLE_DEFAUT && (await page.evaluate(() => JSON.parse(localStorage.getItem('user')).domaine.lexique)) === null, await exemple(page));
  vis = await retourOnglet(page);
  verifier('D6c retour suivant (/auth/me identique) : aucun rendu', vis.calls.length === 1 && vis.log.length === 0, JSON.stringify([vis.calls.length, vis.log.map((l) => l.c)]));

  // Le compte change de domaine : lexique Hôtellerie complet, puis retour au vocabulaire par défaut (null).
  await page.evaluate(() => { window.__mock.me.domaine = { id: 2, slug: 'hotellerie', nom: 'Hôtellerie', lexique: 'hotellerie', composants: [], regles: {} }; });
  await retourOnglet(page);
  e = await etat(page);
  verifier('D6d lexique Hôtellerie au retour d\'onglet : écran en Hôtellerie', e.ecran === 'la cuisine centrale | Stock Cuisine', e.ecran);
  await page.evaluate(() => { window.__mock.me.domaine = { id: 1, slug: 'restauration', nom: 'Restauration', lexique: null, composants: [], regles: {} }; });
  vis = await retourOnglet(page);
  e = await etat(page);
  verifier('D6e lexique Hôtellerie complet → null au retour d\'onglet : retour à l\'objet vocabDefaut (écran, t(), composant mémoïsé)',
    e.ecran === 'le labo | Stock Labo' && e.memo === 'Mes activités' && vis.log.filter((l) => l.c === 'effet[voc]').length === 1
    && vis.log.filter((l) => l.c === 'effet[voc]').every((l) => l.voc === 1),
    JSON.stringify([e, vis.log.map((l) => [l.c, l.voc])]));
  verifier('D6f après le retour au défaut : exemple de saisie d\'origine', await exemple(page) === EXEMPLE_DEFAUT, await exemple(page));
  verifier('D6 aucune erreur console', page.__erreurs.length === 0, page.__erreurs.join(' | '));
  await page.close();
}

// ── E. Formes RÉELLES du serveur : /auth/login rend moins de champs que /auth/me, dans un autre ordre
// (authController.js : login = id, name, email, role, onboardingStep, compteurs, domaine ; me ajoute phone,
// entrepriseName, modeCompte, prolongationJours). Le premier retour sur l'onglet après une connexion ne doit
// pas remplacer le user : une saisie en cours dans « Mon profil » serait écrasée. Compte restauration :
// `domaine.lexique` vaut null au login comme à /auth/me (lot 2b §5.7).
{
  const page = await ouvrir();
  await page.evaluate(() => {
    const domaine = { id: 1, slug: 'restauration', nom: 'Restauration', lexique: null, composants: [], regles: {} };
    window.__mock.login = { id: 7, name: 'Nom en base', email: 'resto@test.local', role: 'client', onboardingStep: 0, activitesCount: 2, labosCount: 1, domaine };
    window.__mock.me = { id: 7, name: 'Nom en base', email: 'resto@test.local', phone: '20111222', role: 'client', onboardingStep: 0, entrepriseName: 'Ma société', modeCompte: 'actif', prolongationJours: 0, activitesCount: 2, labosCount: 1, domaine };
  });
  await page.evaluate(async () => { await window.__auth.login('a', 'b'); });
  await page.type('#profil-nom', ' modifié');
  let vis = await retourOnglet(page);
  let e = await etat(page);
  verifier('E1 login puis 1er retour sur l\'onglet (/auth/me a plus de champs que /auth/login) : 1 appel, user non remplacé',
    vis.calls.length === 1 && !vis.log.some((l) => l.c === 'effet[user]') && !vis.log.some((l) => l.c === 'Ecran'), JSON.stringify([vis.calls.length, vis.log.map((l) => l.c)]));
  verifier('E1b la saisie en cours dans « Mon profil » est conservée', e.nom === 'Nom en base modifié', JSON.stringify([e.nom, e.tel]));
  vis = await retourOnglet(page);
  e = await etat(page);
  verifier('E2 second retour sur l\'onglet : toujours rien de posé, saisie conservée', vis.calls.length === 1 && vis.log.length === 0 && e.nom === 'Nom en base modifié', JSON.stringify([vis.calls.length, vis.log.map((l) => l.c), e.nom]));

  // Un champ que le user en place porte déjà change côté serveur : le user entier de /auth/me est posé.
  await page.evaluate(() => { window.__mock.me.name = 'Nouveau nom'; });
  vis = await retourOnglet(page);
  e = await etat(page);
  verifier('E3 un champ déjà porté change (nom) : user remplacé par celui de /auth/me, champs en plus compris',
    vis.log.filter((l) => l.c === 'effet[user]').length === 1 && e.nom === 'Nouveau nom' && e.tel === '20111222', JSON.stringify([vis.log.map((l) => l.c), e.nom, e.tel]));

  // Le user est remplacé pour une AUTRE raison (un compteur change) pendant une saisie : le champ saisi reste.
  await page.type('#profil-nom', ' en cours');
  await page.evaluate(() => { window.__mock.me.activitesCount = 3; });
  vis = await retourOnglet(page);
  e = await etat(page);
  verifier('E5 user remplacé pour une autre raison (compteur) pendant une saisie : le champ saisi est conservé',
    vis.log.filter((l) => l.c === 'effet[user]').length === 1 && e.nom === 'Nouveau nom en cours' && e.tel === '20111222', JSON.stringify([vis.log.map((l) => l.c), e.nom, e.tel]));

  // Même compte, reconnecté (user à la forme du login) : un changement de lexique arrive au retour d'onglet.
  await page.evaluate(() => { window.__auth.logout(); });
  await attendre(100);
  await page.evaluate(() => { window.__mock.login.name = 'Nouveau nom'; });
  await page.evaluate(async () => { await window.__auth.login('a', 'b'); });
  await page.evaluate(() => { window.__mock.me.domaine = { ...window.__mock.me.domaine, lexique: 'hotellerie' }; });
  await retourOnglet(page);
  e = await etat(page);
  verifier('E4 user à la forme du login : un changement de lexique arrive au retour sur l\'onglet', e.ecran === 'la cuisine centrale | Stock Cuisine', e.ecran);
  verifier('E aucune erreur console', page.__erreurs.length === 0, page.__erreurs.join(' | '));
  await page.close();
}

await browser.close();
const echecs = resultats.filter(([, ok]) => !ok);
console.log(`\ncontrole-contexte : ${resultats.length - echecs.length}/${resultats.length} vérifications passées${STRICT ? ' (StrictMode)' : ''}`);
process.exit(echecs.length ? 1 : 0);
