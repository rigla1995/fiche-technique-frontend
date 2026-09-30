#!/usr/bin/env node
// Outil de preuve du vocabulaire (lot 2, spec §2.5) — `node scripts/vocab-check.mjs <mode> …`
//
// Prouve, par analyse statique (API du compilateur TypeScript, sans programme de types), que le
// remplacement des mots de la restauration par des appels `voc.…` ne change RIEN pour un compte
// restauration (invariant I1) et qu'aucun accord n'est resté écrit en dur (invariant I3).
//
// Modes :
//   identite    chaque fichier modifié depuis BASE : le multi-ensemble de ses textes, rendus avec le
//               lexique par défaut, est identique à celui de la référence (git show BASE:fichier).
//   residuels   tout littéral qui porte encore une forme par défaut d'un terme, hors contextes techniques ;
//               et tout exemple de saisie (placeholder « Ex… ») resté écrit en dur.
//   accords     (1) tout appel voc précédé d'un mot de la liste fermée (le, la, l', un, aucun, ce, premier…),
//               suivi d'un participe ou d'un adjectif de la liste fermée (créé, lié, insuffisant…), ou repris
//               par un pronom (elle, ils, lequel…) ;
//               (2) écrit scripts/vocab-accords.txt : chaque unité à appel voc, rendue avec le lexique miroir.
//   inventaire  JSON par fichier (texte, ligne, termes, clés voc) sur la sortie standard.
//   lexique     backend généré à jour, vecteurs identiques, empreinte de gel du moteur et du lexique.
//
// Exemples de saisie — `voc.ex(parDefaut, sinon)` (spec §3 règle 6) : `parDefaut` est le texte LITTÉRAL de la
// référence, `sinon` l'exemple neutre construit pour les autres domaines.
//   identite    voc.ex(a, b) vaut `a` (le lexique par défaut rend l'exemple d'origine) : `a` modifié = écart ;
//   residuels   `a` est exempté (exemple de restauration assumé) ; `b` est jugé comme n'importe quel texte, et
//               l'unité est affichée et admise par son texte NEUTRE (« Ex: Catégorie A ») ;
//   accords     `b` est analysé comme n'importe quel texte ; la ligne « miroir » rend `b`.
// Dans fr.json et les messages du serveur, la balise [[ex:clé:texte par défaut]] suit les mêmes règles.
//
// Options : --root <dépôt> (défaut : ce dépôt ; le backend s'analyse avec --root), --ensemble (compare
// l'union des fichiers donnés : chaînes déplacées), --base <ref>, --sans-allow, --proposer-allow, --json,
// --geler / --fichier-gel <f> / --back <dossier> (mode lexique). Arguments restants : fichiers à contrôler
// (chemins relatifs au dépôt analysé) ; sans fichier, le périmètre par défaut.
//
// Code de sortie : 0 = conforme ; 1 = écart, résiduel, signalement ou erreur ; 2 = usage ou configuration.
// Node ≥ 23.6 (le moteur `src/vocab/*.ts` est importé tel quel) : outil de poste de travail, pas de CI.
// Tests : `node --test scripts/vocab-check.test.mjs`. Écarts admis : scripts/vocab-allow/README.md.
// Une entrée `"fichier": "*"` (scripts/vocab-allow/_global.json) vaut pour tous les fichiers, en mode residuels
// seulement : locutions, noms de formule et homonymes communs à tous les lots. Guide du balayage : scripts/VOCAB-GUIDE.md.
//
// Règles de canonisation (liste fermée, spec §2.5) : R1 blancs JSX · R2 trous · R3 suffixe de pluriel ·
// R4 règle du test dans le jeton · R5 pluriel mot à mot · R6 conditions factorisées · R7 éléments enfants ·
// R8 balises [[…]] · R9 vrai moteur · R10 variable intermédiaire · R11 multi-ensembles · R12 exclusions ·
// apostrophe ’ → '. Chaque règle est repérée dans le code par son numéro.
//
// Notation canonique : ⟦·⟧ trou · ⟦<strong>⟧ élément enfant · ⟦labo|labos@>1⟧ pluriel si n > 1 ·
// ⟦labo|labos@≠1⟧ pluriel si n ≠ 1 · ⟦?A|B⟧ condition · ⟦t:clé⟧ clé i18n absente de fr.json · ⟦ERREUR:…⟧.
//
// Ce que l'outil NE voit PAS (à couvrir par la relecture du diff, de l'inventaire et de vocab-accords.txt) :
//   - l'expression d'un trou ou d'un test : `${a}` et `${b}` sont le même trou, `n > 1` et `m > 1` le même test
//     (et `n > 1` = `n >= 2` : faux pour une quantité entre 1 et 2, à réécrire `voc.nom(k, x > 1)`) ;
//   - deux libellés échangés à l'intérieur d'un même fichier (multi-ensemble), un texte passé d'un attribut à
//     un autre, ou une clé fausse dont la forme par défaut est la même — sauf `Nom` au lieu de `Court`, que la
//     ligne « miroir » distingue (chaque terme du miroir a une forme courte « Abr-… ») ;
//   - un accord écrit en dur APRÈS le terme avec un mot hors de la liste fermée ACCORDS_APRES, ou loin du
//     terme : il se lit dans la ligne « miroir » ;
//   - un déterminant en dur devant un libellé venu d'une TABLE (`Aucun {tab.label}`) : le libellé est un trou ;
//   - avec --ensemble, deux libellés échangés ENTRE deux fichiers de l'ensemble ;
//   - les textes venus de l'API.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { LEXIQUE_DEFAUT } from '../src/vocab/lexiqueDefaut.ts';
import { creerVocab, vocabDefaut, resoudreLexique } from '../src/vocab/vocab.ts';
import { rendre } from '../src/vocab/rendre.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const DEPOT_FRONT = path.resolve(ICI, '..');
const SK = ts.SyntaxKind;

/** Erreur d'usage ou de configuration (code de sortie 2). */
class Usage extends Error {}

// ═════════════════════════════════════════════════════════════════════════════
// Constantes de la spec
// ═════════════════════════════════════════════════════════════════════════════

export const TROU = '⟦·⟧';

/** Mots dont la forme dépend du genre, du nombre ou de l'élision du nom qui suit (mode accords). */
export const MOTS_ACCORD = [
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'ce', 'cet', 'cette', 'ces',
  'aucun', 'aucune', 'votre', 'vos', 'mon', 'ma', 'mes', 'son', 'sa', 'ses',
  'nouveau', 'nouvel', 'nouvelle', 'nouveaux', 'nouvelles', 'tous', 'toutes', 'tout', 'toute',
  'quel', 'quelle', 'quels', 'quelles', 'seul', 'seule', 'seuls', 'seules',
  'premier', 'première', 'premiers', 'premières', 'dernier', 'dernière', 'derniers', 'dernières',
  'meilleur', 'meilleure', 'meilleurs', 'meilleures', 'prochain', 'prochaine', 'prochains', 'prochaines',
  'certain', 'certaine', 'certains', 'certaines', 'chacun', 'chacune',
];
const MOTS_ELIDES = ['l', 'd'];
// Adjectifs invariables en genre admis ENTRE le mot de la liste et l'appel : « aucun autre {voc.nom(k)} »,
// « la même {voc.nom(k)} ».
const MOTS_ENTRE = ['autre', 'autres', 'même', 'mêmes'];

/**
 * Participes et adjectifs variables en genre, relevés UNE fois dans l'inventaire du front (113 unités où un
 * terme est suivi d'un mot accordé) : « masculin|féminin ». Écrits en dur juste APRÈS un appel voc nominal
 * (« {voc.Nom('activite')} créée »), ils sont signalés par le mode accords : l'accord passe par voc.acc.
 * Liste fermée : un adjectif épicène (disponible, introuvable, vendable…) n'y figure pas.
 */
export const ACCORDS_APRES = [
  // participes en -é relevés dans l'inventaire
  'créé|créée', 'lié|liée', 'trouvé|trouvée', 'enregistré|enregistrée', 'importé|importée', 'supprimé|supprimée',
  'configuré|configurée', 'assigné|assignée', 'rattaché|rattachée', 'fabriqué|fabriquée', 'proposé|proposée',
  'affecté|affectée', 'affiché|affichée', 'alimenté|alimentée', 'coché|cochée', 'inventorié|inventoriée',
  'sélectionné|sélectionnée', 'limité|limitée', 'consommé|consommée', 'transformé|transformée', 'modifié|modifiée',
  'utilisé|utilisée', 'concerné|concernée', 'catégorisé|catégorisée', 'ajouté|ajoutée', 'composé|composée',
  'valorisé|valorisée', 'personnalisé|personnalisée',
  // même famille, fréquents dans les messages de l'application
  'activé|activée', 'désactivé|désactivée', 'validé|validée', 'annulé|annulée', 'livré|livrée', 'expédié|expédiée',
  'transféré|transférée', 'archivé|archivée', 'associé|associée', 'renseigné|renseignée', 'facturé|facturée',
  'commandé|commandée', 'dupliqué|dupliquée', 'exporté|exportée', 'généré|générée', 'calculé|calculée',
  // autres participes
  'émis|émise', 'déduit|déduite', 'reçu|reçue', 'servi|servie', 'choisi|choisie', 'défini|définie', 'inclus|incluse',
  'vendu|vendue', 'requis|requise', 'perdu|perdue', 'saisi|saisie', 'mis|mise', 'pris|prise',
  // adjectifs variables en genre
  'insuffisant|insuffisante', 'manuel|manuelle', 'actuel|actuelle', 'net|nette', 'brut|brute', 'central|centrale',
  'actif|active', 'inactif|inactive', 'gratuit|gratuite', 'existant|existante', 'direct|directe',
  'précédent|précédente', 'suivant|suivante', 'laitier|laitière', 'vendeur|vendeuse', 'principal|principale',
  'complet|complète', 'prêt|prête', 'manquant|manquante', 'restant|restante', 'présent|présente', 'absent|absente',
  'seul|seule', 'nouveau|nouvelle', 'premier|première', 'dernier|dernière', 'ouvert|ouverte', 'fermé|fermée',
];
// Pronoms qui reprennent un terme nommé plus tôt dans la même unité (« {voc.Le('activite')} … : elle sera … »).
// « il » impersonnel (il faut, il y a, s'il vous plaît…) n'est pas un pronom de reprise.
const PRONOMS_REPRISE = ['elle', 'elles', 'ils', 'celui', 'celle', 'ceux', 'celles', 'lequel', 'laquelle', 'lesquels', 'lesquelles', 'auquel', 'duquel'];
const IL_IMPERSONNEL = /^(?:\s+(?:y\s|n['’]y\s|faut|fallait|faudra|s['’]agit|suffit|reste\s|existe|convient|manque|vaut|se\s+peut|vous\s+pla[iî]t|est\s+(?:possible|impossible|nécessaire|recommandé|conseillé|préférable|interdit|obligatoire|important|temps|encore\s+temps)))/iu;

export const TYPES_ALLOW = [
  'homonyme', 'formule', 'locution', 'verbe', 'exemple', 'discriminant',
  'deplacement', 'non-repliable', 'apostrophe', 'faute-corrigee', 'provisoire',
];
const MODES_ALLOW = ['identite', 'residuels', 'accords'];
const FICHIER_GLOBAL = '*'; // entrée allow valable pour tous les fichiers (mode residuels seulement)

// Position (dans la liste d'arguments) du nombre `n` de chaque méthode du moteur ; null = pas de nombre.
const SIGNATURES = {
  nom: 1, Nom: 1, Titre: 1, MAJ: 1, court: 1, Court: 1, compl: 1, avecCourt: 1, n: 1,
  pl: null, Pl: null, nomS: null, NomS: null, icon: null, g: null,
  le: 1, Le: 1, un: 1, Un: 1, du: 1, Du: 1, de: 1, De: 1, au: 1, Au: 1, ce: 1, Ce: 1,
  votre: 1, Votre: 1, mon: 1, Mon: 1, son: 1, Son: 1, nouveau: 1, Nouveau: 1,
  aucun: null, Aucun: null, tous: null, Tous: null,
  acc: 3,
  det: 2, Det: 2, // voc.det(k, 'du', n?) : le déterminant seul, suivi de son séparateur (étape S4)
  accN: 3, // voc.accN(['a', 'b'], masc, fem, n?) : accord avec plusieurs termes coordonnés (étape S5)
};
// voc.ex(parDefaut, sinon) n'a pas de clé : deux textes (l'exemple de la référence, l'exemple neutre). Lue à part (partieEx).
const METHODE_EXEMPLE = 'ex';
const CLE_EXEMPLE = 'ex:'; // marque de l'appel voc.ex dans la liste des clés voc d'une unité (inventaire, ligne miroir)
// Méthodes dont le 1er argument est une LISTE de clés littérales (au moins deux), et non une clé.
const CLES_MULTIPLES = new Set(['accN']);
// Méthodes qui rendent un déterminant SEUL (« du␣ », « l' ») : le texte qui suit n'est pas collé à un terme.
const DETERMINANT_SEUL = new Set(['det', 'Det']);
// Méthodes qui ne rendent PAS le terme lui-même (accord, déterminant seul, icône, genre) : ce qui les suit
// n'est pas « un mot juste après le terme ».
const NON_NOMINALES = new Set(['acc', 'accN', 'det', 'Det', 'icon', 'g']);
// Méthodes d'accord : elles prolongent le groupe du terme déjà nommé (le mot en dur qui les suit s'accorde encore).
const ACCORD_MOTEUR = new Set(['acc', 'accN']);

// Périmètre par défaut : `src`, hors espace admin et pages publiques (spec I4, §3 règle 8), hors moteur
// (src/vocab : c'est la référence de l'outil, prouvée par scripts/vocab.test.mjs) et hors copies générées.
const HORS_VOCABULAIRE = ['src/components/admin/', 'src/components/auth/'];
const EXCLUS_DEFAUT = [...HORS_VOCABULAIRE, 'src/vocab/', 'src/config/lexiqueDefaut.js', 'src/utils/vocab.js'];
const FR_JSON = 'src/i18n/locales/fr.json';
const EXTENSIONS = /\.(?:tsx?|jsx?|mjs|cjs)$/;

// Contextes techniques du mode residuels (spec §2.5).
const APPELES_TECHNIQUES = [
  /^api\./, /^navigate$/, /\.(?:has|includes|add|delete|query)$/, /(?:^|\.)(?:add|remove)EventListener$/,
  /^new (?:Custom)?Event$/, /^require$/, /^router\./, /^app\.use$/,
];
const ATTRIBUTS_TECHNIQUES = new Set([
  'to', 'path', 'className', 'key', 'id', 'name', 'type', 'value', 'section', 'theme', 'href', 'src',
  'htmlFor', 'role', 'style', 'dataKey', 'labelKey',
]);
const PROPRIETES_TECHNIQUES = new Set(['key', 'type', 'value', 'id', 'mode', 'origine', 'type_vente', 'field', 'path']);
// Contextes où le littéral est TANTÔT une valeur technique, TANTÔT un texte affiché (`<Line name="Marge brute">`,
// `<input value="— Aucun fournisseur —" disabled>`, `h === 'Article'`, `{ type: 'Transfert labo' }`) : il n'est
// exclu du mode residuels que s'il a la FORME d'un identifiant (minuscules, chiffres, _ - . /).
const IDENTIFIANT = /^[a-z0-9_\-./]*$/;
const ATTRIBUTS_A_IDENTIFIANT = new Set(['name', 'value']);
const PROPRIETES_A_IDENTIFIANT = new Set(['value', 'type', 'mode']);
const APPELES_A_IDENTIFIANT = /\.(?:has|includes|add|delete)$/;
// Exemple de saisie resté écrit en dur (spec §3 règle 6) : « Ex. Burger, Pizza… », « Ex: Poulet entier ».
const EXEMPLE = /^\s*(?:ex\s*[.:]|exemple\b)/iu;
const TERME_EXEMPLE = 'exemple'; // pseudo-terme du mode residuels (ce n'est pas une clé du lexique)
const SQL = /^[\s(,]*(?:SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|AND|OR|WHERE|FROM|JOIN|LEFT|RIGHT|INNER|OUTER|ORDER|GROUP|HAVING|LIMIT|OFFSET|SET|VALUES|CASE|WHEN|COALESCE|UNION|ON|RETURNING|EXISTS|NOT|IN)\b/;

// ═════════════════════════════════════════════════════════════════════════════
// Termes : formes par défaut du lexique (mode residuels, inventaire)
// ═════════════════════════════════════════════════════════════════════════════

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SIGLE = /^[\p{Lu}\d]{2,4}$/u;
const motEntier = (formes, drapeaux) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${formes.sort((a, b) => b.length - a.length).map(echapper).join('|')})(?![\\p{L}\\p{N}_])`, drapeaux);

// Une clé → ses formes (sg, pl, forme courte). Un sigle (« PT », « FT ») se cherche en respectant la casse.
const TERMES = Object.entries(LEXIQUE_DEFAUT).map(([cle, e]) => {
  const formes = [...new Set([e.sg, e.pl, e.court?.sg, e.court?.pl].filter(Boolean))];
  const sigles = formes.filter((f) => SIGLE.test(f));
  const mots = formes.filter((f) => !SIGLE.test(f));
  return { cle, formes, res: [mots.length && motEntier(mots, 'giu'), sigles.length && motEntier(sigles, 'gu')].filter(Boolean) };
});

/** Clés du lexique dont une forme par défaut apparaît (mot entier) dans `texte`. */
export function termesDans(texte) {
  return TERMES.filter((t) => t.res.some((re) => { re.lastIndex = 0; return re.test(texte); })).map((t) => t.cle);
}
const sansTermes = (texte) => TERMES.reduce((s, t) => t.res.reduce((x, re) => x.replace(re, ' '), s), texte);

// ═════════════════════════════════════════════════════════════════════════════
// R1 — blancs et entités JSX (règle exacte du compilateur, testée contre ts.transpileModule)
// ═════════════════════════════════════════════════════════════════════════════

const SAUT = new Set(['\n', '\r', ' ', ' ']);
const estBlanc = (c) => c === ' ' || c === '\t' || c === '\v' || c === '\f' || c === ' ' || c === '\u0085'
  || c === ' ' || (c >= ' ' && c <= '​') || c === ' ' || c === ' ' || c === '　' || c === '﻿';

// Entités : résolues par le compilateur lui-même (une fois par entité), jamais par une table recopiée.
const cacheEntites = new Map();
function entite(ecrite) {
  if (!cacheEntites.has(ecrite)) {
    const js = ts.transpileModule(`x = <a>${ecrite}</a>;`, {
      compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ESNext },
    }).outputText;
    const sf = ts.createSourceFile('e.js', js, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
    let valeur = ecrite;
    (function cherche(n) {
      if (ts.isCallExpression(n) && n.arguments.length === 3 && ts.isStringLiteral(n.arguments[2])) valeur = n.arguments[2].text;
      else ts.forEachChild(n, cherche);
    })(sf);
    cacheEntites.set(ecrite, valeur);
  }
  return cacheEntites.get(ecrite);
}
export const decoderEntites = (s) => (s.includes('&') ? s.replace(/&(?:#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, entite) : s);

/** Texte d'un nœud JsxText tel que React le reçoit (R1). */
export function texteJsx(brut) {
  let acc;
  let premier = 0; // premier caractère non blanc de la ligne (0 sur la 1re ligne : ses blancs de tête comptent)
  let dernier = -1; // dernier caractère non blanc (-1 : la 1re ligne n'est gardée que si elle porte du texte)
  const ajouter = (ligne) => { const d = decoderEntites(ligne); acc = acc === undefined ? d : `${acc} ${d}`; };
  for (let i = 0; i < brut.length; i += 1) {
    const c = brut[i];
    if (SAUT.has(c)) {
      if (premier !== -1 && dernier !== -1) ajouter(brut.substring(premier, dernier + 1));
      premier = -1;
    } else if (!estBlanc(c)) {
      dernier = i;
      if (premier === -1) premier = i;
    }
  }
  if (premier !== -1) ajouter(brut.substring(premier)); // dernière ligne : ses blancs de fin comptent
  return acc ?? '';
}

// ═════════════════════════════════════════════════════════════════════════════
// Lecture de l'arbre : pliage d'une expression en « parties »
// ═════════════════════════════════════════════════════════════════════════════
// Partie = texte JSX (string) | { lit } littéral (balises rendues, R8) | { h } trou (R2) | { tag, noeud }
// élément enfant (R7) | { c: [A, B], r? } condition (R6) ou pluriel conditionnel (r = règle du test, R4) |
// { voc } appel du moteur (R9) | { ex: { defaut, sinon } } exemple de saisie voc.ex(a, b) | { t } appel i18n |
// { err } construction refusée.

const estLit = (n) => !!n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));
const nu = (n) => {
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)
    || ts.isSatisfiesExpression(n) || ts.isTypeAssertionExpression(n))) n = n.expression;
  return n;
};
const estVoc = (n) => !!n && ((ts.isIdentifier(n) && n.text === 'voc') || (ts.isPropertyAccessExpression(n) && n.name.text === 'voc'));

// Appel `voc.méthode(…)`, `req.voc.méthode(…)` ou `voc.avec({…}).méthode(…)` → { methode, avec } ; sinon null.
function appelVoc(n) {
  if (!n || !ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return null;
  const recepteur = nu(n.expression.expression);
  const methode = n.expression.name.text;
  if (estVoc(recepteur)) return methode === 'avec' ? null : { methode, avec: null };
  if (ts.isCallExpression(recepteur) && ts.isPropertyAccessExpression(recepteur.expression)
    && recepteur.expression.name.text === 'avec' && estVoc(nu(recepteur.expression.expression))) {
    return { methode, avec: recepteur };
  }
  return null;
}
const estAppelT = (n, cx) => cx.options.t && ts.isCallExpression(n) && estLit(n.arguments[0])
  && ((ts.isIdentifier(n.expression) && n.expression.text === 't')
    || (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 't'
      && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'i18n'));
const estConsole = (n) => ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression)
  && n.expression.expression.text === 'console';
// `require('…')` est l'import du backend (CommonJS).
const estRequire = (n) => ts.isIdentifier(n.expression) && n.expression.text === 'require' && n.arguments.length === 1 && estLit(n.arguments[0]);

// Une expression « pliable » porte du texte : c'est le départ d'une unité.
function pliable(n, cx) {
  n = nu(n);
  if (!n) return false;
  if (estLit(n) || ts.isTemplateExpression(n)) return true;
  if (ts.isBinaryExpression(n)) {
    const k = n.operatorToken.kind;
    if (k === SK.PlusToken || k === SK.BarBarToken || k === SK.QuestionQuestionToken) return pliable(n.left, cx) || pliable(n.right, cx);
    if (k === SK.AmpersandAmpersandToken) return pliable(n.right, cx);
    return false;
  }
  if (ts.isConditionalExpression(n)) return pliable(n.whenTrue, cx) || pliable(n.whenFalse, cx);
  if (ts.isCallExpression(n)) return !!appelVoc(n) || estAppelT(n, cx);
  return false;
}

// Initialiseur de l'unique `const nom = …` du fichier (sert à lire la règle d'un test nommé) ; sinon null.
// Un nom déclaré plusieurs fois (autre variable, paramètre, déstructuration) n'est jamais suivi.
function initialiseurUnique(nom, cx) {
  const etat = cx.etat;
  if (!etat.declarations) {
    etat.declarations = new Map();
    (function marche(n) {
      if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name)) {
        const liste = etat.declarations.get(n.name.text) ?? [];
        liste.push(ts.isVariableDeclaration(n) ? n.initializer ?? null : null);
        etat.declarations.set(n.name.text, liste);
      }
      ts.forEachChild(n, marche);
    })(cx.sf);
  }
  const liste = etat.declarations.get(nom);
  return liste && liste.length === 1 ? liste[0] : null;
}

const MIROIR_OP = new Map([
  [SK.GreaterThanToken, SK.LessThanToken], [SK.LessThanToken, SK.GreaterThanToken],
  [SK.GreaterThanEqualsToken, SK.LessThanEqualsToken], [SK.LessThanEqualsToken, SK.GreaterThanEqualsToken],
]);

/**
 * R4 — règle d'un test de nombre : `> 1`, `>= 2` → '>1' ; `!== 1`, `!= 1` → '≠1' ; `=== 1`, `<= 1`, `< 2` :
 * mêmes règles, branches inversées. Tout autre test : null (condition ordinaire, R6).
 */
function testPluriel(e, cx, profondeur = 0) {
  e = nu(e);
  if (!e) return null;
  if (ts.isIdentifier(e)) {
    const init = profondeur < 2 ? initialiseurUnique(e.text, cx) : null;
    return init ? testPluriel(init, cx, profondeur + 1) : null;
  }
  if (!ts.isBinaryExpression(e)) return null;
  const nombre = (x) => { const y = nu(x); return y && ts.isNumericLiteral(y) ? Number(y.text) : null; };
  let op = e.operatorToken.kind;
  let v = nombre(e.right);
  if (v === null && nombre(e.left) !== null) { v = nombre(e.left); op = MIROIR_OP.get(op) ?? op; }
  if (v === null) return null;
  if (op === SK.GreaterThanToken && v === 1) return { regle: '>1', inverse: false };
  if (op === SK.GreaterThanEqualsToken && v === 2) return { regle: '>1', inverse: false };
  if (op === SK.LessThanEqualsToken && v === 1) return { regle: '>1', inverse: true };
  if (op === SK.LessThanToken && v === 2) return { regle: '>1', inverse: true };
  if ((op === SK.ExclamationEqualsEqualsToken || op === SK.ExclamationEqualsToken) && v === 1) return { regle: '≠1', inverse: false };
  if ((op === SK.EqualsEqualsEqualsToken || op === SK.EqualsEqualsToken) && v === 1) return { regle: '≠1', inverse: true };
  return null;
}

const COMPARAISONS = new Set([
  SK.GreaterThanToken, SK.GreaterThanEqualsToken, SK.LessThanToken, SK.LessThanEqualsToken,
  SK.EqualsEqualsToken, SK.EqualsEqualsEqualsToken, SK.ExclamationEqualsToken, SK.ExclamationEqualsEqualsToken,
]);
function estBooleen(e, cx, profondeur = 0) {
  e = nu(e);
  if (!e) return false;
  if (e.kind === SK.TrueKeyword || e.kind === SK.FalseKeyword) return true;
  if (ts.isPrefixUnaryExpression(e)) return e.operator === SK.ExclamationToken;
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (COMPARAISONS.has(k)) return true;
    if (k === SK.AmpersandAmpersandToken || k === SK.BarBarToken) return estBooleen(e.left, cx, profondeur) || estBooleen(e.right, cx, profondeur);
    return false;
  }
  if (ts.isIdentifier(e) && profondeur < 2) {
    const init = initialiseurUnique(e.text, cx);
    return init ? estBooleen(init, cx, profondeur + 1) : false;
  }
  return false;
}

// Valeur d'un argument littéral d'un appel voc (chaîne, nombre, booléen, undefined, null).
function valeurStatique(e) {
  e = nu(e);
  if (!e) return { ok: true, v: undefined };
  if (estLit(e)) return { ok: true, v: e.text };
  if (ts.isNumericLiteral(e)) return { ok: true, v: Number(e.text) };
  if (e.kind === SK.TrueKeyword) return { ok: true, v: true };
  if (e.kind === SK.FalseKeyword) return { ok: true, v: false };
  if (e.kind === SK.NullKeyword) return { ok: true, v: null };
  if (ts.isIdentifier(e) && e.text === 'undefined') return { ok: true, v: undefined };
  return { ok: false };
}

// Objet littéral { sg: 'x', el: true, … } → objet JS ; tout autre argument : null (libellé dynamique).
function objetLitteral(e) {
  e = nu(e);
  if (!e || !ts.isObjectLiteralExpression(e)) return null;
  const o = {};
  for (const p of e.properties) {
    if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || estLit(p.name))) return null;
    const v = valeurStatique(p.initializer);
    if (!v.ok) return null;
    o[p.name.text] = v.v;
  }
  return o;
}

const position = (n, cx) => {
  const p = cx.sf.getLineAndCharacterOfPosition(n.getStart(cx.sf));
  return { l: p.line + 1, col: p.character + 1 };
};
const erreurPartie = (n, cx, message) => ({ err: message, toujours: true, ...position(n, cx) });

// voc.ex(parDefaut, sinon) — exemple de saisie → partie { ex: { defaut, sinon } }.
//   defaut : le texte LITTÉRAL de la référence (rendu avec le lexique par défaut : le mode identite le compare,
//            le mode residuels l'exempte) ;
//   sinon  : l'exemple neutre, replié comme n'importe quel texte (appels voc rendus, accords, ligne miroir).
function partieEx(n, appel, cx) {
  if (appel.avec) return erreurPartie(n, cx, 'voc.ex : à appeler sur voc, pas sur voc.avec(…)');
  const defaut = nu(n.arguments[0]);
  if (n.arguments.length !== 2 || !estLit(defaut)) {
    return erreurPartie(n, cx, 'voc.ex : deux arguments attendus — le texte littéral de la référence, puis l\'exemple neutre');
  }
  if (!pliable(n.arguments[1], cx)) {
    return erreurPartie(n, cx, 'voc.ex : le 2e argument est un texte (littéral, ou gabarit à appels voc)');
  }
  return { ex: { defaut: litteral(defaut.text, cx), sinon: plier(n.arguments[1], cx), ...position(n, cx) } };
}

// R9 — appel du moteur → partie { voc } (ou condition de parties voc si la clé est `c ? 'a' : 'b'`, R6).
function partieVoc(n, cx) {
  const appel = appelVoc(n);
  if (!appel) return null;
  const { methode } = appel;
  if (methode === METHODE_EXEMPLE) return partieEx(n, appel, cx);
  if (!Object.hasOwn(SIGNATURES, methode)) return erreurPartie(n, cx, `méthode voc inconnue « ${methode} »`);
  let avec = null;
  if (appel.avec) {
    avec = objetLitteral(appel.avec.arguments[0]) ?? 'dynamique';
    if (avec === 'dynamique') appel.avec.arguments.forEach((a) => cx.restes.push(a));
  }
  const posN = SIGNATURES[methode];
  const args = [];
  let n_ = null;
  for (let i = 1; i < n.arguments.length; i += 1) {
    const a = n.arguments[i];
    const v = valeurStatique(a);
    if (v.ok) { args[i - 1] = v.v; continue; }
    if (i !== posN) return erreurPartie(n, cx, `voc.${methode} : argument n° ${i + 1} non littéral`);
    cx.restes.push(a);
    const test = testPluriel(a, cx);
    n_ = test ? { pos: i, ...test } : estBooleen(a, cx) ? { pos: i, generique: true } : { pos: i, regle: '>1', inverse: false };
  }
  if (CLES_MULTIPLES.has(methode)) {
    // Liste de clés littérales : la partie garde la liste (`cles`) et un nom lisible (`cle` : « activite+labo »).
    const liste = nu(n.arguments[0]);
    const elements = liste && ts.isArrayLiteralExpression(liste) ? liste.elements.map((e) => nu(e)) : null;
    if (!elements || elements.length < 2 || !elements.every((e) => estLit(e))) {
      return erreurPartie(n, cx, `voc.${methode} : le 1er argument est une liste d'au moins deux clés littérales`);
    }
    const cles = elements.map((e) => e.text);
    return { voc: { methode, cle: cles.join('+'), cles, args, n: n_, avec, ...position(n, cx) } };
  }
  const feuille = (cle) => ({ voc: { methode, cle, args, n: n_, avec, ...position(n, cx) } });
  const arbre = (e) => {
    e = nu(e);
    if (estLit(e)) return [feuille(e.text)];
    if (e && ts.isConditionalExpression(e)) {
      const a = arbre(e.whenTrue);
      const b = arbre(e.whenFalse);
      if (!a || !b) return null;
      cx.restes.push(e.condition);
      const r = testPluriel(e.condition, cx); // même lecture du test que pour une condition entre littéraux
      return [r ? { c: [a, b], r } : { c: [a, b] }];
    }
    return null;
  };
  const parties = arbre(n.arguments[0]);
  return parties ? parties[0] : erreurPartie(n, cx, `voc.${methode} : clé non littérale`);
}

// Littéral d'un fichier source. `brut` : ses balises ne sont PAS rendues (fichier .ts / .tsx du front, R8).
const litteral = (texte, cx) => (cx.balises ? { lit: texte } : { lit: texte, brut: true });

function plier(n, cx) {
  n = nu(n);
  if (!n) return [{ h: 1 }];
  if (estLit(n)) return [litteral(n.parent && ts.isJsxAttribute(n.parent) ? decoderEntites(n.text) : n.text, cx)];
  if (ts.isNumericLiteral(n)) return [n.text];
  if (ts.isTemplateExpression(n)) {
    const o = n.head.text ? [litteral(n.head.text, cx)] : [];
    for (const s of n.templateSpans) {
      o.push(...plier(s.expression, cx));
      if (s.literal.text) o.push(litteral(s.literal.text, cx));
    }
    return o;
  }
  if (ts.isBinaryExpression(n) && pliable(n, cx)) {
    const k = n.operatorToken.kind;
    if (k === SK.PlusToken) return [...plier(n.left, cx), ...plier(n.right, cx)];
    if (k === SK.BarBarToken || k === SK.QuestionQuestionToken) return [{ c: [plier(n.left, cx), plier(n.right, cx)] }];
    cx.restes.push(n.left); // a && 'texte'
    return [{ c: [plier(n.right, cx), []] }];
  }
  if (ts.isConditionalExpression(n)) {
    cx.restes.push(n.condition);
    const r = testPluriel(n.condition, cx);
    const c = [plier(n.whenTrue, cx), plier(n.whenFalse, cx)];
    return [r ? { c, r } : { c }];
  }
  if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
    cx.restes.push(n);
    return [{ tag: nomBalise(n, cx), noeud: n }];
  }
  if (ts.isCallExpression(n)) {
    const v = partieVoc(n, cx);
    if (v) return [v];
    if (estAppelT(n, cx)) {
      const d = n.arguments[1];
      const defaut = d && !ts.isObjectLiteralExpression(nu(d)) && pliable(d, cx) ? plier(d, cx) : null;
      n.arguments.forEach((a, i) => { if (i > 0 && !(i === 1 && defaut)) cx.restes.push(a); });
      return [{ t: { cle: n.arguments[0].text, defaut } }];
    }
  }
  cx.restes.push(n);
  return [ts.isIdentifier(n) ? { h: 1, id: n.text } : { h: 1 }];
}

const nomBalise = (n, cx) => (ts.isJsxElement(n) ? n.openingElement.tagName.getText(cx.sf)
  : ts.isJsxSelfClosingElement(n) ? `${n.tagName.getText(cx.sf)}/` : '');

// Parties des enfants d'un élément JSX (mémoïsées : l'élément est aussi relu, inliné dans son parent).
function partiesJsx(n, cx) {
  if (cx.jsx.has(n)) return cx.jsx.get(n);
  const parties = [];
  const restes = [];
  const sous = { ...cx, restes };
  for (const c of n.children) {
    if (ts.isJsxText(c)) { const t = texteJsx(c.text); if (t) parties.push(t); }
    else if (ts.isJsxExpression(c)) { if (c.expression) parties.push(...plier(c.expression, sous)); }
    else { parties.push({ tag: nomBalise(c, cx), noeud: c }); restes.push(c); } // R7
  }
  const r = { parties, restes };
  cx.jsx.set(n, r);
  return r;
}

// Contexte syntaxique d'une unité hors JSX (sert au mode residuels et à l'inventaire).
function contexteDe(n, cx) {
  let enfant = n;
  let p = n.parent;
  while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isSatisfiesExpression(p))) {
    enfant = p;
    p = p.parent;
  }
  if (!p) return 'autre';
  const nom = (x) => (ts.isIdentifier(x) || estLit(x) ? x.text : x.getText(cx.sf));
  if (ts.isJsxAttribute(p)) return `attr:${p.name.getText(cx.sf)}`;
  if (ts.isJsxExpression(p)) return p.parent && ts.isJsxAttribute(p.parent) ? `attr:${p.parent.name.getText(cx.sf)}` : 'jsx-expr';
  if (ts.isBinaryExpression(p)) return COMPARAISONS.has(p.operatorToken.kind) ? 'comparaison' : 'binaire';
  if (ts.isCaseClause(p)) return 'case';
  if (ts.isElementAccessExpression(p)) return p.argumentExpression === enfant ? 'index' : 'recepteur';
  if (ts.isComputedPropertyName(p)) return 'cle-objet';
  if (ts.isPropertyAssignment(p)) return p.name === enfant ? 'cle-objet' : `prop:${nom(p.name)}`;
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const i = (p.arguments ?? []).indexOf(enfant);
    if (i === -1) return 'appele';
    return `arg${i}:${ts.isNewExpression(p) ? 'new ' : ''}${p.expression.getText(cx.sf).replace(/\s+/g, '')}`;
  }
  if (ts.isArrayLiteralExpression(p)) return 'tableau';
  if (ts.isVariableDeclaration(p)) return `var:${p.name.getText(cx.sf).slice(0, 40)}`;
  if (ts.isReturnStatement(p) || ts.isArrowFunction(p)) return 'retour';
  if (ts.isPropertyAccessExpression(p)) return 'recepteur';
  if (ts.isTemplateSpan(p)) return 'gabarit';
  if (ts.isExpressionStatement(p)) return 'instruction';
  return SK[p.kind];
}

// Attribut JSX dans lequel une unité est écrite, à n'importe quelle profondeur : `style={{ gridArea: 'stock' }}`,
// `className={clsx('carte', actif && 'labo')}`. Un texte enfant d'un élément n'est dans aucun attribut.
function attributAncetre(n, cx) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return p.name.getText(cx.sf);
    if (ts.isJsxElement(p) || ts.isJsxFragment(p)) return null;
  }
  return null;
}

const typeScript = (nom) => (/\.tsx$/.test(nom) ? ts.ScriptKind.TSX : /\.ts$/.test(nom) ? ts.ScriptKind.TS
  : /\.jsx$/.test(nom) ? ts.ScriptKind.JSX : ts.ScriptKind.JS);

/**
 * Unités brutes d'un fichier source : [{ parties, l, col, ctx, attribut, noeud }] + variables recevant un appel voc (R10).
 * R12 : imports, types littéraux, console.* et commentaires ne produisent aucune unité.
 */
function extraire(texte, nom, options) {
  const sf = ts.createSourceFile(nom, texte, ts.ScriptTarget.Latest, true, typeScript(nom));
  // R8 : les balises d'un littéral ne sont rendues que là où quelque chose les rend à l'exécution — fr.json
  // (rendreTout) et les messages du serveur (.js, rendu au bord, sous-lot 2b). Dans un .ts / .tsx du front,
  // rien ne les rend : l'écran afficherait « [[Nom:labo]] ».
  const balises = options.balises ?? !/\.tsx?$/.test(nom);
  const cx = { sf, options, balises, restes: [], jsx: new Map(), etat: { declarations: null } };
  const unites = [];
  const variablesVoc = [];
  const visiter = (n) => {
    if (!n) return;
    if (ts.isImportDeclaration(n) || ts.isImportEqualsDeclaration(n) || ts.isExportDeclaration(n)) return; // R12
    if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return; // R12
    if (ts.isCallExpression(n) && (estConsole(n) || n.expression.kind === SK.ImportKeyword || estRequire(n))) return; // R12
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && appelVoc(nu(n.initializer))) {
      variablesVoc.push({ nom: n.name.text, ...position(n, cx) }); // R10 (jugée à la comparaison)
    }
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      const { parties, restes } = partiesJsx(n, cx);
      const texteDirect = parties.some((p) => typeof p === 'string' ? p.trim() !== '' : !(p.h || p.tag !== undefined));
      unites.push({ parties, ...position(n, cx), ctx: 'jsx', noeud: n, texteDirect });
      restes.forEach(visiter);
      if (ts.isJsxElement(n)) visiter(n.openingElement);
      return;
    }
    if (pliable(n, cx)) {
      const restes = [];
      const parties = plier(n, { ...cx, restes });
      unites.push({ parties, ...position(n, cx), ctx: contexteDe(n, cx), attribut: attributAncetre(n, cx), noeud: n });
      restes.forEach(visiter);
      return;
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  // Ordre du document (un élément JSX, puis ses attributs, puis ses enfants) : les écarts se lisent dans l'ordre du fichier.
  const rang = new Map(unites.map((u, i) => [u, i]));
  const debut = (n) => (ts.isJsxElement(n) ? n.openingElement.end : ts.isJsxFragment(n) ? n.openingFragment.end : n.getStart(sf));
  unites.sort((a, b) => debut(a.noeud) - debut(b.noeud) || rang.get(a) - rang.get(b));
  return { unites, variablesVoc, cx, diagnostics: sf.parseDiagnostics ?? [] };
}

// ═════════════════════════════════════════════════════════════════════════════
// Sérialisation canonique d'une suite de parties
// ═════════════════════════════════════════════════════════════════════════════
// env = { voc, mode: 'identite' | 'dur', fr: Map clé → valeur | null, erreurs: [] | null, plat: boolean }
//   identite : appels voc rendus par le vrai moteur, balises rendues, t() résolu par fr.json ;
//   dur      : seul le texte écrit en dur reste lisible (appel voc, balise → ⟦voc⟧ ; t() → ⟦t⟧).

const apostrophe = (s) => s.replace(/’/g, "'");
const simple = (s) => !s.includes('⟦');

// Jetons d'une chaîne canonique : mots entiers, groupes ⟦…⟧ équilibrés, caractères isolés.
function jetons(s) {
  const o = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '⟦') {
      let d = 0;
      let j = i;
      do { if (s[j] === '⟦') d += 1; else if (s[j] === '⟧') d -= 1; j += 1; } while (d > 0 && j < s.length);
      o.push(s.slice(i, j));
      i = j;
    } else {
      const m = /^[\p{L}\p{M}\p{N}]+/u.exec(s.slice(i, i + 80));
      const j = m ? m[0] : String.fromCodePoint(s.codePointAt(i));
      o.push(j);
      i += j.length;
    }
  }
  return o;
}

// R6 — préfixe et suffixe communs, par mots entiers : [préfixe, reste A, reste B, suffixe].
export function factoriser(a, b) {
  if (a === b) return [a, '', '', ''];
  const A = jetons(a);
  const B = jetons(b);
  let i = 0;
  while (i < A.length && i < B.length && A[i] === B[i]) i += 1;
  let j = 0;
  while (j < A.length - i && j < B.length - i && A[A.length - 1 - j] === B[B.length - 1 - j]) j += 1;
  return [A.slice(0, i).join(''), A.slice(i, A.length - j).join(''), B.slice(i, B.length - j).join(''), A.slice(A.length - j).join('')];
}

// R5 — pluriel aligné mot à mot : « ⟦produit|produits@>1⟧ ⟦vendable|vendables@>1⟧ ».
function pluriel(sg, pl, regle) {
  const a = sg.split(' ');
  const b = pl.split(' ');
  if (a.length !== b.length) return `⟦${sg}|${pl}@${regle}⟧`;
  return a.map((mot, i) => (mot === b[i] ? mot : `⟦${mot}|${b[i]}@${regle}⟧`)).join(' ');
}

const MARQUE_VOC = '⟦voc⟧';
const vocMarque = new Proxy({}, { get: () => () => MARQUE_VOC });
const BALISE = /\[\[([A-Za-z]+):([a-z0-9_]+)((?::[^[\]|:\n]*)*)\]\]/g;

function sansAvertissement(f) {
  const origine = console.warn;
  console.warn = () => {};
  try { return f(); } finally { console.warn = origine; }
}

const signaler = (env, type, message, toujours = true) => { if (env.erreurs) env.erreurs.push({ type, message, toujours }); };

// R8 — une balise écrite dans un fichier source du front n'est JAMAIS rendue (seuls fr.json et les messages du
// serveur le sont) : le littéral reste tel quel — donc différent de la référence — et c'est une erreur.
const BALISE_CANDIDATE = /\[\[[^[\]\n]*\]\]/;
function baliseEnSource(texte, env) {
  const m = texte.indexOf('[[') === -1 ? null : BALISE_CANDIDATE.exec(texte);
  if (m) {
    signaler(env, 'balise-source', `balise ${m[0]} dans un fichier source : une balise n'est rendue que dans fr.json, l'écran l'afficherait telle quelle — écrire l'appel voc`);
  }
  return texte;
}

// R8 — balises rendues dans les littéraux de fr.json et des fichiers .js (messages du serveur).
function rendreLitteral(lit, env) {
  if (lit.indexOf('[[') === -1) return lit;
  if (env.mode === 'dur') return rendre(vocMarque, lit, () => {});
  for (const m of lit.matchAll(BALISE)) {
    if (!Object.hasOwn(env.lexique, m[2])) signaler(env, 'balise', `balise ${m[0]} : clé de lexique inconnue « ${m[2]} »`, false);
  }
  return sansAvertissement(() => rendre(env.voc, lit, (balise, raison) => signaler(env, 'balise', `balise invalide ${balise} : ${raison}`, false)));
}

const lettres = /^[\p{L}\p{M}]*$/u;
const finitParLettre = /[\p{L}\p{M}]$/u;
const commenceParLettre = /^[\p{L}\p{M}]/u;

function emettreTexte(t, st, env) {
  if (!t) return;
  if (t.includes('’')) st.typo += t.split('’').length - 1; // apostrophes typographiques normalisées (comptées)
  t = apostrophe(t);
  // I3 : « {voc.nom('labo')}s » — un pluriel ou un affixe maison collé à un terme.
  if (st.finVoc === st.out.length && st.out.length > 0 && commenceParLettre.test(t)) {
    signaler(env, 'collage', `texte « ${t.slice(0, 16)} » collé à la suite d'un appel voc (pluriel ou accord maison)`);
  }
  st.out += t;
}

function emettreOpaque(s, st, deVoc = false) {
  st.out += s;
  st.debutLit = st.out.length;
  if (deVoc) st.finVoc = st.out.length;
}

// R3 / R5 — alternative singulier / pluriel (issue du code ou du moteur).
function emettrePluriel(st, env, sg, pl, regle, origine) {
  let [prefixe, rs, rp, suffixe] = factoriser(sg, pl);
  if (rs === rp) { emettreOpaque(prefixe + rs + suffixe, st, origine !== 'code'); return; }
  if (origine === 'code' && prefixe === '' && lettres.test(rs) && lettres.test(rp)) {
    const mot = /[\p{L}\p{M}][\p{L}\p{M}-]*$/u.exec(st.out);
    if (mot && st.finVoc > mot.index) {
      signaler(env, 'pluriel-maison', `pluriel « ${rp || rs} » collé à un appel voc : passer le nombre au moteur (voc.nom(k, n))`);
      emettreOpaque(`⟦ERREUR:pluriel collé à un appel voc|${rp}@${regle}⟧${suffixe}`, st);
      return;
    }
    if (mot) { // R3 : le suffixe se rattache au mot qui précède
      st.out = st.out.slice(0, mot.index);
      rs = mot[0] + rs;
      rp = mot[0] + rp;
    } else if (rs === '' && rp.length <= 3) {
      if (st.finVoc === st.out.length && st.out.length > 0) {
        signaler(env, 'pluriel-maison', `pluriel « ${rp} » collé à un appel voc : passer le nombre au moteur (voc.nom(k, n))`);
      } else {
        signaler(env, 'suffixe', `suffixe de pluriel « ${rp} » sans mot qui le précède (R3)`, false);
      }
      emettreOpaque(`⟦ERREUR:suffixe de pluriel sans mot|${rp}@${regle}⟧${suffixe}`, st);
      return;
    }
  }
  const coeur = simple(rs) && simple(rp) ? pluriel(rs, rp, regle) : `⟦${rs}|${rp}@${regle}⟧`;
  emettreOpaque(prefixe + coeur + suffixe, st, origine !== 'code');
}

function emettreCondition(st, a, b, deVoc) {
  const [prefixe, ra, rb, suffixe] = factoriser(a, b);
  emettreOpaque(prefixe + (ra === rb ? ra : `⟦?${ra}|${rb}⟧`) + suffixe, st, deVoc);
}

// R9 — rendu d'un appel voc par le vrai moteur.
function emettreVoc(v, st, env) {
  emettreAppelVoc(v, st, env);
  // voc.det : « {voc.det('stock', 'le')}ancien {voc.nom('stock')} » n'est pas un pluriel ni un accord maison.
  if (DETERMINANT_SEUL.has(v.methode)) st.finVoc = -1;
}

function emettreAppelVoc(v, st, env) {
  if (st.out.length > st.debutLit && finitParLettre.test(st.out)) {
    signaler(env, 'collage', `texte « ${st.out.slice(-16)} » collé devant un appel voc (l. ${v.l})`);
  }
  if (env.mode === 'dur') { emettreOpaque(MARQUE_VOC, st, true); return; }
  if (v.methode === 'g') { emettreOpaque(TROU, st); return; } // un genre n'est pas un texte
  if (v.avec === 'dynamique') { emettreOpaque(TROU, st, true); return; } // libellé de composant : donnée
  if (v.avec ? v.cle !== '_' : !(v.cles ?? [v.cle]).every((k) => Object.hasOwn(env.lexique, k))) {
    signaler(env, 'cle', `voc.${v.methode}('${v.cle}') : clé de lexique inconnue (l. ${v.l})`);
    emettreOpaque(`⟦ERREUR:clé inconnue ${v.cle}⟧`, st, true);
    return;
  }
  const moteur = v.avec ? env.voc.avec(v.avec) : env.voc;
  const appel = (n) => {
    const args = [...v.args];
    if (v.n) args[v.n.pos - 1] = n;
    return String(moteur[v.methode](v.cles ?? v.cle, ...args));
  };
  let sg;
  let pl;
  try {
    if (!v.n) { emettreOpaque(sansAvertissement(() => appel()), st, true); return; }
    if (v.methode === 'n') { // R2 : voc.n(k, x) = trou + nom au pluriel conditionnel
      sg = sansAvertissement(() => appel(1));
      pl = sansAvertissement(() => appel(2));
      if (!sg.startsWith('1 ') || !pl.startsWith('2 ')) throw new Error('voc.n ne commence pas par le nombre');
      sg = sg.slice(2);
      pl = pl.slice(2);
      emettreOpaque(`${TROU} `, st, true);
    } else {
      sg = sansAvertissement(() => appel(false));
      pl = sansAvertissement(() => appel(true));
    }
  } catch (e) {
    signaler(env, 'moteur', `voc.${v.methode}('${v.cle}') : ${e.message} (l. ${v.l})`);
    emettreOpaque('⟦ERREUR:moteur⟧', st, true);
    return;
  }
  if (v.n.generique) emettreCondition(st, pl, sg, true); // booléen quelconque : condition ordinaire
  else if (v.n.inverse) emettrePluriel(st, env, pl, sg, v.n.regle, 'voc');
  else emettrePluriel(st, env, sg, pl, v.n.regle, 'voc'); // R4
}

const estSuffixe = (p) => typeof p === 'object' && p.c && p.r
  && p.c.every((b) => b.length === 0 || (b.length === 1 && b[0].lit !== undefined && lettres.test(b[0].lit) && b[0].lit.length <= 3))
  && p.c.some((b) => b.length === 0 || b[0].lit === '');

// « ${c ? 'labo' : 'activité'}${n > 1 ? 's' : ''} » : le suffixe entre dans les deux branches.
function distribuerSuffixes(parties) {
  let o = null;
  for (let i = 0; i < parties.length; i += 1) {
    const p = parties[i];
    const prec = o ? o[o.length - 1] : parties[i - 1];
    if (i > 0 && estSuffixe(p) && typeof prec === 'object' && prec.c && !prec.r && prec.c[0].length && prec.c[1].length) {
      o = o ?? parties.slice(0, i);
      o[o.length - 1] = { c: [[...prec.c[0], p], [...prec.c[1], p]] };
    } else if (o) o.push(p);
  }
  return o ?? parties;
}

function emettre(p, st, env) {
  if (typeof p === 'string') { emettreTexte(baliseEnSource(p, env), st, env); return; } // texte JSX : jamais rendu
  if (p.lit !== undefined) { emettreTexte(p.brut ? baliseEnSource(p.lit, env) : rendreLitteral(p.lit, env), st, env); return; }
  if (p.h) {
    // accords : une variable qui reçoit un appel voc est montrée dans la phrase qui l'emploie.
    const variable = env.plat && p.id && env.variables && (env.profondeur ?? 0) < 2 ? env.variables(p.id) : null;
    if (variable) {
      env.profondeur = (env.profondeur ?? 0) + 1;
      variable.forEach((q) => emettre(q, st, env));
      env.profondeur -= 1;
      return;
    }
    emettreOpaque(TROU, st);
    return;
  }
  if (p.tag !== undefined) {
    if (env.plat && p.noeud && env.enfants) { // accords : l'élément enfant est inliné dans la phrase
      const enfant = env.enfants(p.noeud);
      if (enfant) {
        emettreOpaque(`<${p.tag.replace(/\/$/, '')}>`, st);
        enfant.forEach((q) => emettre(q, st, env));
        emettreOpaque(`</${p.tag.replace(/\/$/, '')}>`, st);
        return;
      }
    }
    emettreOpaque(`⟦<${p.tag}>⟧`, st); // R7
    return;
  }
  if (p.err) {
    signaler(env, 'voc', `${p.err} (l. ${p.l})`, p.toujours);
    emettreOpaque(`⟦ERREUR:${p.err}⟧`, st);
    return;
  }
  if (p.voc) { emettreVoc(p.voc, st, env); return; }
  if (p.ex) {
    // voc.ex(a, b) : avec le lexique par défaut, c'est `a` (mode identite). C'est `b` avec un autre lexique (ligne
    // miroir), pour juger ce qui reste écrit en dur (mode dur : `a`, exemple de restauration assumé, est exempté)
    // et pour le texte NEUTRE de l'unité (env.neutre : affichage et écarts admis des modes residuels et accords).
    if (env.mode !== 'dur' && !env.neutre && env.voc.estDefaut) {
      serialiserSuite(p.ex.sinon, env); // `b` n'est pas affiché, mais ses erreurs (clé inconnue, collage…) sont signalées
      emettre(p.ex.defaut, st, env);
    } else p.ex.sinon.forEach((q) => emettre(q, st, env));
    return;
  }
  if (p.t) {
    if (env.mode === 'dur') {
      emettreOpaque('⟦t⟧', st);
      if (p.t.defaut) p.t.defaut.forEach((q) => emettre(q, st, env));
    } else if (env.fr && env.fr.has(p.t.cle)) emettreTexte(rendreLitteral(env.fr.get(p.t.cle), env), st, env);
    else if (p.t.defaut) p.t.defaut.forEach((q) => emettre(q, st, env));
    else emettreOpaque(`⟦t:${p.t.cle}⟧`, st);
    return;
  }
  if (p.c) {
    const a = serialiserSuite(p.c[0], env);
    const b = serialiserSuite(p.c[1], env);
    st.typo += a.typo + b.typo;
    const deVoc = a.finitVoc || b.finitVoc;
    if (!p.r) emettreCondition(st, a.s, b.s, deVoc);
    else if (p.r.inverse) emettrePluriel(st, env, a.s, b.s, p.r.regle, deVoc ? 'mixte' : 'code');
    else emettrePluriel(st, env, b.s, a.s, p.r.regle, deVoc ? 'mixte' : 'code');
  }
}

function serialiserSuite(parties, env) {
  const st = { out: '', finVoc: -1, debutLit: 0, typo: 0 };
  for (const p of distribuerSuffixes(parties)) emettre(p, st, env);
  return { s: st.out, finitVoc: st.out.length > 0 && st.finVoc === st.out.length, typo: st.typo };
}

// Une unité sans aucun texte (trous, éléments enfants, blancs, conditions vides) n'est pas comparée.
const porteDuTexte = (parties) => parties.some((p) => (typeof p === 'string' ? p.trim() !== ''
  : p.lit !== undefined ? p.lit.trim() !== ''
    : p.c ? porteDuTexte(p.c[0]) || porteDuTexte(p.c[1])
      : !!(p.voc || p.t || p.err || p.ex)));

// L'unité contient-elle un exemple de saisie voc.ex(a, b) ?
const contientEx = (parties) => parties.some((p) => typeof p === 'object'
  && (p.ex ? true : p.c ? contientEx(p.c[0]) || contientEx(p.c[1]) : p.t && p.t.defaut ? contientEx(p.t.defaut) : false));

// ═════════════════════════════════════════════════════════════════════════════
// Mode accords, volet 1 : ce qui s'accorde avec un terme et reste écrit en dur
//   - un mot de la liste fermée MOTS_ACCORD juste DEVANT un appel voc (ou devant une variable qui en reçoit un) ;
//   - un participe ou un adjectif de la liste fermée ACCORDS_APRES juste APRÈS un appel voc nominal ;
//   - un pronom de reprise (elle, ils, lequel…) après un appel voc nominal, dans la même unité.
// ═════════════════════════════════════════════════════════════════════════════

const ENTRE = `(?:\\s+(?:${MOTS_ENTRE.join('|')}))?`;
const DEVANT = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${MOTS_ACCORD.join('|')})${ENTRE}\\s+$`, 'iu');
const DEVANT_ELIDE = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${MOTS_ELIDES.join('|')})['’](?:(?:${MOTS_ENTRE.join('|')})\\s+)?$`, 'iu');
const DEVANT_A = /(?:^|[^\p{L}\p{N}])à\s+$/iu;
// Ce qui peut s'intercaler entre le mot et l'appel sans les séparer : blancs, guillemet ou parenthèse ouvrants,
// emoji écrit en dur (« le « {voc.nom(k)} » », « le 🏭 {voc.nom(k)} »).
const INTERCALAIRES = /(?:[\s«"“‘(]|\p{Extended_Pictographic}|\u{FE0F}|\u{200D})+$/u;
// Méthodes qui posent elles-mêmes un déterminant invariable devant « de » : « de ce labo », « d'un labo »,
// « de votre activité » sont justes dans tous les domaines et le moteur n'a pas de forme qui les remplace.
const APRES_DE = new Set(['ce', 'votre', 'mon', 'son', 'tous', 'nouveau', 'aucun', 'un']);

// Mot signalé devant l'appel `methode`, ou null.
function motDevant(avant, methode) {
  const a = avant.replace(/\((?:s|e|es|x)\)/g, ''); // « ce(s) », « un(e) »
  const nu_ = a.replace(INTERCALAIRES, '');
  const separe = nu_.length < a.length;
  const entier = separe ? DEVANT.exec(`${nu_} `) : null;
  const elide = entier ? null : ((separe ? DEVANT_ELIDE.exec(`${nu_} `) : null) ?? DEVANT_ELIDE.exec(nu_));
  const m = entier ?? elide;
  const base = methode.charAt(0).toLowerCase() + methode.slice(1);
  if (!m) return base === 'le' && separe && DEVANT_A.test(`${nu_} `) ? 'à' : null; // « à {voc.le(k)} » : contraction, voc.au
  const mot = elide ? `${m[1].toLowerCase()}'` : m[1].toLowerCase();
  return (mot === 'de' || mot === "d'") && APRES_DE.has(base) ? null : mot;
}
// Premier mot signalé parmi les textes possibles devant l'appel (branches d'une condition).
const motDevantParmi = (avants, methode) => {
  for (const a of avants) { const mot = motDevant(a, methode); if (mot) return mot; }
  return null;
};

// Formes (masculin, féminin, pluriels) de la liste fermée ACCORDS_APRES.
const FORMES_APRES = [...new Set(ACCORDS_APRES.flatMap((paire) => paire.split('|').flatMap((f) => (/[sx]$/.test(f) ? [f] : [f, `${f}s`]))))]
  .sort((a, b) => b.length - a.length);
const ADVERBES = '(?:non|déjà|bien|pas|plus|jamais|encore|toujours|tous|toutes|actuellement|correctement)';
const COPULE = "(?:(?:ne|n['’])\\s*)?(?:est|sont|sera|seront|était|étaient|serait|seraient|soit|soient|reste|restent|restera|resteront|devient|deviennent|a\\s+été|ont\\s+été|avait\\s+été|aura\\s+été)";
// « {voc.Nom(k)} créée », « {voc.Le(k)} est déjà liée », « {voc.pl(k)} non inventoriés ».
const APRES = new RegExp(`^\\s+(?:${COPULE}\\s+)?(?:${ADVERBES}\\s+){0,2}(${FORMES_APRES.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
const REPRISE = new RegExp(`(?<![\\p{L}\\p{N}])(${PRONOMS_REPRISE.join('|')}|il)(?![\\p{L}\\p{N}'’])`, 'giu');

const dedoubler = (liste) => [...new Set(liste)].slice(0, 8);

/**
 * Parcourt une suite en gardant les textes possibles devant la position courante (`avants` : un par branche de
 * condition) ; renvoie ces textes à la fin de la suite.
 * etat = { l, signaler, enfants?, fr?, variables?, apres, vu } — `apres` : dernier appel voc nominal dont le texte
 * qui suit n'est pas encore lu ; `vu` : dernier appel voc nominal de l'unité (pronoms de reprise).
 */
function chercherAccords(parties, avants, etat, profondeur = 0) {
  let sauteBlanc = false;
  // Texte en dur à la position courante : accord écrit APRÈS un terme, pronom de reprise.
  const lireTexte = (texte) => {
    if (etat.apres) {
      const tampon = etat.apres.tampon + texte;
      if (/^\s*$/.test(tampon)) etat.apres.tampon = tampon; // rien que des blancs : le mot est dans la partie suivante
      else {
        const m = APRES.exec(tampon);
        const v = etat.apres.voc;
        if (m) etat.signaler({ mot: m[1].toLowerCase(), position: 'apres', methode: v.methode, cle: v.cle, l: v.l, col: `${v.col}+${m[1].toLowerCase()}` });
        etat.apres = null;
      }
    }
    if (etat.vu) {
      for (const m of texte.matchAll(REPRISE)) {
        const mot = m[1].toLowerCase();
        if (mot === 'il' && IL_IMPERSONNEL.test(texte.slice(m.index + m[0].length))) continue;
        etat.signaler({ mot, position: 'reprise', methode: etat.vu.methode, cle: etat.vu.cle, l: etat.vu.l, col: `${etat.vu.col}~${mot}` });
      }
    }
  };
  const appel = (v) => {
    const mot = motDevantParmi(avants, v.methode);
    if (mot) etat.signaler({ mot, position: 'devant', methode: v.methode, cle: v.cle, l: v.l, col: v.col });
    avants = ['X'];
    // voc.acc prolonge le groupe du terme (« {voc.Nom(k)} {voc.acc(k, 'créé', 'créée')} manuelle ») : le mot qui
    // le suit s'accorde encore avec le terme déjà nommé. Déterminant seul, icône, genre : rien ne s'y accorde.
    if (ACCORD_MOTEUR.has(v.methode)) etat.apres = etat.vu ? { voc: etat.vu, tampon: '' } : null;
    else if (NON_NOMINALES.has(v.methode)) etat.apres = null;
    else { etat.apres = { voc: v, tampon: '' }; etat.vu = v; }
  };
  for (const p of parties) {
    if (typeof p === 'string' || p.lit !== undefined) {
      let texte = typeof p === 'string' ? p : p.lit;
      if (sauteBlanc) { texte = texte.replace(/^\s+/, ''); sauteBlanc = false; }
      if (p.lit !== undefined && !p.brut) {
        let reste = 0;
        for (const m of texte.matchAll(BALISE)) {
          const segment = texte.slice(reste, m.index);
          lireTexte(segment);
          avants = avants.map((a) => a + segment);
          if (m[1] !== 'icon') appel({ methode: m[1], cle: m[2], l: etat.l, col: `b${m.index}` });
          reste = m.index + m[0].length;
        }
        lireTexte(texte.slice(reste));
        avants = avants.map((a) => a + texte.slice(reste));
      } else {
        lireTexte(texte);
        avants = avants.map((a) => a + texte);
      }
    } else if (p.voc) {
      if (p.voc.methode === 'icon') { sauteBlanc = true; continue; } // « le 🏭 labo » : l'icône ne sépare pas
      appel(p.voc);
    } else if (p.c) {
      // Chaque branche part du même état ; après la condition, les textes possibles sont ceux des deux branches
      // (« ${n > 1 ? 'les' : 'le'} ${voc.nom(k, n)} », « ce{n > 1 ? 's' : ''} {voc.nom(k, n)} »).
      const depart = etat.apres ? { ...etat.apres } : null;
      etat.apres = depart ? { ...depart } : null;
      const a = chercherAccords(p.c[0], avants, etat, profondeur);
      const finA = etat.apres;
      etat.apres = depart ? { ...depart } : null;
      const b = chercherAccords(p.c[1], avants, etat, profondeur);
      etat.apres = finA ?? etat.apres;
      avants = dedoubler([...a, ...b]);
    } else if (p.tag !== undefined) {
      const enfant = p.noeud && etat.enfants ? etat.enfants(p.noeud) : null;
      if (enfant) avants = chercherAccords(enfant, avants, etat, profondeur);
      else { avants = ['']; etat.apres = null; }
    } else if (p.ex) {
      // voc.ex(a, b) : seul l'exemple neutre `b` s'écrit avec le vocabulaire du compte — lu comme n'importe quel
      // texte. `a` n'est rendu qu'avec le lexique par défaut : rien ne s'y accorde.
      avants = chercherAccords(p.ex.sinon, avants, etat, profondeur);
    } else if (p.t && etat.fr && etat.fr.has(p.t.cle)) {
      // t('clé') : la valeur de fr.json est le texte affiché (« {t('x.supprimer_le')} {voc.nom(k)} »).
      avants = chercherAccords([{ lit: etat.fr.get(p.t.cle) }], avants, etat, profondeur);
    } else if (p.t && p.t.defaut) avants = chercherAccords(p.t.defaut, avants, etat, profondeur);
    else {
      // Trou nommé dont l'unique déclaration contient un appel voc : lu comme s'il était écrit ici
      // (« const nom = voc.nom(k); … `Aucun ${nom} trouvé` »).
      const variable = p.h && p.id && etat.variables && profondeur < 2 ? etat.variables(p.id) : null;
      if (variable) {
        const signalerIci = etat.signaler;
        etat.signaler = (s) => signalerIci({ ...s, l: etat.l, col: `${s.col}@${p.id}`, variable: p.id });
        avants = chercherAccords(variable, avants, etat, profondeur + 1);
        etat.signaler = signalerIci;
      } else { avants = ['']; etat.apres = null; }
    }
  }
  return avants;
}

// Clés voc d'une suite (appels et balises), éléments enfants inlinés compris si `enfants` est fourni, variables
// recevant un appel voc comprises si `variables` est fourni.
function clesVoc(parties, enfants, o = [], variables = null, profondeur = 0) {
  for (const p of parties) {
    if (typeof p === 'string') continue;
    if (p.lit !== undefined) { if (!p.brut) for (const m of p.lit.matchAll(BALISE)) o.push(`${m[1]}:${m[2]}`); }
    else if (p.voc) o.push(`${p.voc.methode}:${p.voc.cle}`);
    else if (p.ex) { o.push(CLE_EXEMPLE); clesVoc(p.ex.sinon, enfants, o, variables, profondeur); }
    else if (p.c) { clesVoc(p.c[0], enfants, o, variables, profondeur); clesVoc(p.c[1], enfants, o, variables, profondeur); }
    else if (p.t && p.t.defaut) clesVoc(p.t.defaut, enfants, o, variables, profondeur);
    else if (p.tag !== undefined && enfants && p.noeud) { const e = enfants(p.noeud); if (e) clesVoc(e, enfants, o, variables, profondeur); }
    else if (p.h && p.id && variables && profondeur < 2) { const v = variables(p.id); if (v) clesVoc(v, enfants, o, variables, profondeur + 1); }
  }
  return o;
}
const trousNommes = (parties, o = []) => {
  for (const p of parties) {
    if (typeof p !== 'object') continue;
    if (p.h && p.id) o.push(p.id);
    else if (p.c) { trousNommes(p.c[0], o); trousNommes(p.c[1], o); }
    else if (p.ex) trousNommes(p.ex.sinon, o);
  }
  return o;
};
// Textes écrits en dur d'une suite ; d'un voc.ex(a, b), seul `b` compte (`a` est exempté).
const fragments = (parties, o = []) => {
  for (const p of parties) {
    if (typeof p === 'string') o.push(p);
    else if (p.lit !== undefined) o.push(p.lit);
    else if (p.ex) fragments(p.ex.sinon, o);
    else if (p.c) { fragments(p.c[0], o); fragments(p.c[1], o); }
    else if (p.t && p.t.defaut) fragments(p.t.defaut, o);
  }
  return o;
};

// ═════════════════════════════════════════════════════════════════════════════
// Analyse d'un fichier
// ═════════════════════════════════════════════════════════════════════════════

// Raison pour laquelle une unité n'est PAS un texte visible (mode residuels) ; null = candidate.
function exclusion(u) {
  const { ctx } = u;
  const t = u.fragments.join('');
  // Forme d'identifiant : dans les contextes ambigus (comparaison, `value`, `name`, `type`…), seul un littéral
  // de cette forme est une valeur technique ; « Article », « Marge brute », « Tous les labos » sont des textes.
  const identifiant = IDENTIFIANT.test(t);
  if (ctx === 'index' || ctx === 'cle-objet') return ctx;
  // Comparaison ou `case` : un identifiant est une valeur technique ; un libellé (« Article », « PT ») reste
  // candidat même au fond d'un attribut technique (`style={{ textAlign: h === 'Article' ? … }}`).
  if (ctx === 'comparaison' || ctx === 'case') return identifiant ? ctx : null;
  const arg = /^arg(\d+):(.*)$/.exec(ctx);
  if (arg && APPELES_TECHNIQUES.some((re) => re.test(arg[2])) && (identifiant || !APPELES_A_IDENTIFIANT.test(arg[2]))) return `argument de ${arg[2]}`;
  if (u.attribut && (ATTRIBUTS_TECHNIQUES.has(u.attribut) || u.attribut.startsWith('data-'))
    && (identifiant || !ATTRIBUTS_A_IDENTIFIANT.has(u.attribut))) return `attribut ${u.attribut}`;
  if (ctx.startsWith('prop:') && PROPRIETES_TECHNIQUES.has(ctx.slice(5))
    && (identifiant || !PROPRIETES_A_IDENTIFIANT.has(ctx.slice(5)))) return `propriété ${ctx.slice(5)}`;
  // Chemin ou URL : jugé sur le texte canonique ENTIER (« ⟦·⟧ / ⟦·⟧ labo(s) » n'est pas un chemin), sans blanc
  // de tête ni mot après une espace (« / activité / mois » est un texte).
  const canon = u.neutre ?? u.canon; // unité à voc.ex(a, b) : c'est `b` qui est jugé
  if (/^(?:\/[\w⟦]|https?:)/.test(canon) && !/\s\p{L}/u.test(canon)) return 'chemin ou URL';
  if (/^[a-z0-9_\-./:?=&]+$/.test(t) && /[/\-_.]/.test(t)) return 'identifiant technique';
  if (SQL.test(t)) return 'SQL';
  return null;
}

// Lexique miroir (genre et élision inversés). Chaque entrée sans forme courte en reçoit une DISTINCTE, en
// mémoire seulement (« Abr-Usine ») : `voc.Nom('labo')` et `voc.Court('labo')`, identiques par défaut, donnent
// deux lignes « miroir » différentes — la règle 2 du §3 (forme courte dans un libellé) devient relisible.
const vocMiroirDe = (() => {
  let v;
  return () => {
    if (!v) {
      const essais = JSON.parse(fs.readFileSync(path.join(ICI, 'vocab-lexiques-test.json'), 'utf8'));
      const miroir = {};
      for (const [k, e] of Object.entries(essais.miroir)) {
        miroir[k] = e.court ? e : { ...e, court: { sg: `Abr-${e.sg}`, pl: `Abr-${e.pl ?? e.sg}`, el: true } };
      }
      v = creerVocab(resoudreLexique(LEXIQUE_DEFAUT, miroir));
    }
    return v;
  };
})();

/**
 * Analyse un fichier source.
 * options : { t (résoudre les appels t()), fr (Map clé → valeur de fr.json), complet (dur, termes, accords, miroir) }
 * → { unites: [{ l, ctx, canon, erreurs, trous, … }], erreurs: [{ l, type, message, toujours }], variablesVoc }
 */
export function analyser(texte, nom = 'x.tsx', options = {}) {
  const opts = { t: true, fr: null, complet: true, ...options };
  const { unites: brutes, variablesVoc, cx, diagnostics } = extraire(texte.replace(/\r\n?/g, '\n'), nom, opts);
  const enfants = (noeud) => {
    if (!(ts.isJsxElement(noeud) || ts.isJsxFragment(noeud))) return null;
    return partiesJsx(noeud, cx).parties;
  };
  const unites = [];
  const erreurs = diagnostics.map((d) => ({
    l: cx.sf.getLineAndCharacterOfPosition(d.start ?? 0).line + 1, type: 'analyse', toujours: true,
    message: `analyse impossible : ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
  }));
  const inlines = new Set(); // éléments JSX déjà montrés dans la phrase de leur parent (accords)
  const vus = new Set();
  // Variable dont l'UNIQUE déclaration porte un appel voc (`const nom = voc.nom(k)`, `const titre = \`Stock ${voc…}\``) :
  // ses parties, pour la lire dans la phrase qui l'emploie (mode accords). null = trou ordinaire.
  const cacheVariables = new Map();
  const variables = (nom) => {
    if (!cacheVariables.has(nom)) {
      const init = initialiseurUnique(nom, cx);
      const parties = init && pliable(init, cx) ? plier(init, { ...cx, restes: [] }) : null;
      cacheVariables.set(nom, parties && clesVoc(parties).length ? parties : null);
    }
    return cacheVariables.get(nom);
  };
  for (const b of brutes) {
    const errs = [];
    const serie = serialiserSuite(b.parties, { voc: vocabDefaut, lexique: LEXIQUE_DEFAUT, mode: 'identite', fr: opts.fr, erreurs: errs });
    const canon = serie.s;
    const cles = clesVoc(b.parties);
    // Jamais d'appel voc dans une chaîne SQL (le lexique est saisi par l'admin : ce serait une injection).
    if (cles.length && (/^arg\d+:.*\.query$/.test(b.ctx) || SQL.test(fragments(b.parties).join('')))) {
      errs.push({ type: 'sql', message: 'appel voc dans une requête SQL : renvoyer un code stable ou passer le libellé en paramètre $n', toujours: true });
    }
    // Méthode de chaîne sur un appel voc (`voc.Nom(k).toUpperCase()`, `` `Stock ${voc.nom(k)}`.slice(0, 5) ``) :
    // l'outil ne lit pas ce que la méthode fait du texte, l'écran n'affiche donc pas ce qu'il juge.
    if (cles.length && b.ctx === 'recepteur') {
      errs.push({ type: 'methode-chaine', message: 'méthode ou propriété appliquée à un appel voc : le texte affiché n\'est plus celui du moteur — employer voc.MAJ, voc.Nom, voc.Titre, voc.Court', toujours: true });
    }
    for (const e of errs) erreurs.push({ l: b.l, ...e });
    if (!porteDuTexte(b.parties)) continue;
    const u = { l: b.l, ctx: b.ctx, attribut: b.attribut ?? null, canon, erreurs: errs, trous: trousNommes(b.parties), voc: cles, apostrophes: serie.typo };
    if (opts.complet) {
      u.fragments = fragments(b.parties);
      u.dur = serialiserSuite(b.parties, { voc: vocabDefaut, lexique: LEXIQUE_DEFAUT, mode: 'dur', fr: null, erreurs: null }).s;
      // Unité à voc.ex(a, b) : son texte NEUTRE (`b`, rendu avec le lexique par défaut) est celui que les modes
      // residuels et accords affichent et admettent — `canon` (`a`) n'y désigne pas ce qui est jugé.
      if (contientEx(b.parties)) {
        u.neutre = serialiserSuite(b.parties, { voc: vocabDefaut, lexique: LEXIQUE_DEFAUT, mode: 'identite', fr: opts.fr, erreurs: null, neutre: true }).s;
      }
      u.termes = termesDans(u.dur.replace(/⟦<[^⟧]*>⟧|⟦ERREUR:[^⟧|]*/g, ' '));
      u.exclu = exclusion(u);
      // Exemple de saisie écrit en dur : un mot d'au moins 3 lettres reste dans le placeholder, hors appels voc
      // (et hors premier argument d'un voc.ex, que le texte « dur » ne contient pas).
      u.exemple = (b.attribut === 'placeholder' || b.ctx === 'prop:placeholder') && EXEMPLE.test(u.dur)
        && /[\p{L}]{3,}/u.test(u.dur.replace(EXEMPLE, '').replace(/⟦[^⟧]*⟧/g, ' '));
      // Accords : une phrase JSX est lue avec ses éléments enfants (« Aucun <strong>{voc.nom('labo')}</strong> »).
      const phrase = b.ctx === 'jsx' && b.texteDirect;
      const enf = phrase ? enfants : null;
      const clesPlat = clesVoc(b.parties, enf, [], variables);
      u.accords = [];
      chercherAccords(b.parties, [''], {
        l: b.l, enfants: enf, fr: opts.fr, variables, apres: null, vu: null,
        signaler: (s) => { const k = `${s.l}:${s.col}:${s.cle}`; if (!vus.has(k)) { vus.add(k); u.accords.push(s); } },
      });
      if (clesPlat.length && !inlines.has(b.noeud)) {
        const plat = (voc, lexique) => serialiserSuite(b.parties, { voc, lexique, mode: 'identite', fr: opts.fr, erreurs: null, plat: true, enfants: enf, variables }).s;
        u.plat = plat(vocabDefaut, LEXIQUE_DEFAUT);
        u.miroir = plat(vocMiroirDe(), LEXIQUE_DEFAUT);
        u.vocPlat = clesPlat;
      }
      if (phrase) (function marque(parties) {
        for (const p of parties) {
          if (typeof p !== 'object') continue;
          if (p.tag !== undefined && p.noeud && enfants(p.noeud)) { inlines.add(p.noeud); marque(enfants(p.noeud)); }
          else if (p.c) { marque(p.c[0]); marque(p.c[1]); }
        }
      })(b.parties);
    }
    unites.push(u);
  }
  return { unites, erreurs, variablesVoc };
}

/** fr.json → Map clé pointée → { valeur, l }. */
export function lireFr(texte, nom = FR_JSON) {
  const sf = ts.parseJsonText(nom, texte.replace(/\r\n?/g, '\n'));
  const o = new Map();
  (function marche(n, prefixe) {
    if (!n || !ts.isObjectLiteralExpression(n)) return;
    for (const p of n.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const cle = prefixe + p.name.text;
      if (ts.isObjectLiteralExpression(p.initializer)) marche(p.initializer, `${cle}.`);
      else if (ts.isStringLiteral(p.initializer)) o.set(cle, { valeur: p.initializer.text, l: sf.getLineAndCharacterOfPosition(p.getStart(sf)).line + 1 });
    }
  })(sf.statements[0]?.expression, '');
  return o;
}
const valeursFr = (fr) => new Map([...fr].map(([k, v]) => [k, v.valeur]));

/** Unités de fr.json (une par clé), au même format que celles d'un fichier source. */
export function analyserFr(texte, nom = FR_JSON) {
  const unites = [];
  const erreurs = [];
  for (const [cle, { valeur, l }] of lireFr(texte, nom)) {
    const parties = [{ lit: valeur }];
    const errs = [];
    const canon = serialiserSuite(parties, { voc: vocabDefaut, lexique: LEXIQUE_DEFAUT, mode: 'identite', fr: null, erreurs: errs }).s;
    for (const e of errs) erreurs.push({ l, ...e, toujours: true });
    const dur = serialiserSuite(parties, { voc: vocabDefaut, lexique: LEXIQUE_DEFAUT, mode: 'dur', fr: null, erreurs: null }).s;
    const u = { l, cle, ctx: 'fr.json', canon, dur, erreurs: errs, trous: [], voc: clesVoc(parties), fragments: [valeur], termes: termesDans(dur), exclu: null, exemple: false, accords: [], apostrophes: valeur.split('’').length - 1 };
    chercherAccords(parties, [''], { l, enfants: null, fr: null, variables: null, apres: null, vu: null, signaler: (s) => u.accords.push(s) });
    if (u.voc.length) {
      u.plat = canon;
      u.miroir = serialiserSuite(parties, { voc: vocMiroirDe(), lexique: LEXIQUE_DEFAUT, mode: 'identite', fr: null, erreurs: null }).s;
      u.vocPlat = u.voc;
    }
    unites.push(u);
  }
  return { unites, erreurs, variablesVoc: [] };
}

// ═════════════════════════════════════════════════════════════════════════════
// R11 — comparaison des multi-ensembles
// ═════════════════════════════════════════════════════════════════════════════

const bigrammes = (s) => { const o = new Map(); for (let i = 0; i < s.length - 1; i += 1) { const b = s.slice(i, i + 2); o.set(b, (o.get(b) ?? 0) + 1); } return o; };
function ressemblance(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrammes(a);
  const B = bigrammes(b);
  let commun = 0;
  for (const [k, n] of A) commun += Math.min(n, B.get(k) ?? 0);
  return (2 * commun) / (a.length - 1 + b.length - 1);
}

/**
 * Différence de deux listes d'unités ({ canon, l, fichier }) : ce qui a disparu (moins), ce qui est apparu
 * (plus), et les paires avant / après les plus ressemblantes.
 */
export function differences(reference, courant) {
  // Le résultat est celui du multi-ensemble (R11). Les passes successives ne servent qu'à désigner LAQUELLE
  // des occurrences d'un même texte est sans équivalent : d'abord celles dont les deux voisines concordent,
  // puis une seule voisine, puis le texte seul.
  const SEP = '\u0001';
  const voisins = (liste) => liste.map((u, i) => {
    const prec = i > 0 && liste[i - 1].fichier === u.fichier ? liste[i - 1].canon : '';
    const suiv = i < liste.length - 1 && liste[i + 1].fichier === u.fichier ? liste[i + 1].canon : '';
    return { u, cles: [prec + SEP + u.canon + SEP + suiv, prec + SEP + u.canon, u.canon + SEP + suiv, u.canon] };
  });
  let moins = voisins(reference);
  let plus = voisins(courant);
  for (let passe = 0; passe < 4; passe += 1) {
    const attente = new Map();
    for (const x of moins) {
      const liste = attente.get(x.cles[passe]);
      if (liste) liste.push(x); else attente.set(x.cles[passe], [x]);
    }
    const pris = new Set();
    const restePlus = [];
    for (const x of plus) {
      const liste = attente.get(x.cles[passe]);
      if (liste && liste.length) pris.add(liste.shift()); else restePlus.push(x);
    }
    moins = moins.filter((x) => !pris.has(x));
    plus = restePlus;
  }
  return { moins: moins.map((x) => x.u), plus: plus.map((x) => x.u) };
}

export function apparier(moins, plus) {
  const candidats = [];
  if (moins.length * plus.length <= 250000) {
    moins.forEach((m, i) => plus.forEach((p, j) => {
      const s = ressemblance(m.canon, p.canon) + (m.fichier === p.fichier ? 0.05 : 0) - Math.min(Math.abs(m.l - p.l), 400) / 8000;
      if (s >= 0.3) candidats.push([s, i, j]);
    }));
  }
  candidats.sort((a, b) => b[0] - a[0]);
  const prisM = new Set();
  const prisP = new Set();
  const paires = [];
  for (const [, i, j] of candidats) {
    if (prisM.has(i) || prisP.has(j)) continue;
    prisM.add(i);
    prisP.add(j);
    paires.push({ avant: moins[i], apres: plus[j] });
  }
  moins.forEach((m, i) => { if (!prisM.has(i)) paires.push({ avant: m, apres: null }); });
  plus.forEach((p, j) => { if (!prisP.has(j)) paires.push({ avant: null, apres: p }); });
  return paires.sort((a, b) => ((a.apres ?? a.avant).fichier.localeCompare((b.apres ?? b.avant).fichier)) || ((a.apres ?? a.avant).l - (b.apres ?? b.avant).l));
}

/**
 * Compare deux versions d'un même texte source (tests, et cœur du mode identite).
 * → { ok, moins, plus, paires, erreurs } ; `erreurs` = R9 / R10 / balises / collages de la version courante.
 */
export function comparer(avant, apres, options = {}) {
  const nom = options.nom ?? 'x.tsx';
  const ref = analyser(avant, nom, { t: options.t ?? true, fr: options.frRef ?? options.fr ?? null, complet: false });
  const cur = analyser(apres, nom, { t: options.t ?? true, fr: options.fr ?? null, complet: false });
  const tag = (l) => l.map((u) => ({ ...u, fichier: nom }));
  const courantes = tag(cur.unites);
  const { moins, plus } = differences(tag(ref.unites), courantes);
  const erreurs = erreursRetenues({ ...cur, unites: courantes }, plus);
  return { ok: moins.length === 0 && plus.length === 0 && erreurs.length === 0, moins, plus, paires: apparier(moins, plus), erreurs };
}

// Erreurs de la version courante : celles du moteur (toujours), celles d'une unité restée sans équivalent,
// et R10 — variable intermédiaire recevant un appel voc, relue comme un trou dans un texte sans équivalent.
function erreursRetenues(analyse, plus) {
  const sansEquivalent = new Set(plus);
  const erreurs = analyse.erreurs.filter((e) => e.toujours);
  for (const u of plus) for (const e of u.erreurs) if (!e.toujours) erreurs.push({ l: u.l, ...e });
  for (const v of analyse.variablesVoc) {
    const emploi = analyse.unites.find((u) => sansEquivalent.has(u) && u.trous.includes(v.nom));
    if (emploi) {
      erreurs.push({
        l: v.l, type: 'variable', toujours: true,
        message: `variable intermédiaire « ${v.nom} » recevant un appel voc, employée l. ${emploi.l} : écrire l'appel voc là où le texte est assemblé (R10)`,
      });
    }
  }
  return erreurs;
}

// ═════════════════════════════════════════════════════════════════════════════
// Écarts admis : scripts/vocab-allow/*.json
// ═════════════════════════════════════════════════════════════════════════════

// Un EXTRAIT admis porte le terme avec un mot PLEIN : un déterminant ou une préposition (« du labo », « pour le
// labo ») ne suffit pas — l'extrait ferait taire l'outil pour toutes les unités du fichier qui le contiennent.
const MOTS_VIDES = new Set([...MOTS_ACCORD, ...MOTS_ELIDES, ...MOTS_ENTRE, 'à', 'et', 'ou', 'en', 'par', 'pour', 'sur', 'avec', 'sans', 'dans', 'vers', 'chez', 'depuis']);
const motPlein = (extrait) => (sansTermes(extrait.replace(/⟦[^⟧]*⟧/g, ' ')).match(/[\p{L}\p{N}]{2,}/gu) ?? []).some((m) => !MOTS_VIDES.has(m.toLowerCase()));

/** Charge et valide les entrées { fichier, avant, apres, type, justification, mode?, occurrences? } de tous les lots. */
export function chargerAllow(dossier) {
  const entrees = [];
  const problemes = [];
  if (!fs.existsSync(dossier)) return { entrees, problemes };
  for (const nom of fs.readdirSync(dossier).filter((f) => f.endsWith('.json')).sort()) {
    let contenu;
    try { contenu = JSON.parse(fs.readFileSync(path.join(dossier, nom), 'utf8')); } catch (e) { problemes.push(`${nom} : JSON illisible (${e.message})`); continue; }
    if (!Array.isArray(contenu)) { problemes.push(`${nom} : le fichier doit être un tableau d'entrées`); continue; }
    contenu.forEach((e, i) => {
      const ou = `${nom}[${i}]`;
      const texte = (v) => v === null || v === undefined || typeof v === 'string';
      if (!e || typeof e !== 'object') { problemes.push(`${ou} : entrée invalide`); return; }
      if (typeof e.fichier !== 'string' || !e.fichier) problemes.push(`${ou} : « fichier » manquant`);
      if (!texte(e.avant) || !texte(e.apres) || (e.avant == null && e.apres == null)) problemes.push(`${ou} : « avant » / « apres » doivent être des textes (l'un des deux peut être null)`);
      if (!TYPES_ALLOW.includes(e.type)) problemes.push(`${ou} : type « ${e.type} » inconnu (${TYPES_ALLOW.join(', ')})`);
      if (typeof e.justification !== 'string' || e.justification.trim().length < 10) problemes.push(`${ou} : justification manquante (une phrase, relue en revue)`);
      const modes = e.mode == null ? null : [].concat(e.mode);
      if (modes && !modes.every((m) => MODES_ALLOW.includes(m))) problemes.push(`${ou} : mode inconnu (${MODES_ALLOW.join(', ')})`);
      const avant = e.avant == null ? null : apostrophe(e.avant);
      const apres = e.apres == null ? null : apostrophe(e.apres);
      // `occurrences` : nombre de textes nouveaux (avant: null) ou supprimés (apres: null) que l'entrée admet.
      if (e.occurrences !== undefined) {
        if (!(Number.isInteger(e.occurrences) && e.occurrences >= 1)) problemes.push(`${ou} : « occurrences » doit être un entier ≥ 1`);
        else if (avant !== null && apres !== null) problemes.push(`${ou} : « occurrences » ne vaut que pour une entrée « avant: null » ou « apres: null »`);
      }
      // Entrée commune à tous les fichiers (`"fichier": "*"`, scripts/vocab-allow/_global.json) : seulement un texte
      // resté en dur (mode residuels) qui porte le terme AVEC un autre mot — locution, nom de formule, homonyme.
      if (e.fichier === FICHIER_GLOBAL) {
        if ((modes && !(modes.length === 1 && modes[0] === 'residuels')) || avant === null || avant !== apres) {
          problemes.push(`${ou} : une entrée « fichier: "*" » ne vaut que pour le mode residuels (avant = apres, sans autre mode)`);
        } else if (!motPlein(apres) && termesDans(apres).length < 2) {
          // « Supplément Labo » (deux termes) n'est admis que comme unité entière ; « prix de vente » masque un extrait.
          problemes.push(`${ou} : une entrée « fichier: "*" » doit porter le terme avec au moins un autre mot (« prix de vente »), jamais le terme seul`);
        }
      }
      entrees.push({
        ...e, avant, apres, lot: nom.replace(/\.json$/, ''), source: ou, emplois: 0,
        fichier: String(e.fichier ?? '').replace(/\\/g, '/'),
        modes: modes ?? [avant !== apres ? 'identite' : 'residuels'],
      });
    });
  }
  return { entrees, problemes };
}

/** Nombre de besoins déposés par les lots (scripts/vocab-besoins/*.json, un tableau par fichier). */
export function compterBesoins(dossier) {
  if (!fs.existsSync(dossier)) return 0;
  let n = 0;
  for (const nom of fs.readdirSync(dossier).filter((f) => f.endsWith('.json'))) {
    try { const c = JSON.parse(fs.readFileSync(path.join(dossier, nom), 'utf8')); if (Array.isArray(c)) n += c.length; } catch { n += 1; }
  }
  return n;
}

// identite :
//   - une entrée (avant → apres) absorbe les occurrences de cette PAIRE dans son fichier ; avec --ensemble, l'un
//     des deux côtés peut être dans un autre fichier de l'ensemble (chaîne déplacée), jamais les deux ;
//   - une entrée « avant: null » (texte nouveau) ou « apres: null » (texte supprimé) n'absorbe que
//     `occurrences` unités (défaut 1), et seulement dans SON fichier.
function appliquerAllowIdentite(moins, plus, entrees, fichiers) {
  const ensemble = fichiers.size > 1;
  for (const e of entrees) {
    if (!e.modes.includes('identite') || !fichiers.has(e.fichier)) continue;
    const sien = (u) => u.fichier === e.fichier;
    const m = [];
    const p = [];
    if (e.avant === null) p.push(...plus.filter((u) => u.canon === e.apres && sien(u)).slice(0, e.occurrences ?? 1));
    else if (e.apres === null) m.push(...moins.filter((u) => u.canon === e.avant && sien(u)).slice(0, e.occurrences ?? 1));
    else {
      const lesSiensDAbord = (a, b) => Number(sien(b)) - Number(sien(a));
      const mTous = moins.filter((u) => u.canon === e.avant && (ensemble || sien(u))).sort(lesSiensDAbord);
      const pTous = plus.filter((u) => u.canon === e.apres && (ensemble || sien(u))).sort(lesSiensDAbord);
      for (let i = 0; i < Math.min(mTous.length, pTous.length); i += 1) {
        if (sien(mTous[i]) || sien(pTous[i])) { m.push(mTous[i]); p.push(pTous[i]); }
      }
    }
    const n = Math.max(m.length, p.length);
    if (!n) continue;
    e.emplois += n;
    for (const u of m) moins.splice(moins.indexOf(u), 1);
    for (const u of p) plus.splice(plus.indexOf(u), 1);
  }
}

// residuels : une entrée vaut pour l'unité entière (texte canonique) ou masque un extrait (« prix de vente »).
// Un exemple de saisie resté en dur (pseudo-terme « exemple ») ne s'admet que par l'unité entière.
// Unité à voc.ex(a, b) : le texte canonique jugé est le texte NEUTRE (`b`) — une entrée écrite sur `a`
// (l'exemple de la référence, exempté) n'admet rien.
function residuAdmis(u, fichier, entrees) {
  let dur = u.dur;
  const canon = u.neutre ?? u.canon;
  for (const e of entrees) {
    if (!e.modes.includes('residuels') || (e.fichier !== fichier && e.fichier !== FICHIER_GLOBAL) || e.apres === null) continue;
    if (e.apres === canon || e.apres === u.dur) { e.emplois += 1; return []; }
    if (dur.includes(e.apres) && motPlein(e.apres)) {
      dur = dur.split(e.apres).join('⟦admis⟧');
      e.emplois += 1;
    }
  }
  const termes = termesDans(dur.replace(/⟦<[^⟧]*>⟧|⟦ERREUR:[^⟧|]*/g, ' '));
  return u.exemple ? [...termes, TERME_EXEMPLE] : termes;
}

// ═════════════════════════════════════════════════════════════════════════════
// Dépôt analysé : périmètre, référence git
// ═════════════════════════════════════════════════════════════════════════════

const posix = (p) => p.split(path.sep).join('/');

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function lireBase(root, forcee) {
  if (forcee) return forcee;
  const f = path.join(root, 'scripts', 'vocab-check.base');
  if (!fs.existsSync(f)) throw new Usage(`référence absente : ${f} (y écrire le commit de develop : git -C ${root} rev-parse develop)`);
  const base = fs.readFileSync(f, 'utf8').trim();
  if (!/^[0-9a-f]{7,40}$/.test(base)) throw new Usage(`${f} : contenu inattendu (un sha de commit, seul)`);
  return base;
}

const dansPerimetre = (f) => f === FR_JSON || (EXTENSIONS.test(f) && !f.endsWith('.d.ts') && !EXCLUS_DEFAUT.some((x) => (x.endsWith('/') ? f.startsWith(x) : f === x)));

function fichiersCourants(root) {
  const o = [];
  (function marche(dossier) {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      const complet = path.join(dossier, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') marche(complet); }
      else { const rel = posix(path.relative(root, complet)); if (dansPerimetre(rel)) o.push(rel); }
    }
  })(path.join(root, 'src'));
  return o.sort();
}

// Fichiers demandés sur la ligne de commande → chemins relatifs au dépôt analysé.
function resoudreFichiers(root, demandes) {
  const o = [];
  for (const d of demandes) {
    const candidats = [path.resolve(root, d), path.resolve(d)];
    const abs = candidats.find((c) => fs.existsSync(c)) ?? candidats[0];
    const rel = posix(path.relative(root, abs));
    if (rel.startsWith('..')) throw new Usage(`${d} : hors du dépôt analysé (${root})`);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      o.push(...fichiersCourants(root).filter((f) => f.startsWith(`${rel}/`)));
    } else o.push(rel);
  }
  return [...new Set(o)];
}

const lire = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');
const analyserFichier = (texte, f, options) => (f.endsWith('.json') ? analyserFr(texte, f) : analyser(texte, f, options));

// ═════════════════════════════════════════════════════════════════════════════
// Mode identite
// ═════════════════════════════════════════════════════════════════════════════

// Valeurs par défaut des appels t('clé', défaut) de la RÉFÉRENCE, pour les clés données : Map clé → [textes canoniques].
// Sert à juger une clé AJOUTÉE à fr.json : sa valeur rendue doit être le défaut que l'écran affichait jusque-là.
function defautsDeReference(root, base, cles, lireRef) {
  const out = new Map();
  if (!cles.length) return out;
  let fichiers = [];
  try {
    fichiers = git(root, ['grep', '-l', '-z', '-F', ...cles.flatMap((c) => ['-e', c]), base, '--', 'src'])
      .split('\0').filter(Boolean).map((x) => x.slice(x.indexOf(':') + 1));
  } catch (e) {
    if (e.status !== 1) throw e; // git grep : code 1 = aucune occurrence
  }
  const voulues = new Set(cles);
  const env = { voc: vocabDefaut, lexique: LEXIQUE_DEFAUT, mode: 'identite', fr: null, erreurs: null };
  for (const f of fichiers.filter((x) => EXTENSIONS.test(x))) {
    const { unites } = extraire(lireRef(f).replace(/\r\n?/g, '\n'), f, { t: true, fr: null });
    const lire = (parties) => {
      for (const p of parties) {
        if (typeof p !== 'object') continue;
        if (p.t && p.t.defaut && voulues.has(p.t.cle)) {
          const canon = serialiserSuite(p.t.defaut, env).s;
          const liste = out.get(p.t.cle) ?? [];
          if (!liste.includes(canon)) liste.push(canon);
          out.set(p.t.cle, liste);
        } else if (p.c) { lire(p.c[0]); lire(p.c[1]); }
      }
    };
    for (const u of unites) lire(u.parties);
  }
  return out;
}

const apostrophesDe = (unites) => unites.reduce((n, u) => n + (u.apostrophes ?? 0), 0);
const infoApostrophes = (f, n) => `${f} : ${n} apostrophe(s) typographique(s) ’ devenue(s) droite(s) ' — écart d'un caractère admis par la spec (§2.5), à citer dans le compte rendu du lot`;

export function modeIdentite({ root, fichiers, ensemble, base, entrees }) {
  const zero = (l) => l.split('\0').filter(Boolean);
  const dansRef = new Set(zero(git(root, ['ls-tree', '-r', '-z', '--name-only', base, '--', 'src'])));
  const lireRef = (f) => (dansRef.has(f) ? git(root, ['show', `${base}:${f}`]) : null);
  const existe = (f) => fs.existsSync(path.join(root, f));

  let cibles;
  let inchanges = 0;
  const horsPerimetre = [];
  if (fichiers.length) cibles = fichiers;
  else {
    // Sans fichier demandé : tout fichier du périmètre qui diffère de la référence (modifié, nouveau, supprimé).
    const modifies = new Set([
      ...zero(git(root, ['diff', '--name-only', '--no-renames', '-z', base, '--', 'src'])),
      ...zero(git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', 'src'])),
    ]);
    const tous = new Set([...fichiersCourants(root), ...[...dansRef].filter(dansPerimetre)]);
    cibles = [...tous].filter((f) => modifies.has(f) || !dansRef.has(f) || !existe(f)).sort();
    inchanges = tous.size - cibles.length;
    // L'espace admin et les pages publiques gardent le vocabulaire LabFlow (I4) : un fichier modifié là
    // n'est pas comparé par défaut, mais il est nommé (ex. le point d'appel de contractPdf dans AdminSupportPage).
    for (const f of [...modifies].sort()) {
      if (EXTENSIONS.test(f) && HORS_VOCABULAIRE.some((x) => f.startsWith(x))) horsPerimetre.push(f);
    }
  }

  const frRefTexte = dansRef.has(FR_JSON) ? lireRef(FR_JSON) : null;
  const frCurTexte = existe(FR_JSON) ? lire(root, FR_JSON) : null;
  const avecT = frRefTexte !== null || frCurTexte !== null;
  const frRef = frRefTexte ? valeursFr(lireFr(frRefTexte)) : new Map();
  const frCur = frCurTexte ? valeursFr(lireFr(frCurTexte)) : new Map();

  const groupes = [];
  const infos = horsPerimetre.map((f) => `${f} : modifié, hors périmètre par défaut (espace admin ou page publique) — à contrôler en le nommant`);
  const erreurs = [];
  const parFichier = [];
  for (const f of cibles) {
    if (f === FR_JSON) { // fr.json : clé par clé (une clé supprimée est « purgée », pas un écart)
      const ref = frRefTexte ? lireFr(frRefTexte) : new Map();
      const cur = frCurTexte ? analyserFr(frCurTexte) : { unites: [], erreurs: [] };
      const moins = [];
      const plus = [];
      const ajoutees = [];
      const vues = new Set();
      let typoRef = 0;
      let typoCur = 0;
      for (const u of cur.unites) {
        vues.add(u.cle);
        if (!ref.has(u.cle)) { ajoutees.push(u); continue; }
        typoRef += ref.get(u.cle).valeur.split('’').length - 1;
        typoCur += u.apostrophes ?? 0;
        const avant = apostrophe(ref.get(u.cle).valeur);
        if (avant !== u.canon) {
          moins.push({ fichier: f, l: ref.get(u.cle).l, canon: avant, cle: u.cle });
          plus.push({ fichier: f, l: u.l, canon: u.canon, cle: u.cle, erreurs: [], trous: [] });
        }
      }
      // Clé AJOUTÉE : l'écran affichait jusque-là le défaut de son point d'appel t('clé', défaut) ; la valeur
      // de fr.json le remplace, que l'appel ait gardé son 2e argument ou non.
      const defauts = defautsDeReference(root, base, ajoutees.map((u) => u.cle), lireRef);
      for (const u of ajoutees) {
        const attendus = defauts.get(u.cle) ?? [];
        if (!attendus.length) infos.push(`${f} : clé ajoutée « ${u.cle} » sans appel t('${u.cle}', défaut) dans la référence — texte nouveau, à relire`);
        for (const canon of attendus) {
          if (canon === u.canon) continue;
          moins.push({ fichier: f, l: u.l, canon, cle: u.cle });
          plus.push({ fichier: f, l: u.l, canon: u.canon, cle: u.cle, erreurs: [], trous: [] });
        }
      }
      const purgees = [...ref.keys()].filter((k) => !vues.has(k)).length;
      infos.push(`${f} : ${cur.unites.length} clé(s), ${purgees} purgée(s), ${ajoutees.length} ajoutée(s)`);
      if (typoCur < typoRef) infos.push(infoApostrophes(f, typoRef - typoCur));
      for (const e of cur.erreurs) erreurs.push({ fichier: f, ...e });
      parFichier.push({ fichier: f, moins, plus, analyse: null });
      continue;
    }
    const refTexte = lireRef(f);
    const curTexte = existe(f) ? lire(root, f) : null;
    if (refTexte === null && curTexte === null) throw new Usage(`${f} : introuvable (ni dans ${root}, ni dans la référence ${base.slice(0, 7)})`);
    if (refTexte !== null && curTexte !== null && refTexte.replace(/\r\n?/g, '\n') === curTexte.replace(/\r\n?/g, '\n')) { inchanges += 1; continue; }
    const ref = refTexte === null ? { unites: [] } : analyser(refTexte, f, { t: avecT, fr: frRef, complet: false });
    const cur = curTexte === null ? { unites: [], erreurs: [], variablesVoc: [] } : analyser(curTexte, f, { t: avecT, fr: frCur, complet: false });
    if (refTexte === null) infos.push(`${f} : nouveau fichier (absent de la référence)`);
    if (curTexte === null) infos.push(`${f} : fichier supprimé`);
    if (refTexte !== null && curTexte !== null && apostrophesDe(cur.unites) < apostrophesDe(ref.unites)) {
      infos.push(infoApostrophes(f, apostrophesDe(ref.unites) - apostrophesDe(cur.unites)));
    }
    const tag = (l) => l.map((u) => ({ ...u, fichier: f }));
    parFichier.push({ fichier: f, ref: tag(ref.unites), cur: tag(cur.unites), analyse: cur });
  }

  // R11 : par fichier, ou sur l'union des fichiers (--ensemble) pour les chaînes déplacées.
  const lots = ensemble ? [parFichier] : parFichier.map((x) => [x]);
  for (const lot of lots) {
    if (!lot.length) continue;
    const moins = [];
    const plus = [];
    const sources = lot.filter((x) => x.analyse !== null);
    if (sources.length) {
      const d = differences(sources.flatMap((x) => x.ref), sources.flatMap((x) => x.cur));
      moins.push(...d.moins);
      plus.push(...d.plus);
    }
    for (const x of lot) if (x.analyse === null) { moins.push(...x.moins); plus.push(...x.plus); }
    for (const x of sources) {
      const sansEquivalent = plus.filter((u) => u.fichier === x.fichier);
      for (const e of erreursRetenues({ ...x.analyse, unites: x.cur }, sansEquivalent)) erreurs.push({ fichier: x.fichier, ...e });
    }
    const noms = new Set(lot.map((x) => x.fichier));
    appliquerAllowIdentite(moins, plus, entrees, noms);
    if (moins.length || plus.length) groupes.push({ fichiers: [...noms], paires: apparier(moins, plus) });
  }
  const ecarts = groupes.reduce((n, g) => n + g.paires.length, 0);
  return { mode: 'identite', base, controles: cibles.length, inchanges, ecarts, groupes, erreurs, infos, ok: ecarts === 0 && erreurs.length === 0 };
}

// ═════════════════════════════════════════════════════════════════════════════
// Modes residuels, accords, inventaire (version courante seulement)
// ═════════════════════════════════════════════════════════════════════════════

function analyserCourant(root, fichiers) {
  const cibles = fichiers.length ? fichiers : fichiersCourants(root);
  const frTexte = fs.existsSync(path.join(root, FR_JSON)) ? lire(root, FR_JSON) : null;
  const fr = frTexte ? valeursFr(lireFr(frTexte)) : null;
  return cibles.map((f) => {
    if (!fs.existsSync(path.join(root, f))) throw new Usage(`${f} : fichier introuvable dans ${root}`);
    return { fichier: f, ...analyserFichier(lire(root, f), f, { t: fr !== null, fr, complet: true }) };
  });
}

export function modeResiduels({ root, fichiers, entrees }) {
  const residuels = [];
  const parFichier = {};
  const analyses = analyserCourant(root, fichiers);
  for (const a of analyses) {
    for (const u of a.unites) {
      if ((!u.termes.length && !u.exemple) || u.exclu) continue;
      const termes = residuAdmis(u, a.fichier, entrees);
      if (!termes.length) continue;
      residuels.push({ fichier: a.fichier, l: u.l, texte: u.neutre ?? u.canon, termes, ctx: u.ctx });
      parFichier[a.fichier] = (parFichier[a.fichier] ?? 0) + 1;
    }
  }
  return { mode: 'residuels', controles: analyses.length, residuels, parFichier, ok: residuels.length === 0 };
}

export function modeAccords({ root, fichiers, entrees }) {
  const signalements = [];
  const miroir = [];
  const analyses = analyserCourant(root, fichiers);
  for (const a of analyses) {
    for (const u of a.unites) {
      if (u.miroir !== undefined) miroir.push({ fichier: a.fichier, l: u.l, cle: u.cle, defaut: u.plat, miroir: u.miroir, voc: u.vocPlat });
      for (const s of u.accords ?? []) {
        // Unité à voc.ex(a, b) : le signalement porte sur `b`, c'est son texte neutre qui est affiché et admis.
        const texte = u.neutre ?? u.plat ?? u.canon;
        const admise = entrees.find((e) => e.modes.includes('accords') && e.fichier === a.fichier && (e.apres === texte || e.apres === (u.neutre ?? u.canon)));
        if (admise) { admise.emplois += 1; continue; }
        signalements.push({
          fichier: a.fichier, l: s.l, mot: s.mot, position: s.position ?? 'devant', appel: `voc.${s.methode}('${s.cle}')`, texte,
          ...(s.variable ? { variable: s.variable } : {}),
        });
      }
    }
  }
  return { mode: 'accords', controles: analyses.length, signalements, miroir, ok: signalements.length === 0 };
}

/** Texte de scripts/vocab-accords.txt (volet 2 du mode accords) — sans date : la sortie est reproductible. */
export function texteAccords(miroir) {
  const lignes = [
    '# vocab-accords.txt — GÉNÉRÉ par `node scripts/vocab-check.mjs accords` (ne pas éditer).',
    '# Chaque unité qui contient un appel voc ou une balise, rendue avec le lexique par défaut puis avec le',
    '# lexique MIROIR (scripts/vocab-lexiques-test.json : genre et élision inversés, autres mots).',
    '# À relire en revue : un accord faux dans une ligne « miroir » est un accord resté écrit en dur.',
    `# ${miroir.length} unité(s), ${new Set(miroir.map((m) => m.fichier)).size} fichier(s).`,
  ];
  let courant = null;
  for (const m of miroir) {
    if (m.fichier !== courant) { lignes.push('', m.fichier); courant = m.fichier; }
    lignes.push(`  ${m.cle ? `${m.cle} (l. ${m.l})` : `l. ${m.l}`}`, `    défaut : ${m.defaut}`, `    miroir : ${m.miroir}`);
  }
  return `${lignes.join('\n')}\n`;
}

export function modeInventaire({ root, fichiers, base }) {
  const analyses = analyserCourant(root, fichiers);
  const sortie = {
    outil: 'vocab-check inventaire', depot: posix(root), base,
    resume: { fichiers: analyses.length, fichiersATerme: 0, unites: 0, unitesATerme: 0, candidates: 0, exclues: 0, unitesVoc: 0, parCle: {}, parCleVoc: {} },
    fichiers: {},
  };
  const r = sortie.resume;
  for (const a of analyses) {
    r.unites += a.unites.length;
    const unites = [];
    for (const u of a.unites) {
      const termes = u.exemple ? [...u.termes, TERME_EXEMPLE] : u.termes;
      if (!termes.length && !u.voc.length) continue;
      const candidate = termes.length > 0 && !u.exclu;
      unites.push({ l: u.l, ...(u.cle ? { cle: u.cle } : {}), texte: u.canon, ...(u.neutre !== undefined ? { neutre: u.neutre } : {}), termes, voc: u.voc, ctx: u.ctx, candidate, ...(u.exclu ? { exclu: u.exclu } : {}) });
      if (termes.length) { r.unitesATerme += 1; if (candidate) { r.candidates += 1; for (const k of termes) r.parCle[k] = (r.parCle[k] ?? 0) + 1; } else r.exclues += 1; }
      if (u.voc.length) { r.unitesVoc += 1; for (const k of u.voc) r.parCleVoc[k] = (r.parCleVoc[k] ?? 0) + 1; }
    }
    if (!unites.length) continue;
    r.fichiersATerme += 1;
    sortie.fichiers[a.fichier] = { candidates: unites.filter((u) => u.candidate).length, unitesVoc: unites.filter((u) => u.voc.length).length, unites };
  }
  return sortie;
}

// ═════════════════════════════════════════════════════════════════════════════
// Mode lexique : backend à jour, vecteurs identiques, empreinte de gel
// ═════════════════════════════════════════════════════════════════════════════

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const lf = (s) => s.replace(/\r\n?/g, '\n');

/**
 * Empreinte du moteur (TOUS les fichiers de src/vocab, sous-dossiers compris, quelle que soit leur extension ;
 * fins de ligne neutralisées) et du lexique par défaut.
 */
export function empreinte(dossierVocab = path.join(DEPOT_FRONT, 'src', 'vocab'), lexique = LEXIQUE_DEFAUT) {
  const chemins = [];
  (function marche(dossier, prefixe) {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (e.isDirectory()) marche(path.join(dossier, e.name), `${prefixe}${e.name}/`);
      else chemins.push(`${prefixe}${e.name}`);
    }
  })(dossierVocab, '');
  const fichiers = {};
  for (const f of chemins.sort()) {
    fichiers[`src/vocab/${f}`] = sha256(lf(fs.readFileSync(path.join(dossierVocab, f), 'utf8')));
  }
  const lex = sha256(JSON.stringify(lexique));
  return { algo: 'sha256', fichiers, lexique: lex, empreinte: sha256(JSON.stringify([fichiers, lex])) };
}

/** Ce qui a changé depuis le gel : [] si rien. */
export function ecartsDeGel(gel, actuel) {
  const o = [];
  for (const f of new Set([...Object.keys(gel.fichiers ?? {}), ...Object.keys(actuel.fichiers)])) {
    if (!(f in actuel.fichiers)) o.push(`${f} : supprimé depuis le gel`);
    else if (!(f in (gel.fichiers ?? {}))) o.push(`${f} : ajouté depuis le gel`);
    else if (gel.fichiers[f] !== actuel.fichiers[f]) o.push(`${f} : modifié depuis le gel`);
  }
  if (gel.lexique !== actuel.lexique) o.push('lexique par défaut : modifié depuis le gel');
  if (!o.length && gel.empreinte !== actuel.empreinte) o.push('empreinte globale différente');
  return o;
}

export function modeLexique({ back, geler, fichierGel }) {
  const lignes = [];
  let ok = true;
  // 1. Backend généré à jour.
  const sync = spawnSync(process.execPath, [path.join(ICI, 'sync-vocab-back.mjs'), '--check', '--back', back], { encoding: 'utf8' });
  const sortieSync = `${sync.stdout ?? ''}${sync.stderr ?? ''}`.trim();
  if (sync.status === 0) lignes.push('backend généré : à jour');
  else { ok = false; lignes.push(`backend généré : PÉRIMÉ ou introuvable (code ${sync.status})`, ...sortieSync.split('\n').map((l) => `  ${l}`)); }
  // 2. Vecteurs et lexiques d'essai : copie conforme dans le backend. Une fois le moteur gelé, la copie est due :
  //    son absence ferait passer les tests du backend sur un moteur que plus aucun vecteur ne juge.
  const gele = !geler && fs.existsSync(fichierGel);
  for (const nom of ['vocab-vecteurs.json', 'vocab-lexiques-test.json']) {
    const copie = path.join(back, 'test', nom);
    if (!fs.existsSync(copie)) {
      if (gele) { ok = false; lignes.push(`${nom} : copie ABSENTE du backend (test/${nom}) alors que le moteur est gelé`); }
      else lignes.push(`${nom} : pas encore de copie dans le backend (test/${nom})`);
      continue;
    }
    if (lf(fs.readFileSync(copie, 'utf8')) === lf(fs.readFileSync(path.join(ICI, nom), 'utf8'))) lignes.push(`${nom} : copie du backend identique`);
    else { ok = false; lignes.push(`${nom} : la copie du backend (test/${nom}) DIFFÈRE de scripts/${nom}`); }
  }
  // 3. Empreinte de gel.
  const actuel = empreinte();
  if (geler) {
    fs.writeFileSync(fichierGel, `${JSON.stringify({ ...actuel, gele_le: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
    lignes.push(`gel : empreinte ${actuel.empreinte.slice(0, 12)}… écrite dans ${fichierGel}`);
  } else if (!fs.existsSync(fichierGel)) {
    lignes.push(`gel : moteur et lexique pas encore gelés (empreinte ${actuel.empreinte.slice(0, 12)}… ; geler par « lexique --geler »)`);
  } else {
    const gel = JSON.parse(fs.readFileSync(fichierGel, 'utf8'));
    const changes = ecartsDeGel(gel, actuel);
    if (!changes.length) lignes.push(`gel : empreinte inchangée (${actuel.empreinte.slice(0, 12)}…, gelée le ${gel.gele_le ?? '?'})`);
    else { ok = false; lignes.push('gel : le moteur ou le lexique a CHANGÉ depuis le gel', ...changes.map((c) => `  ${c}`)); }
  }
  return { mode: 'lexique', ok, lignes, empreinte: actuel.empreinte };
}

// ═════════════════════════════════════════════════════════════════════════════
// Ligne de commande
// ═════════════════════════════════════════════════════════════════════════════

const USAGE = `usage : node scripts/vocab-check.mjs <identite|residuels|accords|inventaire|lexique> [options] [fichiers…]
  --root <dépôt>       dépôt analysé (défaut : ce dépôt ; le backend : --root ../fiche-technique-backend)
  --ensemble           identite : compare l'union des fichiers donnés (chaînes déplacées d'un fichier à l'autre)
  --base <ref>         référence git (défaut : contenu de <root>/scripts/vocab-check.base)
  --sans-allow         ignore scripts/vocab-allow/*.json
  --proposer-allow     imprime les entrées allow des écarts restants (type et justification à remplir)
  --json               résultat en JSON
  lexique : --geler (écrit l'empreinte), --fichier-gel <f> (défaut scripts/vocab-gel.json), --back <dossier>`;

function lireArguments(argv) {
  const o = { mode: argv[0], root: DEPOT_FRONT, ensemble: false, base: null, sansAllow: false, proposer: false, json: false, geler: false, fichierGel: null, back: null, fichiers: [] };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    const valeur = () => { i += 1; if (argv[i] === undefined) throw new Usage(`${a} : valeur manquante`); return argv[i]; };
    if (a === '--root') o.root = path.resolve(valeur());
    else if (a === '--ensemble') o.ensemble = true;
    else if (a === '--base') o.base = valeur();
    else if (a === '--sans-allow') o.sansAllow = true;
    else if (a === '--proposer-allow') o.proposer = true;
    else if (a === '--json') o.json = true;
    else if (a === '--geler') o.geler = true;
    else if (a === '--fichier-gel') o.fichierGel = path.resolve(valeur());
    else if (a === '--back') o.back = path.resolve(valeur());
    else if (a.startsWith('--')) throw new Usage(`option inconnue : ${a}`);
    else o.fichiers.push(a);
  }
  return o;
}

const guillemets = (s) => `« ${s} »`;

// Entrées allow employées par ce passage, et entrées du mode restées sans objet (à retirer : elles ne font
// pas échouer l'outil, mais une entrée qui ne sert plus n'a plus de raison d'être relue).
function rapportAllow(entrees, dire, mode, fichiers) {
  const employees = entrees.filter((e) => e.emplois > 0);
  if (employees.length) {
    const parType = {};
    for (const e of employees) parType[e.type] = (parType[e.type] ?? 0) + 1;
    dire(`  écarts admis (allow) : ${employees.length} entrée(s) — ${Object.entries(parType).map(([t, n]) => `${t} ${n}`).join(', ')}`);
    // Une entrée qui absorbe plusieurs unités est nommée : c'est elle qu'une revue doit relire en premier.
    for (const e of employees.filter((x) => x.emplois > 1)) dire(`    ${e.source} : ${e.emplois} unités absorbées — ${guillemets(e.apres ?? e.avant)}`);
  }
  const sansObjet = entrees.filter((e) => e.emplois === 0 && e.modes.includes(mode) && (!fichiers.length || fichiers.includes(e.fichier)));
  for (const e of sansObjet) dire(`  allow sans objet : ${e.source} (${e.fichier}) — ${guillemets(e.apres ?? e.avant)}`);
}

function main(argv) {
  const debut = process.hrtime.bigint();
  const o = lireArguments(argv);
  if (!o.mode || o.mode === '--help' || o.mode === '-h') { console.log(USAGE); return o.mode ? 0 : 2; }
  const duree = () => `${(Number(process.hrtime.bigint() - debut) / 1e9).toFixed(2).replace('.', ',')} s`;
  const dire = (s) => console.log(s);

  if (o.mode === 'lexique') {
    const back = o.back ?? path.resolve(process.env.LABFLOW_BACK || path.join(DEPOT_FRONT, '..', 'fiche-technique-backend'));
    const r = modeLexique({ back, geler: o.geler, fichierGel: o.fichierGel ?? path.join(ICI, 'vocab-gel.json') });
    if (o.json) dire(JSON.stringify(r, null, 2));
    else { r.lignes.forEach(dire); dire(`lexique : ${r.ok ? 'conforme' : 'NON CONFORME'} — ${duree()}`); }
    return r.ok ? 0 : 1;
  }
  if (!['identite', 'residuels', 'accords', 'inventaire'].includes(o.mode)) throw new Usage(`mode inconnu : ${o.mode}`);
  if (!fs.existsSync(path.join(o.root, 'src'))) throw new Usage(`${o.root} : pas de dossier src`);

  const fichiers = resoudreFichiers(o.root, o.fichiers);
  const allow = o.sansAllow ? { entrees: [], problemes: [] } : chargerAllow(path.join(o.root, 'scripts', 'vocab-allow'));
  if (allow.problemes.length) {
    console.error(`scripts/vocab-allow : ${allow.problemes.length} entrée(s) invalide(s)`);
    allow.problemes.forEach((p) => console.error(`  ${p}`));
    return 2;
  }
  const propositions = [];
  let r;

  if (o.mode === 'inventaire') {
    let base = null;
    try { base = lireBase(o.root, o.base); } catch { /* l'inventaire ne lit pas la référence */ }
    const inv = modeInventaire({ root: o.root, fichiers, base });
    dire(JSON.stringify(inv, null, 1));
    const s = inv.resume;
    console.error(`inventaire : ${s.fichiers} fichier(s), ${s.fichiersATerme} à terme ou à appel voc, ${s.candidates} unité(s) candidate(s), ${s.exclues} exclue(s) (contexte technique), ${s.unitesVoc} avec appel voc — ${duree()}`);
    return 0;
  }

  if (o.mode === 'identite') {
    r = modeIdentite({ root: o.root, fichiers, ensemble: o.ensemble, base: lireBase(o.root, o.base), entrees: allow.entrees });
    if (!o.json) {
      for (const g of r.groupes) {
        if (g.fichiers.length > 1) dire(`ENSEMBLE ${g.fichiers.join(' + ')}`);
        for (const p of g.paires) {
          const u = p.apres ?? p.avant;
          dire(`${u.fichier}:${u.l}${u.cle ? ` (${u.cle})` : ''}`);
          dire(`  avant : ${p.avant ? `${guillemets(p.avant.canon)}${p.apres ? `  (référence l. ${p.avant.l})` : ''}` : '(rien)'}`);
          dire(`  après : ${p.apres ? guillemets(p.apres.canon) : '(rien)'}`);
          propositions.push({ fichier: u.fichier, avant: p.avant?.canon ?? null, apres: p.apres?.canon ?? null, type: 'À CHOISIR', justification: '' });
        }
      }
      for (const e of r.erreurs) dire(`${e.fichier}:${e.l}  ERREUR ${e.message}`);
      r.infos.forEach((i) => dire(`  ${i}`));
      rapportAllow(allow.entrees, dire, o.mode, fichiers);
      dire(`identite : ${r.controles} fichier(s) comparé(s) à ${r.base.slice(0, 7)}${fichiers.length ? '' : `, ${r.inchanges} inchangé(s)`} — ${r.ecarts} écart(s), ${r.erreurs.length} erreur(s) — ${duree()}`);
    }
  } else if (o.mode === 'residuels') {
    r = modeResiduels({ root: o.root, fichiers, entrees: allow.entrees });
    if (!o.json) {
      for (const x of r.residuels) {
        dire(`${x.fichier}:${x.l}  [${x.termes.join(', ')}]  ${guillemets(x.texte)}`);
        propositions.push({ fichier: x.fichier, avant: x.texte, apres: x.texte, type: 'À CHOISIR', justification: '' });
      }
      const tries = Object.entries(r.parFichier).sort((a, b) => b[1] - a[1]);
      if (tries.length) { dire('— unités par fichier —'); tries.forEach(([f, n]) => dire(`${String(n).padStart(5)}  ${f}`)); }
      rapportAllow(allow.entrees, dire, o.mode, fichiers);
      dire(`residuels : ${r.controles} fichier(s), ${r.residuels.length} unité(s) dans ${tries.length} fichier(s) — ${duree()}`);
    }
  } else {
    r = modeAccords({ root: o.root, fichiers, entrees: allow.entrees });
    const sortie = path.join(o.root, 'scripts', 'vocab-accords.txt');
    const texte = texteAccords(r.miroir);
    // Le fichier partagé n'est réécrit que par un passage complet ; sur une liste de fichiers, le volet 2 est affiché.
    if (!fichiers.length && fs.existsSync(path.dirname(sortie))) fs.writeFileSync(sortie, texte);
    if (!o.json) {
      const signal = (s) => (s.position === 'apres' ? `« ${s.mot} » après ${s.appel}`
        : s.position === 'reprise' ? `pronom « ${s.mot} » qui reprend ${s.appel}`
          : `« ${s.mot} » devant ${s.variable ? `la variable « ${s.variable} » (${s.appel})` : s.appel}`);
      for (const s of r.signalements) {
        dire(`${s.fichier}:${s.l}  ${signal(s)}  ${guillemets(s.texte)}`);
        propositions.push({ fichier: s.fichier, avant: s.texte, apres: s.texte, type: 'À CHOISIR', justification: '', mode: 'accords' });
      }
      if (fichiers.length) dire(texte.trimEnd());
      rapportAllow(allow.entrees, dire, o.mode, fichiers);
      dire(`accords : ${r.controles} fichier(s), ${r.signalements.length} signalement(s) ; ${r.miroir.length} unité(s) à appel voc ${fichiers.length ? 'affichée(s) ci-dessus' : `écrite(s) dans ${posix(path.relative(o.root, sortie))}`} — ${duree()}`);
    }
  }

  if (o.json) dire(JSON.stringify(r, null, 1));
  else if (o.proposer && propositions.length) {
    const uniques = [...new Map(propositions.map((p) => [JSON.stringify(p), p])).values()];
    dire('— entrées allow proposées (choisir le type, écrire la justification, ranger dans scripts/vocab-allow/<lot>.json) —');
    dire(JSON.stringify(uniques, null, 2));
  }
  const provisoires = allow.entrees.filter((e) => e.type === 'provisoire').length;
  const besoins = compterBesoins(path.join(o.root, 'scripts', 'vocab-besoins'));
  if ((provisoires || besoins) && !o.json) {
    dire(`  rappel : ${provisoires} entrée(s) allow de type « provisoire », ${besoins} besoin(s) dans scripts/vocab-besoins (à ramener à 0 à l'étape S5)`);
  }
  return r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    if (e instanceof Usage) { console.error(`vocab-check : ${e.message}\n${USAGE}`); process.exitCode = 2; }
    else if (e && e.stderr && /^fatal:/m.test(String(e.stderr))) { console.error(`vocab-check : git a échoué — ${String(e.stderr).trim()}`); process.exitCode = 2; }
    else throw e;
  }
}
