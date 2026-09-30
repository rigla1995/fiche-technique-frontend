// Tests du moteur de vocabulaire (lot 2, spec §2.6) — hors de `src` (donc hors de `tsc -b`).
//   node --test scripts/vocab.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
//
// 1. vecteurs écrits à la main (scripts/vocab-vecteurs.json) sur 4 lexiques ;
// 2. lexique par défaut v2 : les 32 clés d'origine rendent exactement leur sg / pl d'origine ;
// 3. clés dérivées : identité par défaut, trois modes de dérivation ;
// 4. résolution d'un lexique de domaine, lexique reçu du serveur ;
// 5. balises : une seule passe, signalement des balises invalides ;
// 6. fr.json : purge, clés ajoutées, et PREUVE d'identité — pour chaque clé conservée,
//    rendre(vocabDefaut, valeur balisée) === valeur d'origine (git show BASE:src/i18n/locales/fr.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { LEXIQUE_DEFAUT, LEXIQUE_CLES } from '../src/vocab/lexiqueDefaut.ts';
import { creerVocab, vocabDefaut, resoudreLexique, completerLexique, vocabDuLexique } from '../src/vocab/vocab.ts';
import { rendre, rendreTout, balisesInvalides } from '../src/vocab/rendre.ts';
import { libelleCategoriePt, CATEGORIES_PT_CONNUES } from '../src/vocab/categoriesPt.ts';
import { nomOnglet } from '../src/vocab/excel.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..');
const lireJson = (relatif) => JSON.parse(fs.readFileSync(path.join(RACINE, relatif), 'utf8'));

// Commit de référence (avant le lot 2) : fr.json d'origine et appels t('clé', 'défaut') d'origine.
// Si l'outil de preuve a posé scripts/vocab-check.base, c'est lui qui fait foi.
const BASE_DEFAUT = '0cce3bfd6db0c7ce9491c7983488bda3d5281f9f';
const fichierBase = path.join(ICI, 'vocab-check.base');
const BASE = fs.existsSync(fichierBase) ? fs.readFileSync(fichierBase, 'utf8').trim() || BASE_DEFAUT : BASE_DEFAUT;
const gitShow = (fichier) => execFileSync('git', ['-C', RACINE, 'show', `${BASE}:${fichier}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// console.warn est capturé pendant les tests (clés inconnues, balises invalides).
const avertissements = [];
const warnOrigine = console.warn;
test.before(() => { console.warn = (...a) => { avertissements.push(a.join(' ')); }; });
test.after(() => { console.warn = warnOrigine; });

// ── Lexiques d'essai ─────────────────────────────────────────────────────────
const ESSAIS = lireJson('scripts/vocab-lexiques-test.json');
const LEXIQUES = {
  defaut: LEXIQUE_DEFAUT,
  hotellerie: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie),
  ceramique: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique),
  miroir: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.miroir),
};
const VOCS = Object.fromEntries(Object.entries(LEXIQUES).map(([nom, lex]) => [nom, creerVocab(lex)]));

// Les 32 entrées du lexique d'origine (backend src/config/lexiqueDefaut.js, commit 13d99d0),
// recopiées ici pour que la preuve ne dépende ni du backend ni du lexique testé.
const ORIGINE_32 = {
  activite:           { sg: 'Activité',            pl: 'Activités',             g: 'f', el: true,  icon: '🏪' },
  labo:               { sg: 'Labo',                pl: 'Labos',                 g: 'm', el: false, icon: '🏭' },
  produit_vendable:   { sg: 'Produit vendable',    pl: 'Produits vendables',    g: 'm', el: false, icon: '🛒' },
  produit_utilisable: { sg: 'Produit utilisable',  pl: 'Produits utilisables',  g: 'm', el: false, icon: '🧂' },
  produit_valorise:   { sg: 'Produit valorisé',    pl: 'Produits valorisés',    g: 'm', el: false, icon: '💎' },
  article:            { sg: 'Article',             pl: 'Articles',              g: 'm', el: true,  icon: '📦' },
  ingredient:         { sg: 'Ingrédient',          pl: 'Ingrédients',           g: 'm', el: true,  icon: '🥕' },
  recette:            { sg: 'Recette',             pl: 'Recettes',              g: 'f', el: false, icon: '📖' },
  fiche_technique:    { sg: 'Fiche technique',     pl: 'Fiches techniques',     g: 'f', el: false, icon: '📋' },
  portion:            { sg: 'Portion',             pl: 'Portions',              g: 'f', el: false, icon: '🍽️' },
  food_cost:          { sg: 'Food cost',           pl: 'Food costs',            g: 'm', el: false, icon: '📊' },
  cout_matiere:       { sg: 'Coût matière',        pl: 'Coûts matière',         g: 'm', el: false, icon: '💰' },
  marge:              { sg: 'Marge',               pl: 'Marges',                g: 'f', el: false, icon: '📈' },
  transfert:          { sg: 'Transfert',           pl: 'Transferts',            g: 'm', el: false, icon: '🚚' },
  appro:              { sg: 'Approvisionnement',   pl: 'Approvisionnements',    g: 'm', el: true,  icon: '📥' },
  perte:              { sg: 'Perte',               pl: 'Pertes',                g: 'f', el: false, icon: '🗑️' },
  inventaire:         { sg: 'Inventaire',          pl: 'Inventaires',           g: 'm', el: true,  icon: '📝' },
  vente:              { sg: 'Vente',               pl: 'Ventes',                g: 'f', el: false, icon: '💵' },
  acheteur:           { sg: 'Acheteur',            pl: 'Acheteurs',             g: 'm', el: true,  icon: '🤝' },
  gerant:             { sg: 'Gérant',              pl: 'Gérants',               g: 'm', el: false, icon: '👤' },
  fournisseur:        { sg: 'Fournisseur',         pl: 'Fournisseurs',          g: 'm', el: false, icon: '🏬' },
  depot:              { sg: 'Dépôt',               pl: 'Dépôts',                g: 'm', el: false, icon: '🏗️' },
  pt:                 { sg: 'Produit transformé',  pl: 'Produits transformés',  g: 'm', el: false, icon: '🍲' },
  stock:              { sg: 'Stock',               pl: 'Stocks',                g: 'm', el: false, icon: '📦' },
  prestataire:        { sg: 'Prestataire',         pl: 'Prestataires',          g: 'm', el: false, icon: '🛵' },
  supplement:         { sg: 'Supplément',          pl: 'Suppléments',           g: 'm', el: false, icon: '➕' },
  espace_activites:   { sg: 'Espace Activités',    pl: 'Espaces Activités',     g: 'm', el: true,  icon: '🏪' },
  espace_labo:        { sg: 'Espace Labo',         pl: 'Espaces Labo',          g: 'm', el: true,  icon: '🏭' },
  espace_vente:       { sg: 'Espace Vente',        pl: 'Espaces Vente',         g: 'm', el: true,  icon: '💵' },
  espace_acheteurs:   { sg: 'Espace Acheteurs',    pl: 'Espaces Acheteurs',     g: 'm', el: true,  icon: '🤝' },
  espace_produits:    { sg: 'Espace Produit',      pl: 'Espaces Produit',       g: 'm', el: true,  icon: '💎' },
  referentiel:        { sg: 'Référentiel',         pl: 'Référentiels',          g: 'm', el: false, icon: '📚' },
};

// ── 1. Vecteurs ──────────────────────────────────────────────────────────────
const VECTEURS = lireJson('scripts/vocab-vecteurs.json').cas;

const executer = ([lexique, methode, cle, args]) => {
  const voc = VOCS[lexique];
  assert.ok(voc, `lexique inconnu « ${lexique} »`);
  if (methode === 'rendre') return rendre(voc, args[0]);
  if (methode === 'avec') return voc.avec(args[0])[args[1]](cle, ...args.slice(2));
  if (methode === 'estDefaut') return voc.estDefaut; // une propriété, pas une méthode
  assert.equal(typeof voc[methode], 'function', `méthode inconnue « ${methode} »`);
  return voc[methode](cle, ...args);
};

test(`vecteurs : ${VECTEURS.length} cas (≥ 200), attendus écrits à la main`, () => {
  assert.ok(VECTEURS.length >= 200, `seulement ${VECTEURS.length} cas`);
  const echecs = [];
  for (const cas of VECTEURS) {
    const attendu = cas[4];
    let obtenu;
    try { obtenu = executer(cas); } catch (e) { obtenu = `EXCEPTION ${e.message}`; }
    if (obtenu !== attendu) echecs.push(`${JSON.stringify(cas.slice(0, 4))}\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`);
  }
  assert.equal(echecs.length, 0, `${echecs.length} vecteur(s) en échec :\n  - ${echecs.join('\n  - ')}`);
});

test('vecteurs : couverture (4 lexiques, toutes les méthodes de l\'API §2.1)', () => {
  const lexiques = new Set(VECTEURS.map((c) => c[0]));
  assert.deepEqual([...lexiques].sort(), ['ceramique', 'defaut', 'hotellerie', 'miroir']);
  const methodes = new Set(VECTEURS.map((c) => c[1]));
  const api = Object.keys(vocabDefaut);
  const absentes = api.filter((m) => !methodes.has(m));
  assert.deepEqual(absentes, [], `méthodes sans vecteur : ${absentes.join(', ')}`);
  assert.ok(methodes.has('rendre'));
  for (const nom of lexiques) {
    const n = VECTEURS.filter((c) => c[0] === nom).length;
    assert.ok(n >= 30, `lexique ${nom} : ${n} cas seulement`);
  }
});

test('API §2.1 : toutes les méthodes, avec leurs variantes à majuscule', () => {
  const attendues = [
    'nom', 'Nom', 'Titre', 'MAJ', 'pl', 'Pl', 'court', 'Court', 'nomS', 'NomS', 'n', 'compl', 'avecCourt',
    'le', 'Le', 'un', 'Un', 'du', 'Du', 'de', 'De', 'au', 'Au', 'ce', 'Ce', 'aucun', 'Aucun',
    'votre', 'Votre', 'mon', 'Mon', 'son', 'Son', 'nouveau', 'Nouveau', 'tous', 'Tous',
    'acc', 'g', 'icon', 'avec',
    // Ajouts de l'étape S4 (inventaire) : déterminant seul, pour un terme séparé de son déterminant par une balise.
    'det', 'Det',
    // Ajout de l'étape S5 (consolidation) : accord avec plusieurs termes coordonnés.
    'accN',
    // Exemples de saisie inchangés en restauration : l'exemple d'origine ou l'exemple neutre.
    'ex',
  ];
  // … et une propriété : le lexique du compte est-il le lexique par défaut ?
  assert.deepEqual(Object.keys(vocabDefaut).sort(), [...attendues, 'estDefaut'].sort());
  for (const m of attendues) assert.equal(typeof vocabDefaut[m], 'function', m);
  assert.equal(typeof vocabDefaut.estDefaut, 'boolean');
});

// ── 2. Lexique par défaut v2 ─────────────────────────────────────────────────
test('lexique par défaut v2 : les 32 clés d\'origine rendent exactement sg / pl d\'origine', () => {
  assert.equal(Object.keys(ORIGINE_32).length, 32);
  assert.deepEqual(LEXIQUE_CLES.slice(0, 32), Object.keys(ORIGINE_32), 'les 32 clés d\'origine restent en tête, dans le même ordre');
  for (const [k, o] of Object.entries(ORIGINE_32)) {
    assert.equal(vocabDefaut.Nom(k), o.sg, `${k} : sg`);
    assert.equal(vocabDefaut.Nom(k, true), o.pl, `${k} : pl`);
    assert.equal(vocabDefaut.Pl(k), o.pl, `${k} : Pl`);
    assert.equal(LEXIQUE_DEFAUT[k].sg, o.sg);
    assert.equal(LEXIQUE_DEFAUT[k].pl, o.pl);
    assert.equal(vocabDefaut.g(k), o.g, `${k} : genre`);
    assert.equal(LEXIQUE_DEFAUT[k].el, o.el, `${k} : élision`);
    assert.equal(vocabDefaut.icon(k), o.icon, `${k} : icône`);
  }
});

test('lexique par défaut v2 : clés ajoutées (§1.3), formes courtes, appositions, gel', () => {
  assert.equal(LEXIQUE_CLES.length, 43);
  assert.deepEqual(LEXIQUE_CLES.slice(32), [
    'produit', 'produit_compose', 'labo_long', 'labo_desc', 'activite_desc', 'article_ingredient',
    'cat_pt_utilisable', 'cat_pt_valorise', 'cat_pt_vendable',
    // Corrections après revues : abréviations de badge et de colonne.
    'transfert_abr', 'supplement_abr',
  ]);
  // Corrections après revues : le burger de la barre latérale et du tableau de bord est l'icône de « produit ».
  assert.equal(LEXIQUE_DEFAUT.produit.icon, '🍔');
  assert.deepEqual({ ...LEXIQUE_DEFAUT.transfert_abr.court }, { sg: 'Trf', pl: 'Trf' });
  assert.deepEqual([LEXIQUE_DEFAUT.produit.sg, LEXIQUE_DEFAUT.produit.pl, LEXIQUE_DEFAUT.produit.g], ['Produit', 'Produits', 'm']);
  assert.deepEqual([LEXIQUE_DEFAUT.produit_compose.sg, LEXIQUE_DEFAUT.produit_compose.pl, LEXIQUE_DEFAUT.produit_compose.g], ['Produit composé', 'Produits composés', 'm']);
  assert.deepEqual({ ...LEXIQUE_DEFAUT.pt.court }, { sg: 'PT', pl: 'PT' });
  assert.deepEqual({ ...LEXIQUE_DEFAUT.appro.court }, { sg: 'Appro', pl: 'Appros' });
  assert.deepEqual({ ...LEXIQUE_DEFAUT.fiche_technique.court }, { sg: 'FT', pl: 'FT' });
  // Étape S4 : le sigle « PU » (4 écrans) est la forme courte de produit_utilisable, comme « PT » celle de pt.
  assert.deepEqual({ ...LEXIQUE_DEFAUT.produit_utilisable.court }, { sg: 'PU', pl: 'PU' });
  const avecCourt = LEXIQUE_CLES.filter((k) => LEXIQUE_DEFAUT[k].court);
  assert.deepEqual(avecCourt, ['produit_utilisable', 'fiche_technique', 'appro', 'pt', 'transfert_abr']);
  const appo = LEXIQUE_CLES.filter((k) => LEXIQUE_DEFAUT[k].appo);
  assert.deepEqual(appo, ['activite', 'labo', 'acheteur', 'gerant']);
  assert.ok(Object.isFrozen(LEXIQUE_DEFAUT) && Object.isFrozen(LEXIQUE_CLES));
  for (const k of LEXIQUE_CLES) {
    assert.ok(Object.isFrozen(LEXIQUE_DEFAUT[k]), `${k} gelée`);
    if (LEXIQUE_DEFAUT[k].court) assert.ok(Object.isFrozen(LEXIQUE_DEFAUT[k].court), `${k}.court gelée`);
    assert.doesNotMatch(`${LEXIQUE_DEFAUT[k].sg}${LEXIQUE_DEFAUT[k].pl}`, /[[\]|*\\\n]/, `${k} : caractère interdit (§1.4)`);
  }
});

// ── 3. Clés dérivées ─────────────────────────────────────────────────────────
const DERIVEES = {
  espace_activites:  ['activite', 'gabarit', 'Espace Activités'],
  espace_labo:       ['labo', 'gabarit', 'Espace Labo'],
  espace_vente:      ['vente', 'gabarit', 'Espace Vente'],
  espace_acheteurs:  ['acheteur', 'gabarit', 'Espace Acheteurs'],
  espace_produits:   ['produit', 'gabarit', 'Espace Produit'],
  labo_long:         ['labo', 'copie', 'Laboratoire'],
  labo_desc:         ['labo', 'copie', 'Laboratoire de production'],
  activite_desc:     ['activite', 'copie', 'Point de vente'],
  // Étape S5 : l'article que l'existant nomme « ingrédient » (inventaire, historique des transferts).
  article_ingredient: ['article', 'copie', 'Ingrédient'],
  cat_pt_utilisable: ['produit_utilisable', 'pluriel_titre', 'Produits Transformés Utilisables'],
  cat_pt_valorise:   ['produit_valorise', 'pluriel_titre', 'Produits Composés Valorisés'],
  cat_pt_vendable:   ['produit_vendable', 'pluriel_titre', 'Produits Transformés Vendables'],
  // Corrections après revues : abréviations que l'existant écrivait en dur (« ↗ Transf. », « ⇄Trf », « · Suppl. »).
  transfert_abr:     ['transfert', 'copie', 'Transf.'],
  supplement_abr:    ['supplement', 'copie', 'Suppl.'],
};

test('clés dérivées : table du §1.3 (parent, mode, défaut)', () => {
  const declarees = LEXIQUE_CLES.filter((k) => LEXIQUE_DEFAUT[k].derive_de);
  assert.deepEqual([...declarees].sort(), Object.keys(DERIVEES).sort());
  for (const [k, [parent, mode, defaut]] of Object.entries(DERIVEES)) {
    assert.equal(LEXIQUE_DEFAUT[k].derive_de, parent, `${k} : parent`);
    assert.equal(LEXIQUE_DEFAUT[k].mode, mode, `${k} : mode`);
    assert.equal(vocabDefaut.Nom(k), defaut, `${k} : défaut`);
    assert.ok(LEXIQUE_DEFAUT[parent] && !LEXIQUE_DEFAUT[parent].derive_de, `${k} : le parent est une clé simple`);
  }
});

test('clés espace_* : le gabarit rendu par défaut est strictement la valeur d\'origine', () => {
  const espaces = LEXIQUE_CLES.filter((k) => k.startsWith('espace_'));
  assert.equal(espaces.length, 5);
  for (const k of espaces) {
    const e = LEXIQUE_DEFAUT[k];
    assert.equal(e.mode, 'gabarit');
    assert.equal(rendre(vocabDefaut, e.gabarit), ORIGINE_32[k].sg, `${k} : gabarit « ${e.gabarit} »`);
    assert.equal(e.sg, ORIGINE_32[k].sg);
    assert.equal(e.pl, ORIGINE_32[k].pl);
    assert.deepEqual(balisesInvalides(e.gabarit), []);
  }
});

test('résolution sans écart : le lexique résolu EST le lexique par défaut', () => {
  for (const ecarts of [undefined, null, {}, '', 'pas un objet', []]) {
    assert.deepEqual(resoudreLexique(LEXIQUE_DEFAUT, ecarts), JSON.parse(JSON.stringify(LEXIQUE_DEFAUT)));
  }
  assert.equal(JSON.stringify(resoudreLexique(LEXIQUE_DEFAUT, {})), JSON.stringify(LEXIQUE_DEFAUT), 'même ordre de clés');
  // le lexique résolu ne partage aucun objet avec le défaut gelé
  const r = resoudreLexique(LEXIQUE_DEFAUT, {});
  for (const k of LEXIQUE_CLES) {
    assert.notEqual(r[k], LEXIQUE_DEFAUT[k]);
    assert.ok(!Object.isFrozen(r[k]), `${k} : copie`);
    if (r[k].court) assert.ok(r[k].court !== LEXIQUE_DEFAUT[k].court && !Object.isFrozen(r[k].court), `${k}.court : copie`);
  }
  const c = completerLexique(LEXIQUE_DEFAUT, {});
  assert.ok(c.pt.court !== LEXIQUE_DEFAUT.pt.court && !Object.isFrozen(c.pt));
});

test('résolution : les trois modes de dérivation (Hôtellerie, Céramique)', () => {
  const h = LEXIQUES.hotellerie;
  const c = LEXIQUES.ceramique;
  // gabarit : rendu avec le lexique du domaine, genre 'm', élision du défaut, pluriel des mots littéraux de tête
  assert.deepEqual([h.espace_labo.sg, h.espace_labo.pl, h.espace_labo.g, h.espace_labo.el], ['Espace Cuisine', 'Espaces Cuisine', 'm', true]);
  assert.deepEqual([h.espace_activites.sg, h.espace_activites.pl], ['Espace Services', 'Espaces Services']);
  assert.equal(h.espace_acheteurs.sg, 'Espace Clients professionnels');
  assert.equal(c.espace_activites.sg, 'Espace Points de vente');
  assert.equal(c.espace_labo.sg, 'Espace Site');
  // gabarit dont le parent n'est pas surchargé : défaut inchangé
  assert.deepEqual(h.espace_vente, { ...LEXIQUE_DEFAUT.espace_vente });
  assert.deepEqual(c.espace_produits, { ...LEXIQUE_DEFAUT.espace_produits });
  // copie : entrée ENTIÈRE du parent (formes, genre, élision, forme courte)
  assert.deepEqual([h.labo_long.sg, h.labo_long.pl, h.labo_long.g, h.labo_long.el], ['Cuisine centrale', 'Cuisines centrales', 'f', false]);
  assert.deepEqual(h.labo_long.court, { sg: 'Cuisine', pl: 'Cuisines' });
  assert.equal(h.labo_desc.sg, 'Cuisine centrale');
  assert.deepEqual([h.activite_desc.sg, h.activite_desc.g], ['Service', 'm']);
  assert.equal(c.activite_desc.sg, 'Point de vente');
  // pluriel_titre : sg = pl = Titre(P.pl), genre et élision du parent
  assert.deepEqual([h.cat_pt_vendable.sg, h.cat_pt_vendable.pl, h.cat_pt_vendable.g], ['Prestations Vendues', 'Prestations Vendues', 'f']);
  assert.equal(h.cat_pt_utilisable.sg, 'Consommables');
  assert.equal(c.cat_pt_utilisable.sg, 'Semi-finis');
  assert.equal(c.cat_pt_valorise.sg, 'Produits Finis Catalogue');
  // les métadonnées de dérivation viennent toujours du défaut
  for (const k of Object.keys(DERIVEES)) {
    assert.equal(h[k].derive_de, LEXIQUE_DEFAUT[k].derive_de);
    assert.equal(h[k].mode, LEXIQUE_DEFAUT[k].mode);
    assert.equal(h[k].gabarit, LEXIQUE_DEFAUT[k].gabarit);
  }
  // clé non surchargée (Céramique : perte retirée au §1.5) : défaut
  assert.deepEqual(c.perte, { ...LEXIQUE_DEFAUT.perte });
  assert.deepEqual(Object.keys(h), [...LEXIQUE_CLES], 'ordre des clés du défaut conservé');
});

test('résolution : surcharge de la clé dérivée elle-même, forme courte héritée ou non, entrées partielles', () => {
  // (1) le domaine surcharge K → entrée de K, même si le parent est surchargé
  const r1 = resoudreLexique(LEXIQUE_DEFAUT, {
    labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm', el: true },
    espace_labo: { sg: 'Coin Atelier', pl: 'Coins Atelier', g: 'm', el: false },
    labo_long: { sg: 'Grand atelier', pl: 'Grands ateliers', g: 'm', el: false },
  });
  assert.equal(r1.espace_labo.sg, 'Coin Atelier');
  assert.equal(r1.labo_long.sg, 'Grand atelier');
  assert.equal(r1.labo_desc.sg, 'Atelier', 'labo_desc suit le parent');
  assert.equal(r1.espace_labo.derive_de, 'labo', 'derive_de non surchargeable');
  // (2) `court` et `appo` ne sont hérités du défaut que si le domaine ne surcharge pas sg
  const r2 = resoudreLexique(LEXIQUE_DEFAUT, { pt: { sg: 'Préparation', pl: 'Préparations', g: 'f', el: false } });
  assert.equal(r2.pt.court, undefined);
  assert.equal(creerVocab(r2).Court('pt'), 'Préparation');
  assert.equal(creerVocab(r2).avecCourt('pt', true), 'préparations');
  assert.equal(r1.labo.appo, undefined);
  assert.equal(creerVocab(r1).compl('labo'), "de l'atelier");
  const r3 = resoudreLexique(LEXIQUE_DEFAUT, { pt: { icon: '🥣' }, labo: { court: { sg: 'Lab', pl: 'Labs' } } });
  assert.deepEqual(r3.pt.court, { sg: 'PT', pl: 'PT' }, 'court hérité : sg non surchargé');
  assert.equal(r3.pt.icon, '🥣');
  assert.equal(r3.pt.sg, 'Produit transformé');
  assert.equal(r3.labo.appo, true);
  assert.equal(creerVocab(r3).Court('labo'), 'Lab');
  assert.equal(r3.espace_labo.sg, 'Espace Lab', 'le gabarit suit la forme courte du parent');
  assert.equal(r3.labo_long.sg, 'Laboratoire', 'copie : seulement si sg du parent est surchargé');
  // (3) entrée incomplète tolérée : pl = sg, g = 'm', el = false
  const r4 = resoudreLexique(LEXIQUE_DEFAUT, { activite: { sg: 'Comptoir' } });
  assert.deepEqual([r4.activite.sg, r4.activite.pl, r4.activite.g, r4.activite.el], ['Comptoir', 'Comptoir', 'm', false]);
  assert.equal(r4.activite.icon, '🏪', 'icône héritée');
  assert.equal(creerVocab(r4).le('activite'), 'le comptoir');
  assert.equal(r4.espace_activites.sg, 'Espace Comptoir');
  // (4) derive_de / mode / gabarit envoyés par un domaine : ignorés
  const r5 = resoudreLexique(LEXIQUE_DEFAUT, { labo: { sg: 'Site', pl: 'Sites', g: 'm', el: false, derive_de: 'vente', mode: 'copie', gabarit: 'x' } });
  assert.equal(r5.labo.derive_de, undefined);
  assert.equal(r5.labo.gabarit, undefined);
  // (5) clé inconnue du défaut : conservée telle quelle
  const r6 = resoudreLexique(LEXIQUE_DEFAUT, { chantier: { sg: 'Chantier', pl: 'Chantiers', g: 'm', el: false } });
  assert.deepEqual(r6.chantier, { sg: 'Chantier', pl: 'Chantiers', g: 'm', el: false });
  assert.equal(creerVocab(r6).le('chantier', 2), 'les chantiers');
  // le défaut n'est jamais modifié
  assert.equal(LEXIQUE_DEFAUT.labo.sg, 'Labo');
});

test('résolution : « le domaine surcharge P » = formes résolues de P différentes du défaut, pour les trois modes', () => {
  // Parent redéclaré À L'IDENTIQUE du défaut : ses clés dérivées gardent leur défaut (copie comme gabarit).
  const r1 = resoudreLexique(LEXIQUE_DEFAUT, { labo: { sg: 'Labo', pl: 'Labos', g: 'm', el: false }, produit_vendable: { sg: 'Produit vendable', pl: 'Produits vendables', g: 'm', el: false } });
  assert.deepEqual([r1.labo_long.sg, r1.labo_long.pl], ['Laboratoire', 'Laboratoires']);
  assert.equal(r1.labo_desc.sg, 'Laboratoire de production');
  assert.equal(r1.espace_labo.sg, 'Espace Labo');
  assert.equal(r1.cat_pt_vendable.sg, 'Produits Transformés Vendables');
  assert.equal(r1.labo.appo, undefined, 'mais l\'entrée redéclarée n\'hérite ni apposition ni forme courte (sg surchargé)');
  // Parent dont seul le pluriel change (sg non surchargé) : copie et pluriel_titre suivent, comme le gabarit.
  const r2 = resoudreLexique(LEXIQUE_DEFAUT, { labo: { pl: 'Labz' }, produit_vendable: { pl: 'Produits à vendre' }, activite: { pl: 'Activitéz' } });
  assert.deepEqual([r2.labo_long.sg, r2.labo_long.pl, r2.labo_long.appo], ['Labo', 'Labz', true], 'copie : entrée entière du parent');
  assert.equal(r2.cat_pt_vendable.sg, 'Produits à Vendre');
  assert.equal(r2.espace_activites.sg, 'Espace Activitéz');
  // Genre, élision, icône ou forme courte seuls : les formes longues sont celles du défaut, la copie reste au défaut.
  const r3 = resoudreLexique(LEXIQUE_DEFAUT, { labo: { g: 'f', el: true, icon: '🧪', court: { sg: 'Lab', pl: 'Labs' } } });
  assert.deepEqual([r3.labo_long.sg, r3.labo_long.g], ['Laboratoire', 'm']);
  assert.equal(r3.espace_labo.sg, 'Espace Lab', 'le gabarit suit la forme courte');
  // pluriel_titre : genre ET élision du parent.
  const r4 = resoudreLexique(LEXIQUE_DEFAUT, { produit_vendable: { sg: 'Article fini', pl: 'Articles finis', g: 'm', el: true }, produit_utilisable: { sg: 'Offre interne', pl: 'Offres internes', g: 'f', el: true } });
  assert.deepEqual([r4.cat_pt_vendable.sg, r4.cat_pt_vendable.g, r4.cat_pt_vendable.el], ['Articles Finis', 'm', true]);
  assert.deepEqual([r4.cat_pt_utilisable.sg, r4.cat_pt_utilisable.g, r4.cat_pt_utilisable.el], ['Offres Internes', 'f', true]);
  assert.equal(creerVocab(r4).de('cat_pt_vendable'), "d'articles finis");
  assert.equal(creerVocab(r4).le('cat_pt_utilisable'), "l'offres internes");
  // gabarit : genre 'm' et élision du DÉFAUT de la clé, même si le parent est féminin sans élision.
  const r5 = resoudreLexique(LEXIQUE_DEFAUT, { vente: { sg: 'Sortie', pl: 'Sorties', g: 'f', el: false } });
  assert.deepEqual([r5.espace_vente.sg, r5.espace_vente.g, r5.espace_vente.el], ['Espace Sortie', 'm', true]);
  assert.equal(creerVocab(r5).le('espace_vente', false, 'Nom'), "l'Espace Sortie");
});

test('lexique miroir : chaque clé du défaut, genre et élision inversés, mot différent', () => {
  assert.deepEqual(Object.keys(ESSAIS.miroir).sort(), [...LEXIQUE_CLES].sort());
  for (const k of LEXIQUE_CLES) {
    const d = LEXIQUE_DEFAUT[k];
    const m = ESSAIS.miroir[k];
    assert.notEqual(m.g, d.g, `${k} : genre inversé`);
    assert.notEqual(m.el, d.el, `${k} : élision inversée`);
    assert.notEqual(m.sg.toLowerCase(), d.sg.toLowerCase(), `${k} : mot différent`);
    // l'élision déclarée correspond bien à l'initiale du mot (voyelle ou non)
    assert.equal(/^[aeiouyàâéèêëîïôöùûœh]/i.test(m.sg), m.el, `${k} : « ${m.sg} » et el = ${m.el}`);
  }
});

// ── 3 bis. Extension de l'étape S5 (consolidation du balayage) ────────────────
test('S5 — accN : accord avec plusieurs termes coordonnés, féminin seulement si TOUS sont féminins', () => {
  // par défaut : activité (f) + labo (m) → masculin ; vente (f) + marge (f) → féminin
  assert.equal(vocabDefaut.accN(['activite', 'labo'], 'assignés', 'assignées'), 'assignés');
  assert.equal(vocabDefaut.accN(['vente', 'marge'], 'liés', 'liées'), 'liées');
  // l'ordre des clés ne compte pas ; une seule clé = acc
  assert.equal(vocabDefaut.accN(['labo', 'activite'], 'trouvé', 'trouvée'), vocabDefaut.accN(['activite', 'labo'], 'trouvé', 'trouvée'));
  for (const k of ['activite', 'labo', 'vente', 'stock']) {
    assert.equal(vocabDefaut.accN([k], 'créé', 'créée', 2), vocabDefaut.acc(k, 'créé', 'créée', 2), k);
  }
  // même règle de pluriel que acc (« s » sauf finale s, x, z)
  assert.equal(vocabDefaut.accN(['vente', 'marge'], 'lié', 'liée', 3), 'liées');
  assert.equal(vocabDefaut.accN(['article', 'produit'], 'requis', 'requise', true), 'requis');
  // liste vide ou clé inconnue : masculin, jamais d'exception
  assert.equal(vocabDefaut.accN([], 'x', 'y'), 'x');
  assert.equal(vocabDefaut.accN(['vente', 'cle_absente_s5'], 'x', 'y'), 'x');
  // le cas qui a motivé la méthode : faux au masculin dès que les DEUX termes sont féminins
  const deuxFeminins = creerVocab(resoudreLexique(LEXIQUE_DEFAUT, { labo: { sg: 'Cuisine centrale', pl: 'Cuisines centrales', g: 'f', el: false } }));
  assert.equal(deuxFeminins.accN(['activite', 'labo'], 'assignés', 'assignées'), 'assignées');
  assert.equal(VOCS.hotellerie.accN(['activite', 'labo'], 'assignés', 'assignées'), 'assignés', 'Hôtellerie : service (m) + cuisine centrale (f)');
  assert.equal(VOCS.miroir.accN(['article', 'produit_utilisable'], 'requis', 'requises'), 'requises');
});

test('S5 — forme courte pour MAJ, nomS et NomS (argument de casse « court » / « Court »)', () => {
  // identité par défaut : « labo » n'a pas de forme courte, le rendu ne change pas
  assert.equal(vocabDefaut.MAJ('labo', false, 'court'), vocabDefaut.MAJ('labo'));
  assert.equal(vocabDefaut.NomS('labo', 'Court'), vocabDefaut.NomS('labo'));
  assert.equal(vocabDefaut.nomS('labo', 'court'), vocabDefaut.nomS('labo'));
  // sans argument, ou avec une casse qui n'est pas courte : la forme longue, comme avant
  for (const k of LEXIQUE_CLES) {
    assert.equal(vocabDefaut.MAJ(k, false, 'Nom'), vocabDefaut.MAJ(k), k);
    assert.equal(vocabDefaut.nomS(k, 'nom'), vocabDefaut.nomS(k), k);
    assert.equal(vocabDefaut.NomS(k, 'Titre'), vocabDefaut.NomS(k), k);
  }
  assert.equal(VOCS.hotellerie.MAJ('labo'), 'CUISINE CENTRALE');
  assert.equal(VOCS.hotellerie.MAJ('labo', false, 'court'), 'CUISINE');
  assert.equal(VOCS.ceramique.MAJ('labo', false, 'court'), 'SITE');
  assert.equal(VOCS.hotellerie.NomS('labo', 'Court'), 'Cuisine(s)');
  assert.equal(VOCS.ceramique.NomS('labo', 'Court'), 'Site(s)');
  assert.equal(VOCS.ceramique.nomS('labo', 'court'), 'site(s)');
  assert.equal(vocabDefaut.NomS('appro', 'Court'), 'Appro(s)');
});

test('S5 — clé dérivée article_ingredient : « Ingrédient » par défaut, le terme de « article » dès qu\'un domaine le renomme', () => {
  const d = LEXIQUE_DEFAUT.article_ingredient;
  const o = LEXIQUE_DEFAUT.ingredient;
  // par défaut, exactement les formes de la clé ingredient (identité des écrans qui changent de clé)
  assert.deepEqual([d.sg, d.pl, d.g, d.el], [o.sg, o.pl, o.g, o.el]);
  assert.deepEqual([d.derive_de, d.mode], ['article', 'copie']);
  for (const m of ['nom', 'Nom', 'pl', 'Pl', 'nomS', 'le', 'Le', 'un', 'du', 'de', 'ce', 'aucun', 'Aucun']) {
    assert.equal(vocabDefaut[m]('article_ingredient'), vocabDefaut[m]('ingredient'), m);
  }
  assert.equal(vocabDefaut.n('article_ingredient', 3), vocabDefaut.n('ingredient', 3));
  assert.equal(vocabDefaut.du('article_ingredient', true), vocabDefaut.du('ingredient', true));
  assert.equal(vocabDefaut.acc('article_ingredient', 'Tous', 'Toutes'), 'Tous');
  // domaine qui renomme « article » : copie de l'entrée du parent
  const h = LEXIQUES.hotellerie;
  assert.deepEqual([h.article_ingredient.sg, h.article_ingredient.pl, h.article_ingredient.g, h.article_ingredient.el], ['Fourniture', 'Fournitures', 'f', false]);
  assert.equal(h.ingredient.sg, 'Composant', 'la clé ingredient (composant d\'une recette) reste distincte');
  assert.equal(LEXIQUES.ceramique.article_ingredient.sg, 'Matière première');
  // domaine qui ne renomme que « ingrédient » : la clé dérivée garde son défaut (règle 3 du §1.3) ; elle se surcharge à part
  const r = resoudreLexique(LEXIQUE_DEFAUT, { ingredient: { sg: 'Intrant', pl: 'Intrants', g: 'm', el: true } });
  assert.equal(r.article_ingredient.sg, 'Ingrédient');
  const r2 = resoudreLexique(LEXIQUE_DEFAUT, { article_ingredient: { sg: 'Référence', pl: 'Références', g: 'f', el: false } });
  assert.deepEqual([r2.article_ingredient.sg, r2.article.sg], ['Référence', 'Article']);
});

test('corrections après revues — abréviations transfert_abr / supplement_abr : identité par défaut, le terme du domaine sinon', () => {
  // par défaut : exactement les abréviations que les écrans écrivaient en dur
  assert.equal(`↗ ${vocabDefaut.Nom('transfert_abr')}`, '↗ Transf.');
  assert.equal(`⇄${vocabDefaut.Court('transfert_abr')}`, '⇄Trf');
  assert.equal(` · ${vocabDefaut.Nom('supplement_abr')}`, ' · Suppl.');
  // domaine qui renomme le parent : copie de l'entrée ENTIÈRE du parent (l'abréviation de la restauration disparaît)
  const h = LEXIQUES.hotellerie;
  assert.deepEqual([h.transfert_abr.sg, h.transfert_abr.pl, h.transfert_abr.g, h.transfert_abr.court], ['Livraison interne', 'Livraisons internes', 'f', undefined]);
  assert.equal(VOCS.hotellerie.Court('transfert_abr'), 'Livraison interne');
  assert.equal(VOCS.hotellerie.Nom('supplement_abr'), 'Suppl.', 'Hôtellerie ne renomme pas « supplément »');
  assert.equal(VOCS.ceramique.Nom('supplement_abr'), 'Option');
  // la forme courte du parent est copiée avec lui : c'est elle que lisent les colonnes étroites
  const r = resoudreLexique(LEXIQUE_DEFAUT, { transfert: { sg: 'Livraison interne', pl: 'Livraisons internes', g: 'f', el: false, court: { sg: 'Livr.', pl: 'Livr.' } } });
  assert.deepEqual([creerVocab(r).Nom('transfert_abr'), creerVocab(r).Court('transfert_abr')], ['Livraison interne', 'Livr.']);
  // l'abréviation se surcharge à part
  const r2 = resoudreLexique(LEXIQUE_DEFAUT, { transfert_abr: { sg: 'Livr.', pl: 'Livr.', g: 'f', el: false } });
  assert.deepEqual([creerVocab(r2).Nom('transfert_abr'), creerVocab(r2).Court('transfert_abr'), creerVocab(r2).Nom('transfert')], ['Livr.', 'Livr.', 'Transfert']);
});

// ── 3 ter. Exemples de saisie : inchangés tant que le lexique est celui par défaut ─────────────
test('estDefaut : vrai si le lexique donne les rendus du lexique par défaut, faux au premier écart de rendu', () => {
  assert.equal(vocabDefaut.estDefaut, true);
  assert.equal(creerVocab(LEXIQUE_DEFAUT).estDefaut, true);
  // domaine sans écart (restauration, café, boulangerie) : ce que le serveur résout et ce que l'écran reçoit
  assert.equal(creerVocab(resoudreLexique(LEXIQUE_DEFAUT, {})).estDefaut, true);
  assert.equal(creerVocab(JSON.parse(JSON.stringify(LEXIQUE_DEFAUT))).estDefaut, true);
  assert.equal(vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, {})).estDefaut, true);
  assert.equal(vocabDuLexique(null).estDefaut, true, 'admin, boss, non connecté');
  assert.equal(vocabDuLexique(JSON.parse(JSON.stringify(ORIGINE_32))).estDefaut, true, 'serveur d\'avant le lot 2 : complété par le défaut');
  // les métadonnées de dérivation ne sont pas un rendu
  const sansMeta = Object.fromEntries(Object.entries(LEXIQUE_DEFAUT).map(([k, { derive_de: _d, mode: _m, gabarit: _g, ...e }]) => [k, e]));
  assert.equal(creerVocab(sansMeta).estDefaut, true);
  // autres domaines
  for (const nom of ['hotellerie', 'ceramique', 'miroir']) assert.equal(VOCS[nom].estDefaut, false, nom);
  assert.equal(vocabDuLexique(LEXIQUES.hotellerie).estDefaut, false);
  // un seul écart de rendu suffit : forme, genre, élision, icône, forme courte, apposition
  const ecarts = {
    forme: { labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm', el: true } },
    pluriel: { labo: { pl: 'Labz' } },
    genre: { labo: { g: 'f' } },
    'élision': { labo: { el: true } },
    'icône': { labo: { icon: '🧪' } },
    'forme courte': { labo: { court: { sg: 'Lab', pl: 'Labs' } } },
    'apposition perdue (entrée redéclarée à l\'identique)': { labo: { sg: 'Labo', pl: 'Labos', g: 'm', el: false } },
  };
  for (const [nom, e] of Object.entries(ecarts)) {
    const resolu = resoudreLexique(LEXIQUE_DEFAUT, e);
    assert.equal(creerVocab(resolu).estDefaut, false, nom);
    assert.equal(vocabDuLexique(resolu).estDefaut, false, `${nom} (lexique reçu)`);
  }
  // Corrections après revues — clé EN PLUS (inconnue du lexique par défaut : clé ajoutée par un serveur plus
  // récent pendant qu'un écran reste ouvert, clé propre à un domaine) : aucun texte ne la rend, ce n'est pas
  // un écart. Sans cela, la première clé ajoutée au lexique rendait neutres les exemples de saisie de tous
  // les comptes restauration encore ouverts.
  const plus = { ...LEXIQUE_DEFAUT, cle_du_lot_2b: { sg: 'Chantier', pl: 'Chantiers', g: 'm', el: false } };
  assert.equal(creerVocab(plus).estDefaut, true);
  assert.equal(creerVocab(plus).ex('Ex: Poulet entier', 'Ex: Article A'), 'Ex: Poulet entier');
  const recuPlus = vocabDuLexique(JSON.parse(JSON.stringify(plus))); // ce que l'écran reçoit
  assert.equal(recuPlus.estDefaut, true);
  assert.equal(recuPlus.ex('Ex: Poulet entier', 'Ex: Article A'), 'Ex: Poulet entier');
  assert.equal(rendre(recuPlus, 'Nom [[du:activite]] (ex: [[ex:activite:Restaurant A]])'), "Nom de l'activité (ex: Restaurant A)");
  assert.equal(recuPlus.le('cle_du_lot_2b', 2), 'les chantiers', 'la clé en plus reste lisible, comme côté serveur');
  assert.notEqual(recuPlus, vocabDefaut);
  // … mais une clé en plus dans un lexique qui s'écarte du défaut ne le rend pas « par défaut »
  assert.equal(creerVocab({ ...LEXIQUES.hotellerie, cle_du_lot_2b: { sg: 'Chantier' } }).estDefaut, false);
  // clé en moins, lexique illisible : ce n'est pas le lexique par défaut
  const { labo: _labo, ...sansLabo } = LEXIQUE_DEFAUT;
  assert.equal(creerVocab(sansLabo).estDefaut, false);
  for (const lexique of [null, undefined, 'x', 42, [], {}]) assert.equal(creerVocab(lexique).estDefaut, false, String(lexique));
  // propriété en lecture seule (vocabulaire gelé)
  assert.throws(() => { 'use strict'; vocabDefaut.estDefaut = false; }, TypeError);
  assert.equal(vocabDefaut.estDefaut, true);
});

test('ex : l\'exemple d\'origine si estDefaut, sinon l\'exemple neutre — jamais un mélange des deux', () => {
  // Les 13 exemples de saisie du balayage : inchangés par défaut, neutres et construits ailleurs.
  const exemples = (voc) => [
    voc.ex('Ex: Point de vente Tunis', `Ex: ${voc.Nom('activite')} 1`),
    voc.ex('Ex: Labo Central', `Ex: ${voc.Nom('labo')} 1`),
    voc.ex('Ex. Cookie maison', `Ex. ${voc.Nom('produit_valorise')} A`),
    voc.ex('Ex. Burger, Pizza Margherita…', `Ex. ${voc.Nom('produit')} A, ${voc.Nom('produit')} B…`),
    voc.ex('Ex. BRG-001, REF-42…', 'Ex. REF-001, REF-42…'),
    voc.ex('Ex: Poulet entier', `Ex: ${voc.Nom('article')} A`),
    voc.ex('Ex: Viandes & Volailles', 'Ex: Catégorie A'),
  ];
  assert.deepEqual(exemples(vocabDefaut), [
    'Ex: Point de vente Tunis', 'Ex: Labo Central', 'Ex. Cookie maison', 'Ex. Burger, Pizza Margherita…',
    'Ex. BRG-001, REF-42…', 'Ex: Poulet entier', 'Ex: Viandes & Volailles',
  ]);
  assert.deepEqual(exemples(VOCS.hotellerie), [
    'Ex: Service 1', 'Ex: Cuisine centrale 1', 'Ex. Prestation catalogue A', 'Ex. Produit A, Produit B…',
    'Ex. REF-001, REF-42…', 'Ex: Fourniture A', 'Ex: Catégorie A',
  ]);
  assert.deepEqual(exemples(VOCS.ceramique).slice(0, 2), ['Ex: Point de vente 1', 'Ex: Site de production 1']);
  assert.equal(exemples(VOCS.miroir)[5], 'Ex: Denrée A');
  // un domaine sans écart (café, boulangerie) garde les exemples d'origine
  assert.deepEqual(exemples(creerVocab(resoudreLexique(LEXIQUE_DEFAUT, {}))), exemples(vocabDefaut));
  // le mini-vocabulaire voc.avec hérite du compte
  const salle = { sg: 'Salle', pl: 'Salles', g: 'f', el: false };
  assert.equal(vocabDefaut.avec(salle).estDefaut, true);
  assert.equal(VOCS.hotellerie.avec(salle).estDefaut, false);
  assert.equal(vocabDefaut.avec(salle).ex('Ex: Salle bleue', 'Ex: Salle 1'), 'Ex: Salle bleue');
  assert.equal(VOCS.hotellerie.avec(salle).ex('Ex: Salle bleue', 'Ex: Salle 1'), 'Ex: Salle 1');
  // jamais d'exception : argument absent → chaîne vide
  assert.equal(vocabDefaut.ex(undefined, 'x'), '');
  assert.equal(VOCS.miroir.ex('x'), '');
  assert.equal(VOCS.miroir.ex('x', null), '');
});

test('balise ex : [[ex:clé:texte par défaut]] = voc.ex(texte, Nom(clé) + « A ») ; un seul argument, non vide', () => {
  const gabarit = 'Nom [[du:activite]] (ex: [[ex:activite:Restaurant A]])';
  assert.equal(rendre(vocabDefaut, gabarit), "Nom de l'activité (ex: Restaurant A)");
  assert.equal(rendre(VOCS.hotellerie, gabarit), 'Nom du service (ex: Service A)');
  for (const [nom, voc] of Object.entries(VOCS)) {
    for (const k of LEXIQUE_CLES) {
      assert.equal(rendre(voc, `[[ex:${k}:Exemple d'origine]]`), voc.ex("Exemple d'origine", `${voc.Nom(k)} A`), `${nom} ${k}`);
    }
  }
  // le texte par défaut est rendu tel quel, une seule passe (une balise n'y entre pas : crochets hors grammaire)
  assert.equal(rendre(vocabDefaut, '[[ex:labo:Labo Central, 2e étage (rue X) — « dépôt »]]'), 'Labo Central, 2e étage (rue X) — « dépôt »');
  assert.deepEqual(balisesInvalides('[[ex:labo:Labo Central]] [[ex:article:Poulet entier]]'), []);
  assert.deepEqual(
    balisesInvalides('[[ex:labo]] [[ex:labo:]] [[ex:labo:  ]] [[ex:labo:Labo Central:1]] [[ex:labo:a|b]] [[Ex:labo:Labo Central]]').map((b) => b.balise),
    ['[[ex:labo]]', '[[ex:labo:]]', '[[ex:labo:  ]]', '[[ex:labo:Labo Central:1]]', '[[ex:labo:a|b]]', '[[Ex:labo:Labo Central]]'],
  );
  avertissements.length = 0;
  assert.equal(rendre(vocabDefaut, '[[ex:labo]]'), '[[ex:labo]]');
  assert.equal(avertissements.length, 1, 'balise invalide : laissée telle quelle et signalée');
  // rendreTout (fr.json) : le paquet par défaut garde l'exemple d'origine
  assert.deepEqual(rendreTout({ a: { b: gabarit } }, vocabDefaut), { a: { b: "Nom de l'activité (ex: Restaurant A)" } });
  assert.deepEqual(rendreTout({ a: { b: gabarit } }, VOCS.miroir), { a: { b: 'Nom du local (ex: Local A)' } });
});

// ── 4. Lexique reçu du serveur ───────────────────────────────────────────────
test('lexique reçu : complété clé par clé ; équivalent au défaut → vocabDefaut (même objet)', () => {
  assert.equal(vocabDuLexique(null), vocabDefaut);
  assert.equal(vocabDuLexique(undefined), vocabDefaut);
  assert.equal(vocabDuLexique({}), vocabDefaut);
  assert.equal(vocabDuLexique(JSON.parse(JSON.stringify(LEXIQUE_DEFAUT))), vocabDefaut);
  // serveur d'avant le lot 2 : 32 clés, sans forme courte ni apposition → le défaut local complète
  const ancien = JSON.parse(JSON.stringify(ORIGINE_32));
  assert.equal(vocabDuLexique(ancien), vocabDefaut);
  const complet = completerLexique(LEXIQUE_DEFAUT, ancien);
  assert.deepEqual(Object.keys(complet), [...LEXIQUE_CLES]);
  assert.deepEqual(complet.pt.court, { sg: 'PT', pl: 'PT' });
  assert.equal(complet.produit.sg, 'Produit');
  // lexique d'un autre domaine : vocabulaire propre, entrées surchargées gardées telles quelles
  const voc = vocabDuLexique(LEXIQUES.hotellerie);
  assert.notEqual(voc, vocabDefaut);
  assert.equal(voc.le('labo'), 'la cuisine centrale');
  assert.equal(voc.Nom('espace_labo'), 'Espace Cuisine');
  const partiel = vocabDuLexique({ labo: { sg: 'Cuisine centrale', pl: 'Cuisines centrales', g: 'f', el: false }, pt: { sg: 'Préparation', pl: 'Préparations', g: 'f', el: false } });
  assert.equal(partiel.Court('pt'), 'Préparation', 'entrée surchargée : pas de forme courte du défaut');
  assert.equal(partiel.Nom('activite'), 'Activité', 'clé absente : défaut');
  assert.equal(partiel.Court('appro'), 'Appro');
  // entrée sans sg : remplacée par le défaut
  assert.equal(vocabDuLexique({ labo: { pl: 'Bidules' }, activite: null, vente: 'x' }), vocabDefaut);
});

test('lexique reçu : l\'écran rend EXACTEMENT ce que rend le serveur (lexique résolu complet gardé tel quel)', () => {
  const METHODES = ['nom', 'Nom', 'Titre', 'MAJ', 'court', 'Court', 'compl', 'avecCourt', 'nomS', 'le', 'un', 'du', 'de', 'au', 'ce', 'votre', 'mon', 'son', 'nouveau'];
  const jeux = {
    hotellerie: ESSAIS.hotellerie,
    ceramique: ESSAIS.ceramique,
    miroir: ESSAIS.miroir,
    'genre seul': { labo: { g: 'f' } },
    'forme courte seule': { labo: { court: { sg: 'Lab', pl: 'Labs' } } },
    // Entrée redéclarée avec le sg du défaut : le serveur n'hérite ni forme courte ni apposition (§1.3).
    'même sg, sans forme courte (pt)': { pt: { sg: 'Produit transformé', pl: 'Produits transformés', g: 'm', el: false } },
    'même sg, sans apposition (labo)': { labo: { sg: 'Labo', pl: 'Labos', g: 'm', el: false } },
    'clé inconnue': { chantier: { sg: 'Chantier', pl: 'Chantiers', g: 'm', el: false } },
  };
  for (const [nom, ecarts] of Object.entries(jeux)) {
    const resolu = resoudreLexique(LEXIQUE_DEFAUT, ecarts); // ce que /auth/me envoie
    const serveur = creerVocab(resolu); // req.voc
    const ecran = vocabDuLexique(JSON.parse(JSON.stringify(resolu))); // ce que l'écran emploie
    const diffs = [];
    for (const k of Object.keys(resolu)) for (const m of METHODES) for (const n of [false, true]) {
      const a = m === 'nomS' ? serveur.nomS(k) : serveur[m](k, n);
      const b = m === 'nomS' ? ecran.nomS(k) : ecran[m](k, n);
      if (a !== b) diffs.push(`${m}(${k}, ${n}) serveur « ${a} » / écran « ${b} »`);
    }
    assert.deepEqual(diffs, [], `${nom} : ${diffs.length} différence(s)`);
  }
  // Les deux cas trouvés en relecture, en clair.
  const pt = vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, jeux['même sg, sans forme courte (pt)']));
  assert.equal(pt.court('pt'), 'produit transformé', 'pas de « PT » : la forme courte du défaut n\'est pas re-fusionnée');
  const labo = vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, jeux['même sg, sans apposition (labo)']));
  assert.equal(labo.compl('labo'), 'du labo');
  // completerLexique : complet → tel quel ; incomplet (serveur d'avant le lot 2) → champs du défaut re-fusionnés.
  const complet = resoudreLexique(LEXIQUE_DEFAUT, jeux['même sg, sans forme courte (pt)']);
  assert.equal(completerLexique(LEXIQUE_DEFAUT, complet).pt.court, undefined);
  const { produit: _retire, ...incomplet } = complet;
  assert.deepEqual(completerLexique(LEXIQUE_DEFAUT, incomplet).pt.court, { sg: 'PT', pl: 'PT' });
  assert.equal(completerLexique(LEXIQUE_DEFAUT, incomplet).produit.sg, 'Produit');
});

test('robustesse : jamais d\'exception, clé inconnue signalée une fois', () => {
  avertissements.length = 0;
  const voc = creerVocab({ labo: { sg: 'Labo' }, vide: {}, nul: null, texte: 'x' });
  assert.equal(voc.nom('zzz'), '‹zzz›');
  assert.equal(voc.le('zzz', 2), 'les ‹zzz›');
  assert.equal(voc.nom('vide'), '‹vide›');
  assert.equal(voc.nom('nul'), '‹nul›');
  assert.equal(voc.nom(undefined), '‹undefined›');
  assert.equal(voc.nom('zzz'), '‹zzz›');
  assert.equal(avertissements.filter((a) => a.includes('« zzz »')).length, 1, 'un seul console.warn par clé');
  assert.ok(avertissements.some((a) => a.includes('« vide »')));
  assert.equal(voc.le('labo', true), 'les labo', 'pl absent → sg');
  for (const lexique of [null, undefined, 'x', 42, []]) assert.equal(creerVocab(lexique).nom('labo'), '‹labo›');
  assert.equal(voc.acc('labo'), '');
  assert.equal(voc.n('labo', '3'), '3 labo');
  assert.ok(Object.isFrozen(voc));
});

// ── 4 bis. Compléments de l'étape S4 (inventaire) ────────────────────────────
test('det / Det : déterminant seul suivi de son séparateur — det + nom = la méthode à déterminant, pour chaque lexique', () => {
  const dets = ['le', 'un', 'du', 'de', 'au', 'ce', 'votre', 'mon', 'son', 'nouveau'];
  for (const [nom, voc] of Object.entries(VOCS)) {
    for (const k of LEXIQUE_CLES) {
      for (const d of dets) {
        const D = d.charAt(0).toUpperCase() + d.slice(1);
        for (const n of [false, true]) {
          assert.equal(voc.det(k, d, n) + voc.nom(k, n), voc[d](k, n), `${nom} det(${k}, ${d}, ${n})`);
          assert.equal(voc.det(k, d, n, 'Court') + voc.Court(k, n), voc[d](k, n, 'Court'), `${nom} det(${k}, ${d}, ${n}, Court)`);
          assert.equal(voc.Det(k, d, n) + voc.nom(k, n), voc[D](k, n), `${nom} Det(${k}, ${d}, ${n})`);
        }
      }
      assert.equal(voc.det(k, 'aucun') + voc.nom(k), voc.aucun(k), `${nom} det(${k}, aucun)`);
      // le séparateur : une espace, sauf après une apostrophe
      assert.match(voc.det(k, 'le'), /^(?:le |la |l')$/);
      assert.equal(voc.det(k, 'du', true), 'des ');
    }
  }
});

test('det : déterminant inconnu → chaîne vide, signalé une fois, jamais d\'exception ; noms de Object.prototype refusés', () => {
  avertissements.length = 0;
  const voc = creerVocab(LEXIQUE_DEFAUT);
  for (const d of ['quel', 'constructor', 'toString', '__proto__', '', undefined, null, 3]) assert.equal(voc.det('labo', d), '', String(d));
  assert.equal(voc.det('labo', 'quel'), '');
  assert.equal(avertissements.filter((a) => a.includes('déterminant inconnu : « quel »')).length, 1);
  assert.equal(voc.Det('labo', 'quel'), '');
  assert.equal(voc.det('zzz', 'le'), 'le ', 'clé inconnue : masculin sans élision');
});

test('tous / Tous : déterminant vide = nom nu ; absent = « les »', () => {
  assert.equal(vocabDefaut.Tous('prestataire', ''), 'Tous prestataires');
  assert.equal(vocabDefaut.Tous('prestataire'), 'Tous les prestataires');
  assert.equal(vocabDefaut.Tous('prestataire', undefined), 'Tous les prestataires');
  assert.equal(VOCS.miroir.tous('prestataire', ''), 'toutes agences');
});

test('balises det / Det : déterminant obligatoire, nombre et casse facultatifs, le reste est invalide', () => {
  assert.equal(rendre(vocabDefaut, '[[det:stock:du]]<b>[[nom:stock]]</b>'), 'du <b>stock</b>');
  assert.equal(rendre(vocabDefaut, '[[Det:activite:le]]<b>[[nom:activite]]</b>'), "L'<b>activité</b>");
  assert.equal(rendre(vocabDefaut, '[[det:activite:le:pl]]'), 'les ');
  assert.equal(rendre(vocabDefaut, '[[det:activite:le:2]]'), 'les ');
  assert.equal(rendre(vocabDefaut, '[[det:appro:le:court]]'), "l'");
  assert.equal(rendre(vocabDefaut, '[[det:appro:le:court:pl]]'), 'les ');
  // la casse « court » choisit l'élision de la forme courte quand elle diffère de celle de la forme longue
  const hotel = creerVocab({ hotel: { sg: 'Hôtel', pl: 'Hôtels', g: 'm', el: true, court: { sg: 'Site', pl: 'Sites', el: false } } });
  assert.equal(rendre(hotel, '[[det:hotel:le]][[nom:hotel]] / [[det:hotel:le:court]][[court:hotel]] / [[Det:hotel:de:pl:Court]][[Court:hotel:pl]]'), "l'hôtel / le site / De Sites");
  assert.deepEqual(balisesInvalides('[[det:labo:le]] [[Det:labo:ce:pl]] [[det:labo:du:Court]] [[det:labo:nouveau:3:court]]'), []);
  assert.deepEqual(
    balisesInvalides('[[det:labo]] [[det:labo:quel]] [[det:labo:pl]] [[det:labo:le:le]] [[det:labo:le:pl:pl]] [[det:labo:le:Nom:Titre]] [[det:labo:constructor]]').map((b) => b.balise),
    ['[[det:labo]]', '[[det:labo:quel]]', '[[det:labo:pl]]', '[[det:labo:le:le]]', '[[det:labo:le:pl:pl]]', '[[det:labo:le:Nom:Titre]]', '[[det:labo:constructor]]'],
  );
});

test('nomOnglet : les noms d\'onglets actuels sortent inchangés ; un terme d\'un autre domaine ne fait jamais échouer l\'export', () => {
  // Noms d'onglets des exports Excel du front aujourd'hui (ClientDashboard, CommandesAcheteursPage).
  for (const nom of ["Vue d'ensemble", 'Ventes & marges', 'Achats & stock', 'Pertes', 'Labo', 'Acheteurs (B2B)', 'Ventes Acheteurs']) {
    assert.equal(nomOnglet(nom), nom);
  }
  // Construits avec le vocabulaire : identiques par défaut, sûrs ailleurs.
  assert.equal(nomOnglet(`${vocabDefaut.Pl('vente')} ${vocabDefaut.Court('acheteur', true)}`), 'Ventes Acheteurs');
  assert.equal(nomOnglet(`${VOCS.hotellerie.Pl('vente')} ${VOCS.hotellerie.Court('acheteur', true)}`), 'Ventes Clients professionnels');
  // Caractères refusés par Excel : * ? : \ / [ ] ; apostrophe en tête ou en fin ; 31 caractères au plus.
  assert.equal(nomOnglet('Casse / Rebut / Second choix'), 'Casse Rebut Second choix');
  assert.equal(nomOnglet('a*b?c:d\\e/f[g]h'), 'a b c d e f g h');
  assert.equal(nomOnglet("'Atelier'"), 'Atelier');
  assert.equal(nomOnglet("L'atelier d'émaillage"), "L'atelier d'émaillage");
  const long = nomOnglet('Historique des approvisionnements des sites de production');
  assert.equal(long, 'Historique des approvisionnemen');
  assert.equal(long.length, 31);
  assert.equal(nomOnglet("Stock des matières premières  '"), 'Stock des matières premières');
  // Jamais vide, jamais le nom réservé, jamais d'exception.
  for (const vide of ['', '   ', '///', "'", null, undefined, 'History', 'history']) assert.equal(nomOnglet(vide), 'Feuille', String(vide));
  for (const nom of ['Casse / Rebut', "'x'", 'a'.repeat(80), '[[nom:labo]]', 42]) {
    const r = nomOnglet(nom);
    assert.ok(r.length >= 1 && r.length <= 31 && !/[*?:\\/[\]]/.test(r) && !/^'|'$/.test(r), String(nom));
  }
});

// ── 5. Balises ───────────────────────────────────────────────────────────────
test('rendre : une seule passe, balises invalides laissées et signalées', () => {
  // une forme du lexique qui contient une balise n'est pas re-rendue
  const piege = creerVocab({ labo: { sg: '[[nom:vente]]' }, vente: { sg: 'Vente' } });
  assert.equal(rendre(piege, 'x [[Nom:labo]] y'), 'x [[nom:vente]] y');
  // signalement
  const signalees = [];
  const sortie = rendre(vocabDefaut, '[[nom:labo]] [[bidule:labo]] [[oups]] [[le:labo:xx]]', (b, raison) => signalees.push([b, raison]));
  assert.equal(sortie, 'labo [[bidule:labo]] [[oups]] [[le:labo:xx]]');
  assert.deepEqual(signalees.map((s) => s[0]), ['[[bidule:labo]]', '[[oups]]', '[[le:labo:xx]]']);
  avertissements.length = 0;
  rendre(vocabDefaut, '[[bidule:labo]]');
  assert.equal(avertissements.length, 1, 'signalement par défaut : console.warn');
  assert.deepEqual(balisesInvalides('[[nom:labo]] [[Le:activite:pl:Titre]] [[acc:labo:a:b:3]]'), []);
  // « tous » sans déterminant : mot-clé « nu » (un argument vide n'entre pas dans la grammaire des balises)
  assert.equal(rendre(vocabDefaut, '[[Tous:prestataire:nu]]'), vocabDefaut.Tous('prestataire', ''));
  assert.equal(rendre(vocabDefaut, '[[tous:activite:nu:Nom]]'), 'toutes Activités');
  assert.deepEqual(balisesInvalides('[[Tous:labo:nu]] [[tous:labo:Nom:nu]]'), []);
  assert.deepEqual(balisesInvalides('[[Tous:labo:]] [[Tous:labo:nu:les]] [[le:labo:nu]]').map((b) => b.balise), ['[[Tous:labo:]]', '[[Tous:labo:nu:les]]', '[[le:labo:nu]]']);
  assert.deepEqual(balisesInvalides('[[nom:labo]] [[constructor:labo]] [[toString:labo]]').map((b) => b.balise), ['[[constructor:labo]]', '[[toString:labo]]']);
  // valeurs non textuelles : inchangées
  assert.equal(rendre(vocabDefaut, null), null);
  assert.equal(rendre(vocabDefaut, 12), 12);
  // une interpolation i18next n'est pas une balise
  assert.equal(rendre(vocabDefaut, 'Stock de {{nom}} : {{n}}'), 'Stock de {{nom}} : {{n}}');
});

test('rendreTout : arbre de chaînes (objets, tableaux), sans modifier la source', () => {
  const source = { a: '[[Nom:labo]]', b: { c: ['[[le:activite]]', 3, null, { d: 'x [[pl:labo]]' }] }, e: true };
  const copie = JSON.parse(JSON.stringify(source));
  assert.deepEqual(rendreTout(source, vocabDefaut), { a: 'Labo', b: { c: ["l'activité", 3, null, { d: 'x labos' }] }, e: true });
  assert.deepEqual(source, copie);
  assert.deepEqual(rendreTout(source, VOCS.hotellerie).b.c[0], 'le service');
});

test('libelleCategoriePt : identité par défaut, traduction à l\'affichage, valeur inconnue inchangée', () => {
  assert.deepEqual([...CATEGORIES_PT_CONNUES], [
    'Produits Transformés Utilisables', 'Produits Composés Valorisés', 'Produits Transformés Vendables',
    'Produits Utilisables', 'Produits Composés',
  ]);
  for (const valeur of CATEGORIES_PT_CONNUES) assert.equal(libelleCategoriePt(vocabDefaut, valeur), valeur);
  assert.equal(libelleCategoriePt(VOCS.hotellerie, 'Produits Transformés Utilisables'), 'Consommables');
  assert.equal(libelleCategoriePt(VOCS.hotellerie, 'Produits Transformés Vendables'), 'Prestations Vendues');
  assert.equal(libelleCategoriePt(VOCS.ceramique, 'Produits Composés Valorisés'), 'Produits Finis Catalogue');
  assert.equal(libelleCategoriePt(VOCS.ceramique, 'Produits Utilisables'), 'Semi-finis');
  assert.equal(libelleCategoriePt(VOCS.hotellerie, 'Produits Composés'), 'Produits Composés');
  for (const autre of ['Épicerie', 'Sans catégorie', '', 'toString', 'constructor']) {
    assert.equal(libelleCategoriePt(VOCS.hotellerie, autre), autre);
  }
});

// ── 6. fr.json ───────────────────────────────────────────────────────────────
const aplatir = (arbre, prefixe = '', out = {}) => {
  for (const [k, v] of Object.entries(arbre)) {
    const cle = prefixe ? `${prefixe}.${k}` : k;
    if (v && typeof v === 'object') aplatir(v, cle, out);
    else out[cle] = v;
  }
  return out;
};

const fichiersSource = (dossier, out = []) => {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) fichiersSource(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};

// Appels t('clé' …) littéraux dans un source ; avec la valeur par défaut littérale s'il y en a une.
const APPEL_T = /(?<![\w.$])t\(\s*(['"])([A-Za-z0-9_.-]+)\1\s*(?:,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3)?/g;
const appelsT = (source) => [...source.matchAll(APPEL_T)].map((m) => ({
  cle: m[2],
  defaut: m[4] === undefined ? undefined : m[4].replace(/\\(.)/g, '$1'),
}));

const FR = lireJson('src/i18n/locales/fr.json');
const FR_PLAT = aplatir(FR);
// Écarts ADMIS entre la valeur d'origine et la valeur rendue par défaut : clé → [origine, rendu par défaut].
// Chacun a son entrée dans scripts/vocab-allow (type et justification).
// Aucun : l'exemple « Restaurant A » de client.entreprise.activity_nom est rendu tel quel par défaut
// (balise [[ex:activite:Restaurant A]]), et devient « Service A » en Hôtellerie.
const ECARTS_ADMIS_FR = {};
const CLES_AJOUTEES = [
  'nav.stock_activite',
  'client.entreprise.labo',
  'client.entreprise.irreversible',
  'client.entreprise.confirm_delete_title',
  'client.entreprise.delete_activity_warning',
];

test('fr.json : en.json supprimé, chaque clé conservée est appelée par un t(\'clé\') littéral, aucune clé appelée ne manque', () => {
  assert.equal(fs.existsSync(path.join(RACINE, 'src/i18n/locales/en.json')), false, 'en.json supprimé');
  const vivantes = new Set();
  for (const f of fichiersSource(path.join(RACINE, 'src'))) {
    for (const a of appelsT(fs.readFileSync(f, 'utf8'))) vivantes.add(a.cle);
  }
  const mortes = Object.keys(FR_PLAT).filter((k) => !vivantes.has(k));
  assert.deepEqual(mortes, [], `clés mortes restantes : ${mortes.join(', ')}`);
  const absentes = [...vivantes].filter((k) => !(k in FR_PLAT));
  assert.deepEqual(absentes, [], `clés appelées absentes de fr.json : ${absentes.join(', ')}`);
  for (const v of Object.values(FR_PLAT)) assert.equal(typeof v, 'string');
});

test(`fr.json : PREUVE — rendre(vocabDefaut, valeur balisée) === valeur d'origine (git show ${BASE})`, () => {
  const origine = aplatir(JSON.parse(gitShow('src/i18n/locales/fr.json')));
  const clesOrigine = Object.keys(origine);
  assert.equal(clesOrigine.length, 346, 'fr.json d\'origine : 346 clés');

  // Clés vivantes à la référence = appelées par un t('clé') littéral dans les sources de la référence.
  const liste = execFileSync('git', ['-C', RACINE, 'ls-tree', '-r', '--name-only', BASE, 'src'], { encoding: 'utf8' })
    .split('\n').filter((f) => /\.(ts|tsx)$/.test(f));
  const appelees = new Map();
  for (const f of liste) for (const a of appelsT(gitShow(f))) {
    if (!appelees.has(a.cle)) appelees.set(a.cle, new Set());
    if (a.defaut !== undefined) appelees.get(a.cle).add(a.defaut);
  }
  const vivantes = clesOrigine.filter((k) => appelees.has(k));
  const mortes = clesOrigine.filter((k) => !appelees.has(k));
  assert.equal(vivantes.length, 105, 'clés vivantes');
  assert.equal(mortes.length, 241, 'clés mortes purgées');

  // Les 5 clés appelées avec une valeur par défaut et absentes de fr.json : origine = ce 2e argument.
  const ajoutees = [...appelees.keys()].filter((k) => !(k in origine));
  assert.deepEqual([...ajoutees].sort(), [...CLES_AJOUTEES].sort());
  const attendu = {};
  for (const k of vivantes) attendu[k] = origine[k];
  for (const k of ajoutees) {
    const defauts = [...appelees.get(k)];
    assert.equal(defauts.length, 1, `${k} : une seule valeur par défaut dans le code`);
    attendu[k] = defauts[0];
  }

  // fr.json courant = exactement ces clés ; chaque valeur balisée rend la valeur d'origine.
  assert.deepEqual(Object.keys(FR_PLAT).sort(), Object.keys(attendu).sort());
  const invalides = [];
  const rendu = aplatir(rendreTout(FR, vocabDefaut, (balise) => invalides.push(balise)));
  assert.deepEqual(invalides, [], 'aucune balise invalide dans fr.json');
  for (const [k, [avant, apres]] of Object.entries(ECARTS_ADMIS_FR)) {
    assert.equal(attendu[k], avant, `${k} : la valeur d'origine de l'écart admis`);
    attendu[k] = apres;
  }
  const ecarts = Object.keys(attendu).filter((k) => rendu[k] !== attendu[k])
    .map((k) => `${k} : ${JSON.stringify(rendu[k])} ≠ ${JSON.stringify(attendu[k])}`);
  assert.deepEqual(ecarts, []);
  assert.equal(Object.keys(attendu).length, 110);

  // L'ordre des clés d'origine est conservé (diff lisible).
  const ordre = Object.keys(FR_PLAT).filter((k) => k in origine);
  assert.deepEqual(ordre, vivantes);
});

// Formes du lexique par défaut (sg, pl, forme courte) laissées EN DUR dans une valeur de fr.json,
// hors balises : liste fermée et justifiée (clé → raison). Toute autre forme en dur fait échouer le test.
// (« Vendable » / « Utilisable » isolés — client.products.type_* — ne sont pas des formes du lexique.)
const EN_DUR_ADMIS = {};

test('fr.json : aucune forme du lexique par défaut en dur hors balises', () => {
  const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Un sigle (« PT », « PU », « FT ») se cherche en respectant la casse : « pu » est aussi un participe passé.
  const estSigle = (f) => /^[\p{Lu}\d]{2,4}$/u.test(f);
  const formes = new Set();
  const sigles = new Set();
  for (const k of LEXIQUE_CLES) {
    const e = LEXIQUE_DEFAUT[k];
    for (const f of [e.sg, e.pl, e.court?.sg, e.court?.pl]) {
      if (!f) continue;
      if (estSigle(f)) sigles.add(f); else formes.add(f.toLowerCase());
    }
  }
  assert.deepEqual([...sigles].sort(), ['FT', 'PT', 'PU']);
  const alternance = (liste) => [...liste].sort((a, b) => b.length - a.length).map(echapper).join('|');
  const motifMots = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternance(formes)})(?![\\p{L}\\p{N}])`, 'iu');
  const motifSigles = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternance(sigles)})(?![\\p{L}\\p{N}])`, 'u');
  const motif = { exec: (texte) => motifMots.exec(texte) ?? motifSigles.exec(texte) };
  const enDur = [];
  let balisees = 0;
  for (const [k, v] of Object.entries(FR_PLAT)) {
    if (v.includes('[[')) balisees += 1;
    const horsBalises = v.replace(/\[\[[^[\]\n]*\]\]/g, ' ⟦⟧ ');
    const m = motif.exec(horsBalises);
    if (m && !(k in EN_DUR_ADMIS)) enDur.push(`${k} : « ${m[0]} » dans ${JSON.stringify(v)}`);
  }
  assert.deepEqual(enDur, []);
  assert.ok(balisees >= 40, `${balisees} valeurs balisées`);
  for (const k of Object.keys(EN_DUR_ADMIS)) assert.ok(k in FR_PLAT, `${k} : exception sans objet`);
});

test('fr.json : rendu Hôtellerie et miroir sans forme par défaut des termes surchargés', () => {
  const h = aplatir(rendreTout(FR, VOCS.hotellerie));
  assert.equal(h['client.labo.stock_title'], 'Stock Cuisine');
  assert.equal(h['client.entreprise.add_activity'], 'Ajouter un service');
  assert.equal(h['client.entreprise.activity_created'], 'Service créé.');
  // Corrections après revues : une ligne de stock est l'ARTICLE du compte (« Fourniture »), pas le composant
  // d'une recette (« Composant ») — clé article_ingredient.
  assert.equal(h['client.labo.empty_stock'], 'Aucune fourniture sélectionnée pour cette cuisine centrale.');
  assert.equal(h['client.stock.search_ingredient'], 'Rechercher une fourniture...');
  assert.equal(h['client.historique_appro.all_ingredients'], 'Toutes les fournitures');
  assert.equal(h['client.stock.ingredient'], 'Fourniture');
  assert.equal(h['client.entreprise.manage_ingredients'], 'Fournitures');
  assert.equal(h['nav.activites'], 'Mes services');
  assert.equal(h['client.entreprise.activity_nom'], 'Nom du service (ex: Service A)', 'exemple construit avec le terme du domaine');
  // Un exemple propre à la restauration ne vit que dans une balise [[ex:…]] : rendu par défaut seulement.
  assert.equal(FR_PLAT['client.entreprise.activity_nom'], 'Nom [[du:activite]] (ex: [[ex:activite:Restaurant A]])');
  assert.equal(aplatir(rendreTout(FR, vocabDefaut))['client.entreprise.activity_nom'], "Nom de l'activité (ex: Restaurant A)");
  const horsBalisesEx = Object.values(FR_PLAT).join('\n').replace(/\[\[ex:[^[\]\n]*\]\]/g, '');
  assert.doesNotMatch(horsBalisesEx, /restaurant|burger|pizza/i, 'aucun exemple propre à la restauration dans fr.json hors balise [[ex:…]]');
  assert.doesNotMatch(Object.values(h).join('\n'), /restaurant|burger|pizza/i, 'aucun exemple propre à la restauration dans le rendu Hôtellerie');
  for (const [k, v] of Object.entries(h)) {
    assert.doesNotMatch(v, /\[\[|\]\]/, `${k} : balise non rendue`);
    assert.doesNotMatch(v, /(?<![\p{L}])(activités?|labos?|ingrédients?|articles?)(?![\p{L}])/iu, `${k} : « ${v} »`);
  }
  const m = aplatir(rendreTout(FR, VOCS.miroir));
  assert.equal(m['client.entreprise.activity_created'], 'Local créé.');
  assert.equal(m['client.stock.empty_stock'], 'Aucune provision sélectionnée.');
  assert.equal(m['client.products.add_vendable'], 'Nouvelle invention vendue');
});

test("fr.json : la clé « ingredient » (composant d'une recette) ne sert qu'aux écrans de produits ; le stock emploie article_ingredient", () => {
  // Écrans de stock, d'historique d'appro et de sélection des articles d'une unité : l'objet est l'ARTICLE du compte.
  // Avec la clé « ingredient », un compte Hôtellerie lisait « Rechercher un composant... » à côté du filtre « Fourniture ».
  const RECETTE = /^client\.(?:products|fiche_technique)\./;
  const fautives = Object.entries(FR_PLAT)
    .filter(([k, v]) => /\[\[[A-Za-z]+:ingredient[:\]]/.test(v) && !RECETTE.test(k))
    .map(([k]) => k);
  assert.deepEqual(fautives, []);
  const stock = ['client.entreprise.manage_ingredients', 'client.stock.ingredient', 'client.stock.empty_stock',
    'client.stock.search_ingredient', 'client.historique_appro.all_ingredients', 'client.labo.empty_stock'];
  for (const k of stock) assert.match(FR_PLAT[k], /:article_ingredient[:\]]/, k);
  // la clé « ingredient » reste employée là où l'objet est le composant d'une recette
  assert.ok(Object.keys(FR_PLAT).some((k) => RECETTE.test(k) && /:ingredient[:\]]/.test(FR_PLAT[k])));
});
