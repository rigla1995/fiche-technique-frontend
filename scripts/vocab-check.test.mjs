// Tests de l'outil de preuve (lot 2, spec §2.5) — hors de `src`, donc hors de `tsc -b`.
//   node --test scripts/vocab-check.test.mjs        (Node ≥ 23.6 : exécute le TypeScript du moteur tel quel)
//
// 1. R1 : la règle des blancs JSX, comparée à ts.transpileModule ;
// 2. les 18 paires avant / après du prototype (labflow-reprise/lot-2/proto/cas-identite.mjs), au nom `voc` ;
// 3. chaque règle R1–R12 et la normalisation d'apostrophe : un cas conforme ET un cas qui doit échouer ;
// 4. modes residuels et accords, écarts admis (allow) ;
// 5. la ligne de commande de bout en bout, sur un dépôt git jetable (codes de sortie, --root, --ensemble,
//    fr.json, allow, inventaire) ; le mode lexique sur un faux backend jetable ;
// 6. lot 2b (spec docs/lot-2b-spec.md §3.2) : extensions serveur E1 à E9 et E11, cas positifs ET négatifs.
// Un cas « doit échouer » vérifie toujours QUEL écart l'outil signale, jamais seulement « pas conforme ».
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import {
  analyser, analyserFr, comparer, differences, texteJsx, factoriser, termesDans, chargerAllow,
  empreinte, ecartsDeGel, texteAccords, MOTS_ACCORD, ACCORDS_APRES, TYPES_ALLOW, TROU,
  // lot 2b (§3.2, E1 à E11)
  formesDans, lireSql, estCodeSql, fonctionsSqlDe, validerRendu, diffSquelette, ecrireAccords,
  CODES_SQL_CAPITALES, PERIMETRE_EN_PLUS, HORS_RESIDUELS, LOTS_REPORTE, RESIDUELS_EN_PLUS,
  // consolidation du lot 2b : besoins ouverts
  compterBesoins, ETAT_BESOIN_CLOS,
} from './vocab-check.mjs';
import { vocabDefaut } from '../src/vocab/vocab.ts';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const OUTIL = path.join(ICI, 'vocab-check.mjs');

// ── Aides ────────────────────────────────────────────────────────────────────
const jsx = (x) => `const C = () => (<>${x}</>);`;
const canons = (source, options) => analyser(source, 'x.tsx', options).unites.map((u) => u.canon);
const detail = (r) => [
  ...r.paires.map((p) => `\n  - ${p.avant?.canon ?? '(rien)'}\n  + ${p.apres?.canon ?? '(rien)'}`),
  ...r.erreurs.map((e) => `\n  ! ${e.message}`),
].join('');

function identique(avant, apres, options) {
  const r = comparer(avant, apres, options);
  assert.ok(r.ok, `attendu identique, écarts :${detail(r)}`);
  return r;
}
// L'outil DOIT signaler un écart, et celui-là : `moins` / `plus` = texte (ou motif) attendu côté avant / après.
function ecart(avant, apres, { moins, plus, erreur } = {}, options) {
  const r = comparer(avant, apres, options);
  assert.equal(r.ok, false, 'un écart devait être signalé');
  const contient = (liste, attendu, cote) => {
    const textes = liste.map((u) => u.canon);
    const trouve = attendu instanceof RegExp ? textes.some((t) => attendu.test(t)) : textes.includes(attendu);
    assert.ok(trouve, `écart « ${cote} » attendu : ${attendu}\nobtenu : ${JSON.stringify(textes)}`);
  };
  if (moins !== undefined) contient(r.moins, moins, 'avant');
  if (plus !== undefined) contient(r.plus, plus, 'après');
  if (erreur !== undefined) assert.ok(r.erreurs.some((e) => erreur.test(e.message)), `erreur attendue ${erreur}, obtenu ${JSON.stringify(r.erreurs.map((e) => e.message))}`);
  return r;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. R1 — blancs et entités JSX, contre le compilateur
// ═════════════════════════════════════════════════════════════════════════════

const CAS_JSX = [
  'Bonjour',
  '  Bonjour  ',
  '\n  Bonjour\n',
  '\n  Ligne un\n  ligne deux\n',
  'Début\n      suite',
  '\n\n  a\n\n  b\n\n',
  'a {x} b',
  '{x} {y}',
  '{x}\n  {y}',
  "texte{' '}\n  {x}",
  'a &amp; b',
  '(portion &gt; 0)',
  'a&nbsp;b',
  '&nbsp;\n  a',
  'a \n  b',
  '\n\t\tTabulations\t\n\t\tsuite\t\n',
  'fin de ligne   \n   début de ligne',
  'l&apos;activité &laquo; x &raquo; &hellip;',
  '&#233;t&#xe9;',
  'a\r\n  b\r\n',
  '  \n  ',
  ' ',
  'un {x}\n  deux {y} trois\n  quatre',
  '&inconnue; reste',
  'avant <strong>gras</strong> après\n  <em>x</em>\n  fin',
  '{x} mot\n  {y}\n  autre {z}',
];

// Textes que le compilateur passe à React pour les enfants de <p>…</p>.
function textesDuCompilateur(enfants) {
  const js = ts.transpileModule(`x = <p>${enfants}</p>;`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ESNext } }).outputText;
  const sf = ts.createSourceFile('s.js', js, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  let textes = null;
  (function cherche(n) {
    if (textes === null && ts.isCallExpression(n) && ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === 'p') {
      textes = n.arguments.slice(2).filter((a) => ts.isStringLiteral(a)).map((a) => a.text);
    } else ts.forEachChild(n, cherche);
  })(sf);
  return textes ?? [];
}
function textesDeLOutil(enfants, regle = texteJsx) {
  const sf = ts.createSourceFile('s.tsx', `x = <p>${enfants}</p>;`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const textes = [];
  (function cherche(n) {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText(sf) === 'p') {
      for (const c of n.children) {
        if (ts.isJsxText(c)) { const t = regle(c.text); if (t) textes.push(t); }
        else if (ts.isJsxExpression(c) && c.expression && ts.isStringLiteral(c.expression)) textes.push(c.expression.text);
      }
    } else ts.forEachChild(n, cherche);
  })(sf);
  return textes;
}

test('R1 : texteJsx donne exactement le texte que le compilateur passe à React', () => {
  assert.ok(CAS_JSX.length >= 20);
  for (const c of CAS_JSX) {
    assert.deepEqual(textesDeLOutil(c), textesDuCompilateur(c), `enfants JSX : ${JSON.stringify(c)}`);
  }
});

test('R1 : le jeu de cas distingue la vraie règle d\'une règle naïve (le test peut échouer)', () => {
  const naive = (s) => s.replace(/\s+/g, ' ').trim();
  const faux = CAS_JSX.filter((c) => JSON.stringify(textesDeLOutil(c, naive)) !== JSON.stringify(textesDuCompilateur(c)));
  assert.ok(faux.length >= 8, `la règle naïve ne se trompe que sur ${faux.length} cas`);
  const sansEntites = (s) => texteJsx(s.replace(/&/g, '&amp;'));
  assert.ok(CAS_JSX.some((c) => JSON.stringify(textesDeLOutil(c, sansEntites)) !== JSON.stringify(textesDuCompilateur(c))));
});

test('R1 : entités décodées, blancs de tête et de fin d\'une ligne unique conservés', () => {
  assert.equal(texteJsx('(portion &gt; 0)'), '(portion > 0)');
  assert.equal(texteJsx('a&nbsp;b'), 'a b');
  assert.equal(texteJsx(' mot '), ' mot ');
  assert.equal(texteJsx('\n   \n'), '');
  assert.deepEqual(canons(jsx('<p title="L&apos;activit&eacute;">x</p>')), ["L'activité", 'x']);
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Les 18 paires du prototype
// ═════════════════════════════════════════════════════════════════════════════

test('prototype 01 — gabarit nombre + pluriel > 1 → voc.n', () => {
  identique('summaryParts.push(`${nbArt} article${nbArt > 1 ? "s" : ""}`);', 'summaryParts.push(`${voc.n("article", nbArt)}`);');
  assert.deepEqual(canons('summaryParts.push(`${voc.n("article", nbArt)}`);'), [`${TROU} ⟦article|articles@>1⟧`]);
});

test('prototype 02 — JSX coupé par <strong> + suffixe de pluriel + participe', () => {
  identique(
    jsx('<li><strong>{historyCount}</strong> appro{(historyCount ?? 0) > 1 ? "s" : ""} supprimé{(historyCount ?? 0) > 1 ? "s" : ""}</li>'),
    jsx('<li><strong>{historyCount}</strong> {voc.court("appro", historyCount ?? 0)} supprimé{(historyCount ?? 0) > 1 ? "s" : ""}</li>'),
  );
});

test('prototype 03 — DOIT échouer : pluriel « !== 1 » remplacé par voc.nom(k, n) (pluriel « > 1 »)', () => {
  ecart(
    jsx('<div>{x.length} article{x.length !== 1 ? "s" : ""} valide{x.length !== 1 ? "s" : ""} (portion &gt; 0)</div>'),
    jsx('<div>{x.length} {voc.nom("article", x.length)} valide{x.length !== 1 ? "s" : ""} (portion &gt; 0)</div>'),
    { moins: `${TROU} ⟦article|articles@≠1⟧ ⟦valide|valides@≠1⟧ (portion > 0)`, plus: `${TROU} ⟦article|articles@>1⟧ ⟦valide|valides@≠1⟧ (portion > 0)` },
  );
  // La réécriture fidèle passe le test d'origine au moteur.
  identique(
    jsx('<div>{x.length} article{x.length !== 1 ? "s" : ""} valide{x.length !== 1 ? "s" : ""}</div>'),
    jsx('<div>{x.length} {voc.nom("article", x.length !== 1)} valide{x.length !== 1 ? "s" : ""}</div>'),
  );
});

test('prototype 04 — condition entre phrases → articles du moteur', () => {
  identique(
    jsx('<h2>🏭 {editLabo ? "Modifier le labo" : "Nouveau labo"}</h2>'),
    jsx('<h2>{voc.icon("labo")} {editLabo ? `Modifier ${voc.le("labo")}` : voc.Nouveau("labo")}</h2>'),
  );
});

test('prototype 05 — condition entre phrases → condition sur la clé (factorisation)', () => {
  identique(
    jsx('<h2>\n  {isDepot ? "Démarrez votre labo" : "Démarrez votre activité"}\n</h2>'),
    jsx('<h2>\n  Démarrez {voc.votre(isDepot ? "labo" : "activite")}\n</h2>'),
  );
});

test('prototype 06 — DOIT échouer : « Aucun activité » (faute d\'origine) corrigée par voc.Aucun → allow faute-corrigee', () => {
  ecart(
    jsx('<div>Aucun {isLabo ? "labo" : "activité"} disponible.</div>'),
    jsx('<div>{voc.Aucun(isLabo ? "labo" : "activite")} disponible.</div>'),
    { moins: 'Aucun ⟦?labo|activité⟧ disponible.', plus: '⟦?Aucun labo|Aucune activité⟧ disponible.' },
  );
});

test('prototype 07 — apostrophe typographique : normalisée, donc identique', () => {
  identique(
    'const x = ["activite", "🆓 Appros libres", "Géré dans l’activité, appros manuels possibles"];',
    'const x = ["activite", `🆓 ${voc.Court("appro", true)} libres`, `Géré dans ${voc.le("activite")}, ${voc.court("appro", true)} manuels possibles`];',
  );
});

test('prototype 08 — nom composé + suffixe conditionnel', () => {
  identique(
    jsx('<h1>\n  Stock Labo{labo ? ` — ${labo.nom}` : ""}</h1>'),
    jsx('<h1>\n  Stock {voc.Court("labo")}{labo ? ` — ${labo.nom}` : ""}</h1>'),
  );
});

test('prototype 09 — texte JSX + <strong> → article, accord, démonstratif', () => {
  identique(
    jsx('<li>Les activités liées à ce labo passeront en <strong>mode gestion séparée</strong>.</li>'),
    jsx('<li>{voc.Le("activite", 2)} {voc.acc("activite", "liés", "liées")} à {voc.ce("labo")} passeront en <strong>mode gestion séparée</strong>.</li>'),
  );
});

const P10_AVANT = jsx("<div>\n  Les activités assignées à ce labo ne sont pas encore configurées.\n  Pour pouvoir effectuer des transferts, assignez des articles aux activités\n  liées à ce labo depuis votre <strong>référentiel</strong> (fiche de l'article).\n</div>");

test('prototype 10 — DOIT échouer : espace perdue entre deux expressions JSX séparées par un saut de ligne', () => {
  const r = ecart(
    P10_AVANT,
    jsx('<div>\n  {voc.Le("activite", 2)} {voc.acc("activite", "assignés", "assignées")} à {voc.ce("labo")} ne sont pas encore configurées.\n  Pour pouvoir effectuer des {voc.pl("transfert")}, assignez des {voc.pl("article")} {voc.au("activite", 2)}\n  {voc.acc("activite", "liés", "liées")} à {voc.ce("labo")} depuis votre <strong>référentiel</strong> (fiche de {voc.le("article")}).\n</div>'),
    { plus: /aux activitésliées à ce labo/, moins: /aux activités liées à ce labo/ },
  );
  assert.equal(r.paires.length, 1);
});

test('prototype 10 bis — la même réécriture avec {\' \'} en fin de ligne est identique', () => {
  identique(
    P10_AVANT,
    jsx('<div>\n  {voc.Le("activite", 2)} {voc.acc("activite", "assignés", "assignées")} à {voc.ce("labo")} ne sont pas encore configurées.\n  Pour pouvoir effectuer des {voc.pl("transfert")}, assignez des {voc.pl("article")} {voc.au("activite", 2)}{" "}\n  {voc.acc("activite", "liés", "liées")} à {voc.ce("labo")} depuis votre <strong>référentiel</strong> (fiche de {voc.le("article")}).\n</div>'),
  );
});

test('prototype 11 — pluriel dans une table de libellés', () => {
  identique(
    'const t = [{ icon: "🏭", label: `Labo${breakdown.labo.nb > 1 ? "s" : ""}`, nb: 1 }];',
    'const t = [{ icon: "🏭", label: voc.Nom("labo", breakdown.labo.nb), nb: 1 }];',
  );
});

test('prototype 12 — table de libellés au niveau module → fonction de voc', () => {
  identique(
    'const TABS = [{ key: "labo", icon: "🧪", label: "Labo" }, { key: "acheteurs", icon: "🤝", label: "Acheteurs (B2B)" }];',
    'const tabs = (voc) => [{ key: "labo", icon: "🧪", label: voc.Nom("labo") }, { key: "acheteurs", icon: "🤝", label: `${voc.Pl("acheteur")} (B2B)` }];',
  );
});

test('prototype 13 — t(clé, défaut) → clé ajoutée à fr.json (valeur balisée) ; DOIT échouer : défaut balisé dans le .tsx', () => {
  const avant = jsx('<th>{t("client.entreprise.labo", "Labo")}</th>');
  // La clé est maintenant dans fr.json (valeur balisée) et le 2e argument a disparu — ou il est resté, mort.
  const fr = { frRef: new Map(), fr: new Map([['client.entreprise.labo', '[[Nom:labo]]']]) };
  identique(avant, jsx('<th>{t("client.entreprise.labo")}</th>'), fr);
  identique(avant, avant, fr);
  ecart(avant, jsx('<th>{t("client.entreprise.labo")}</th>'), { moins: 'Labo', plus: 'Labos' }, { frRef: new Map(), fr: new Map([['client.entreprise.labo', '[[Pl:labo]]']]) });
  // DOIT échouer : i18next ne rend PAS la balise d'une valeur par défaut — l'écran afficherait « [[Nom:labo]] ».
  const r = ecart(avant, jsx('<th>{t("client.entreprise.labo", "[[Nom:labo]]")}</th>'), { moins: 'Labo', plus: '[[Nom:labo]]', erreur: /balise \[\[Nom:labo\]\] dans un fichier source/ });
  assert.ok(r.erreurs.every((e) => e.toujours), 'erreur qu\'aucune entrée allow n\'éteint');
});

test('prototype 14 — DOIT échouer : variable intermédiaire recevant un appel voc (R10)', () => {
  const r = ecart(
    jsx('<h1>Stock Labo</h1>'),
    `const L = voc.Nom("labo");\n${jsx('<h1>Stock {L}</h1>')}`,
    { moins: 'Stock Labo', plus: `Stock ${TROU}`, erreur: /variable intermédiaire « L ».*R10/ },
  );
  assert.equal(r.erreurs[0].l, 1);
});

test('prototype 15 — texte + {\' \'} + bouton', () => {
  identique(
    jsx("<p>\n  Aucun labo créé.{' '}\n  <button>\n    Créer le premier labo\n  </button>\n</p>"),
    jsx('<p>\n  {voc.Aucun("labo")} {voc.acc("labo", "créé", "créée")}.{" "}\n  <button>\n    Créer le premier {voc.nom("labo")}\n  </button>\n</p>'),
  );
});

test('prototype 16 — accord en dur à côté d\'un appel voc : identique par défaut, mais DOIT être signalé par le mode accords', () => {
  const apres = jsx('<p>Aucun {voc.nom("labo")} créé.</p>');
  identique(jsx('<p>Aucun labo créé.</p>'), apres);
  const [u] = analyser(apres).unites;
  assert.deepEqual(u.accords.map((a) => [a.mot, a.position, a.methode, a.cle]), [['aucun', 'devant', 'nom', 'labo'], ['créé', 'apres', 'nom', 'labo']]);
  assert.equal(u.plat, 'Aucun labo créé.');
  assert.equal(u.miroir, 'Aucun usine créé.'); // la faute saute aux yeux avec le lexique miroir
  // La bonne écriture ne déclenche rien et s'accorde dans le miroir.
  const [v] = analyser(jsx('<p>{voc.Aucun("labo")} {voc.acc("labo", "créé", "créée")}.</p>')).unites;
  assert.deepEqual(v.accords, []);
  assert.equal(v.miroir, 'Aucune usine créée.');
});

test('prototype 17 — pluriel mot entier n > 1 ? \'Activités\' : \'Activité\'', () => {
  identique('const l = n > 1 ? "Activités" : "Activité";', 'const l = voc.Nom("activite", n);');
});

test('prototype 18 — DOIT échouer : « === 1 ? sg : pl » remplacé par voc.nom(k, n)', () => {
  ecart('const l = n === 1 ? "article" : "articles";', 'const l = voc.nom("article", n);',
    { moins: '⟦article|articles@≠1⟧', plus: '⟦article|articles@>1⟧' });
  identique('const l = n === 1 ? "article" : "articles";', 'const l = voc.nom("article", n !== 1);');
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Règle par règle
// ═════════════════════════════════════════════════════════════════════════════

test('R2 : toute expression non repliable est un trou ; voc.n = trou + pluriel conditionnel', () => {
  assert.deepEqual(canons('const a = `Total : ${fmt(x)} DT`;'), [`Total : ${TROU} DT`]);
  assert.deepEqual(canons('const a = `${voc.n("labo", nb)} actifs`;'), [`${TROU} ⟦labo|labos@>1⟧ actifs`]);
  assert.deepEqual(canons('const a = voc.n("labo", 3);'), ['3 labos']);
  assert.deepEqual(canons('const a = voc.n("labo", 1);'), ['1 labo']);
  // Un trou n'est pas un texte : une unité faite seulement de trous n'existe pas.
  assert.deepEqual(canons(jsx('<p>{a} {b}</p>')), []);
  // DOIT échouer : le nombre a disparu du texte.
  ecart('const a = `${n} labo${n > 1 ? "s" : ""}`;', 'const a = voc.nom("labo", n);', { moins: `${TROU} ⟦labo|labos@>1⟧`, plus: '⟦labo|labos@>1⟧' });
});

test('R3 : le suffixe de pluriel se rattache au mot qui précède', () => {
  assert.deepEqual(canons('const a = `${n} labo${n > 1 ? "s" : ""} actif${n > 1 ? "s" : ""}`;'), [`${TROU} ⟦labo|labos@>1⟧ ⟦actif|actifs@>1⟧`]);
  assert.deepEqual(canons('const a = `journ${n > 1 ? "aux" : "al"}`;'), ['⟦journal|journaux@>1⟧']);
  assert.deepEqual(canons('const a = `sous-produit${n > 1 ? "s" : ""}`;'), ['⟦sous-produit|sous-produits@>1⟧']);
  // Suffixe derrière une condition entre deux mots : il entre dans les deux branches.
  identique('const a = `${c ? "labo" : "activité"}${n > 1 ? "s" : ""}`;', 'const a = voc.nom(c ? "labo" : "activite", n);');
});

test('R3 : DOIT échouer — suffixe sans mot, et pluriel maison collé à un appel voc', () => {
  // Sans mot devant (trou) : jeton d'erreur, visible dès que l'unité n'a plus d'équivalent.
  assert.match(canons('const a = `${libelle}${n > 1 ? "s" : ""} actifs`;')[0], /⟦ERREUR:suffixe de pluriel sans mot\|s@>1⟧ actifs/);
  // Une construction d'origine, laissée telle quelle dans un fichier modifié AILLEURS, n'est pas une erreur.
  const suffixeOrigine = 'const a = `${libelle}${n > 1 ? "s" : ""} actifs`;\nconst b = "Stock labo";';
  const inchange = identique(suffixeOrigine, suffixeOrigine.replace('"Stock labo"', '`Stock ${voc.nom("labo")}`'));
  assert.deepEqual(inchange.erreurs, []);
  ecart('const a = `${libelle}${n > 1 ? "s" : ""} actif`;', 'const a = `${libelle}${n > 1 ? "s" : ""} actifs`;', { erreur: /suffixe de pluriel « s » sans mot/ });
  // « {voc.nom('labo')}{n > 1 ? 's' : ''} » rend bien « labos » par défaut, mais « cuisine centrales » ailleurs.
  const r = comparer(jsx('<p>{n} labo{n > 1 ? "s" : ""}</p>'), jsx('<p>{n} {voc.nom("labo")}{n > 1 ? "s" : ""}</p>'));
  assert.equal(r.ok, false);
  assert.ok(r.erreurs.some((e) => e.type === 'pluriel-maison'), JSON.stringify(r.erreurs));
  // Même faute écrite en toutes lettres : « {voc.nom('labo')}s ».
  const s = comparer(jsx('<p>Vos labos</p>'), jsx('<p>Vos {voc.nom("labo")}s</p>'));
  assert.equal(s.ok, false);
  assert.ok(s.erreurs.some((e) => e.type === 'collage'), JSON.stringify(s.erreurs));
  assert.deepEqual(s.moins, [], 'le texte rendu est identique : seul le collage est en cause');
});

test('R4 : le jeton de pluriel porte la règle du test', () => {
  const jeton = (testNombre) => canons(`const a = ${testNombre} ? "labos" : "labo";`)[0];
  for (const t of ['n > 1', 'n >= 2', '1 < n', '2 <= n', '(liste.length ?? 0) > 1']) assert.equal(jeton(t), '⟦labo|labos@>1⟧', t);
  for (const t of ['n !== 1', 'n != 1']) assert.equal(jeton(t), '⟦labo|labos@≠1⟧', t);
  const inverse = (testNombre) => canons(`const a = ${testNombre} ? "labo" : "labos";`)[0];
  for (const t of ['n === 1', 'n == 1']) assert.equal(inverse(t), '⟦labo|labos@≠1⟧', t);
  for (const t of ['n <= 1', 'n < 2']) assert.equal(inverse(t), '⟦labo|labos@>1⟧', t);
  // Tout autre test est une condition ordinaire (R6).
  for (const t of ['n > 0', 'n > 2', 'actif', 'n === 0']) assert.equal(jeton(t), '⟦?labos|labo⟧', t);
  // voc.nom(k, n) : nombre → « > 1 » ; booléen → la règle de l'expression.
  assert.deepEqual(canons('const a = voc.nom("labo", n);'), ['⟦labo|labos@>1⟧']);
  assert.deepEqual(canons('const a = voc.nom("labo", liste.length);'), ['⟦labo|labos@>1⟧']);
  assert.deepEqual(canons('const a = voc.nom("labo", n > 1);'), ['⟦labo|labos@>1⟧']);
  assert.deepEqual(canons('const a = voc.nom("labo", n >= 2);'), ['⟦labo|labos@>1⟧']);
  assert.deepEqual(canons('const a = voc.nom("labo", n !== 1);'), ['⟦labo|labos@≠1⟧']);
  assert.deepEqual(canons('const a = voc.nom("labo", n > 0);'), ['⟦?labos|labo⟧']);
  assert.deepEqual(canons('const a = voc.nom("labo", true);'), ['labos']);
  assert.deepEqual(canons('const a = voc.nom("labo", 0);'), ['labo']);
  // Un test nommé une seule fois dans le fichier garde sa règle.
  assert.deepEqual(canons('const plusieurs = n !== 1;\nconst a = voc.nom("labo", plusieurs);'), ['⟦labo|labos@≠1⟧']);
  identique('const pluriel = n !== 1;\nconst a = `labo${pluriel ? "s" : ""}`;', 'const pluriel = n !== 1;\nconst a = voc.nom("labo", pluriel);');
  // Un nom déclaré deux fois (ici aussi comme paramètre) n'est pas suivi : il vaut un nombre.
  assert.deepEqual(canons('const plusieurs = n !== 1;\nconst f = (plusieurs) => voc.nom("labo", plusieurs);'), ['⟦labo|labos@>1⟧']);
});

test('R4 : DOIT échouer — « !== 1 » et « > 1 » sont deux jetons différents, dans les deux sens', () => {
  ecart('const a = `labo${n !== 1 ? "s" : ""}`;', 'const a = `labo${n > 1 ? "s" : ""}`;', { moins: '⟦labo|labos@≠1⟧', plus: '⟦labo|labos@>1⟧' });
  ecart('const a = `labo${n > 1 ? "s" : ""}`;', 'const a = voc.nom("labo", n !== 1);', { moins: '⟦labo|labos@>1⟧', plus: '⟦labo|labos@≠1⟧' });
  ecart('const a = `labo${n !== 1 ? "s" : ""}`;', 'const a = voc.nom("labo", n);', { moins: '⟦labo|labos@≠1⟧', plus: '⟦labo|labos@>1⟧' });
  // Branches inversées sans inverser le test : le singulier et le pluriel sont échangés.
  ecart('const a = n > 1 ? "labos" : "labo";', 'const a = n > 1 ? "labo" : "labos";', { moins: '⟦labo|labos@>1⟧', plus: '⟦labos|labo@>1⟧' });
});

test('R5 : pluriel multi-mots aligné mot à mot', () => {
  identique('const a = `produit${n > 1 ? "s" : ""} vendable${n > 1 ? "s" : ""}`;', 'const a = voc.nom("produit_vendable", n);');
  assert.deepEqual(canons('const a = voc.nom("produit_vendable", n);'), ['⟦produit|produits@>1⟧ ⟦vendable|vendables@>1⟧']);
  // Un mot invariable reste du texte ; un déterminant s'aligne comme un mot.
  assert.deepEqual(canons('const a = voc.nom("activite_desc", n);'), ['⟦point|points@>1⟧ de vente']);
  identique('const a = n > 1 ? "les labos" : "le labo";', 'const a = voc.le("labo", n);');
  identique('const a = `${n > 1 ? "les" : "le"} labo${n > 1 ? "s" : ""}`;', 'const a = voc.le("labo", n);');
  // Nombre de mots différent (élision) : un seul jeton.
  assert.deepEqual(canons('const a = voc.le("activite", n);'), ["⟦l'activité|les activités@>1⟧"]);
  identique('const a = n > 1 ? "les activités" : "l\'activité";', 'const a = voc.le("activite", n);');
  // DOIT échouer : un seul des deux mots prend le pluriel.
  ecart('const a = `produit${n > 1 ? "s" : ""} vendable`;', 'const a = voc.nom("produit_vendable", n);',
    { moins: '⟦produit|produits@>1⟧ vendable', plus: '⟦produit|produits@>1⟧ ⟦vendable|vendables@>1⟧' });
});

test('R6 : conditions imbriquées, distribution de la clé, factorisation par mots entiers', () => {
  assert.deepEqual(factoriser('Modifier le labo', 'Nouveau labo'), ['', 'Modifier le', 'Nouveau', ' labo']);
  assert.deepEqual(factoriser('le labo', 'le laboratoire'), ['le ', 'labo', 'laboratoire', '']);
  assert.deepEqual(factoriser('même', 'même'), ['même', '', '', '']);
  // Six branches (ProductList.tsx:892).
  const avant = 'const a = ok ? (edit ? "✅ Produit modifié" : "✅ Produit créé") : (edit ? "Modifier le " : "Nouveau ") + (sup ? "supplément vendable" : util ? "produit utilisable" : "produit vendable");';
  assert.deepEqual(canons(avant), ['⟦?✅ Produit ⟦?modifié|créé⟧|⟦?Modifier le|Nouveau⟧ ⟦?supplément vendable|produit ⟦?utilisable|vendable⟧⟧⟧']);
  // La clé conditionnelle est distribuée, puis le commun est sorti de la condition.
  identique('const a = c ? "Stock labo" : "Stock activité";', 'const a = `Stock ${voc.nom(c ? "labo" : "activite")}`;');
  identique('const a = c ? "du labo" : "de l\'activité";', 'const a = voc.du(c ? "labo" : "activite");');
  identique('const a = x === 1 ? "le labo" : x === 2 ? "l\'activité" : "le dépôt";', 'const a = voc.le(x === 1 ? "labo" : x === 2 ? "activite" : "depot");');
  // Texte sorti de la condition ou rentré dedans : même forme canonique.
  identique('const a = c ? "le labo central" : "le labo";', 'const a = `le labo${c ? " central" : ""}`;');
  // Branche vide, repli « || » et « && ».
  assert.deepEqual(canons('const a = `Stock${labo ? ` — ${labo.nom}` : ""}`;'), [`Stock⟦? — ${TROU}|⟧`]);
  assert.deepEqual(canons('const a = x.nom || "Sans nom";'), [`⟦?${TROU}|Sans nom⟧`]);
  assert.deepEqual(canons(jsx('<p>{plein && "Complet"}</p>')), ['⟦?Complet|⟧']);
});

test('R6 : DOIT échouer — branches inversées, texte changé dans une seule branche', () => {
  ecart('const a = c ? "Activer" : "Désactiver";', 'const a = c ? "Désactiver" : "Activer";', { moins: '⟦?Activer|Désactiver⟧', plus: '⟦?Désactiver|Activer⟧' });
  ecart('const a = c ? "Stock labo" : "Stock activité";', 'const a = `Stock ${voc.nom(c ? "labo" : "article")}`;', { moins: 'Stock ⟦?labo|activité⟧', plus: 'Stock ⟦?labo|article⟧' });
  ecart('const a = c ? "Stock labo" : "Stock activité";', 'const a = `Stock ${voc.nom(c ? "activite" : "labo")}`;', { plus: 'Stock ⟦?activité|labo⟧' });
});

test('R7 : un élément enfant est un marqueur dans son parent et une unité à part', () => {
  assert.deepEqual(canons(jsx('<p>Les <strong>labos</strong> actifs <br/> ici</p>')), ['Les ⟦<strong>⟧ actifs ⟦<br/>⟧ ici', 'labos']);
  identique(jsx('<p>Les <strong>labos</strong> actifs</p>'), jsx('<p>Les <strong>{voc.pl("labo")}</strong> actifs</p>'));
  // Un élément dans une branche de condition.
  assert.deepEqual(canons(jsx('<p>{vide ? <em>Aucun labo</em> : "Des labos"}</p>')), ['⟦?⟦<em>⟧|Des labos⟧', 'Aucun labo']);
  // DOIT échouer : le texte quitte la balise, ou la balise change.
  ecart(jsx('<p>Les <strong>labos</strong> actifs</p>'), jsx('<p>Les labos <strong>actifs</strong></p>'), { moins: 'Les ⟦<strong>⟧ actifs', plus: 'Les labos ⟦<strong>⟧' });
  ecart(jsx('<p>Les <strong>labos</strong> actifs</p>'), jsx('<p>Les <em>labos</em> actifs</p>'), { moins: 'Les ⟦<strong>⟧ actifs', plus: 'Les ⟦<em>⟧ actifs' });
});

// Les balises ne sont rendues que là où quelque chose les rend à l'exécution : fr.json (rendreTout) et les
// messages du serveur (fichiers .js, rendu au bord). Les cas R8 se jouent donc sur un fichier `x.js`.
const canonsJs = (source) => analyser(source, 'x.js', { t: false }).unites.map((u) => u.canon);
const JS = { nom: 'x.js', t: false };
// E2 (lot 2b) : au serveur, une balise n'est rendue qu'à un point de rendu — ici, le message d'une réponse JSON.
const msg = (lit) => `res.json({ message: ${lit} });`;

test('R8 : les balises [[…]] sont rendues dans les littéraux du serveur (.js) et dans fr.json', () => {
  assert.deepEqual(canonsJs(msg('"Aucun [[nom:labo]] créé"')), ['Aucun labo créé']);
  assert.deepEqual(canonsJs(msg('`[[Le:activite:pl]] de ${x}`')), [`Les activités de ${TROU}`]);
  assert.deepEqual(canonsJs(msg('"[[acc:activite:lié:liée:pl]]"')), ['liées']);
  identique('res.status(400).json({ message: "Labo introuvable" });', 'res.status(400).json({ message: "[[Nom:labo]] introuvable" });', JS);
  // fr.json : valeur balisée rendue avec le lexique par défaut.
  const fr = analyserFr('{ "nav": { "activites": "[[Mon:activite:pl]]", "x": "Stock [[Court:labo]]" } }');
  assert.deepEqual(fr.unites.map((u) => [u.cle, u.canon]), [['nav.activites', 'Mes activités'], ['nav.x', 'Stock Labo']]);
  // Une valeur de fr.json lue par t('clé') dans un .tsx est bien rendue : c'est fr.json qui porte la balise.
  assert.deepEqual(canons(jsx('<p>{t("nav.x")}</p>'), { fr: new Map([['nav.x', 'Stock [[Court:labo]]']]) }), ['Stock Labo']);
});

test('R8 : DOIT échouer — balise invalide, clé inconnue, mauvaise balise', () => {
  ecart(msg('"Aucun labo"'), msg('"Aucun [[nomm:labo]]"'), { plus: 'Aucun [[nomm:labo]]', erreur: /balise invalide \[\[nomm:labo\]\]/ }, JS);
  ecart(msg('"Aucun labo"'), msg('"Aucun [[nom:laboo]]"'), { erreur: /clé de lexique inconnue « laboo »/ }, JS);
  ecart(msg('"Aucun labo"'), msg('"Aucun [[Nom:labo]]"'), { moins: 'Aucun labo', plus: 'Aucun Labo' }, JS);
  const fr = analyserFr('{ "a": "[[nom:labo:zzz]]" }');
  assert.match(fr.erreurs[0].message, /balise invalide/);
});

test('R8 : DOIT échouer — une balise écrite dans un fichier source du front (.ts / .tsx) n\'est jamais rendue', () => {
  // Attribut, message, valeur par défaut de t(), gabarit, texte JSX : l'écran afficherait la balise telle quelle.
  const cas = [
    [jsx('<input placeholder="Nom du labo" />'), jsx('<input placeholder="Nom [[du:labo]]" />'), 'Nom du labo', 'Nom [[du:labo]]', 'x.tsx'],
    ['setError("Labo introuvable");', 'setError("[[Nom:labo]] introuvable");', 'Labo introuvable', '[[Nom:labo]] introuvable', 'x.ts'],
    [jsx('<th>{t("x.absente", "Stock Labo")}</th>'), jsx('<th>{t("x.absente", "Stock [[Court:labo]]")}</th>'), 'Stock Labo', 'Stock [[Court:labo]]', 'x.tsx'],
    ['const a = `Stock du labo ${n}`;', 'const a = `Stock [[du:labo]] ${n}`;', `Stock du labo ${TROU}`, `Stock [[du:labo]] ${TROU}`, 'x.ts'],
    [jsx('<p>Aucun labo</p>'), jsx('<p>[[Aucun:labo]]</p>'), 'Aucun labo', '[[Aucun:labo]]', 'x.tsx'],
  ];
  for (const [avant, apres, moins, plus, nom] of cas) {
    const r = ecart(avant, apres, { moins, plus, erreur: /dans un fichier source : une balise n'est rendue que dans fr\.json/ }, { nom });
    assert.ok(r.erreurs.some((e) => e.type === 'balise-source' && e.toujours), apres);
  }
  // L'erreur est levée même si l'unité existait déjà sous cette forme (rien ne l'éteint).
  const deja = comparer(jsx('<p title="[[Nom:labo]]">x</p>'), jsx('<p title="[[Nom:labo]]">x</p>'));
  assert.equal(deja.ok, false);
  assert.deepEqual([deja.moins.length, deja.plus.length], [0, 0]);
  // Les autres modes ne prennent pas la balise pour un appel voc : le terme reste « en dur », aucune ligne miroir.
  const [u] = analyser(jsx('<p>Aucun [[nom:labo]]</p>')).unites;
  assert.deepEqual([u.termes, u.voc, u.accords, u.miroir], [['labo'], [], [], undefined]);
  // Deux crochets qui ne forment pas une balise ne sont pas une erreur.
  identique('const a = "[[ x";', 'const a = "[[ x"; const m = [[1, 2]];');
});

test('R9 : les appels voc sont rendus par le vrai moteur, pour chaque méthode', () => {
  const appels = [
    ['nom("labo")'], ['Nom("produit_vendable")'], ['Titre("produit_vendable", true)'], ['MAJ("labo")'], ['pl("activite")'], ['Pl("labo")'],
    ['court("pt")'], ['Court("appro", true)'], ['nomS("produit_vendable")'], ['NomS("labo")'], ['compl("labo")'], ['compl("vente")'],
    ['avecCourt("pt", true)'], ['le("activite")'], ['Le("labo", true)'], ['un("activite")'], ['Un("labo")'], ['du("vente")'], ['Du("activite")'],
    ['de("activite", true)'], ['De("acheteur", true, "Nom")'], ['au("activite")'], ['Au("labo", 2)'], ['ce("article")'], ['Ce("activite")'],
    ['aucun("activite")'], ['Aucun("labo", "Nom")'], ['votre("labo", true)'], ['Votre("activite")'], ['mon("vente")'], ['Mon("activite")'],
    ['son("vente")'], ['Son("labo", true)'], ['nouveau("article")'], ['Nouveau("activite")'], ['tous("labo")'], ['Tous("activite", "vos")'],
    ['acc("activite", "lié", "liée")'], ['acc("labo", "lié", "liée", true)'], ['icon("labo")'], ['le("appro", false, "court")'],
    // Compléments de l'étape S4 : déterminant seul, « tous » sans déterminant, sigle PU.
    ['det("stock", "du")'], ['det("activite", "le")'], ['Det("activite", "le", true)'], ['det("appro", "le", false, "court")'],
    ['Tous("prestataire", "")'], ['Court("produit_utilisable")'], ['un("produit_utilisable", false, "Court")'],
  ];
  for (const [a] of appels) {
    // eslint-disable-next-line no-new-func
    const attendu = new Function('voc', `return voc.${a};`)(vocabDefaut);
    assert.deepEqual(canons(`const a = voc.${a};`), [attendu], `voc.${a}`);
  }
  // `req.voc` (backend) et mini-vocabulaire voc.avec({…}).
  assert.deepEqual(canons('const m = req.voc.Le("activite");', { t: false }), ["L'activité"]);
  assert.deepEqual(canons('const m = voc.avec({ sg: "Salle", pl: "Salles", g: "f", el: false }).mon("_");'), ['ma salle']);
  assert.deepEqual(canons('const m = `${voc.avec(composant).mon("_")} ici`;'), [`${TROU} ici`]);
  // Le genre n'est pas un texte.
  assert.deepEqual(canons('const m = `${voc.g("labo")} x`;'), [`${TROU} x`]);
});

test('R9 : voc.det — déterminant séparé du terme par une balise (étape S4)', () => {
  // « du <strong>stock labo</strong> » : le déterminant sort du moteur, la balise ne bouge pas.
  const avant = jsx('<p>Cette action modifiera les valeurs du <strong>stock labo</strong>. Vérifiez.</p>');
  const apres = jsx('<p>Cette action modifiera les valeurs {voc.det("stock", "du")}<strong>{voc.nom("stock")} {voc.compl("labo")}</strong>. Vérifiez.</p>');
  identique(avant, apres);
  assert.deepEqual(canons(apres), ['Cette action modifiera les valeurs du ⟦<strong>⟧. Vérifiez.', 'stock labo']);
  // Élision : pas d'espace après l'apostrophe ; pluriel conditionnel : le nombre passe au moteur.
  identique(jsx('<p>Supprimer l\'<b>activité</b> ?</p>'), jsx('<p>Supprimer {voc.det("activite", "le")}<b>{voc.nom("activite")}</b> ?</p>'));
  identique(jsx('<p>{n > 1 ? "les" : "le"} <b>labo{n > 1 ? "s" : ""}</b></p>'), jsx('<p>{voc.det("labo", "le", n)}<b>{voc.nom("labo", n)}</b></p>'));
  assert.deepEqual(canons('const a = voc.det("labo", "le", n);'), ['⟦le|les@>1⟧ ']);
  // Le mode accords ne signale ni le déterminant rendu par le moteur, ni le terme qui le suit dans la balise.
  const u = analyser(apres).unites;
  assert.deepEqual(u.flatMap((x) => x.accords), []);
  assert.equal(u[0].miroir, 'Cette action modifiera les valeurs de l\'<strong>armoire de l\'usine</strong>. Vérifiez.');
  // … alors que le déterminant laissé en dur devant la balise est signalé.
  const dur = analyser(jsx('<p>Les valeurs du <strong>{voc.nom("stock")}</strong>.</p>')).unites;
  assert.deepEqual(dur.flatMap((x) => x.accords).map((s) => [s.mot, s.methode, s.cle]), [['du', 'nom', 'stock']]);
  // Un mot écrit derrière voc.det n'est pas un « pluriel maison » ; derrière voc.nom, il le reste.
  assert.ok(comparer(jsx('<p>le futur labo</p>'), jsx('<p>{voc.det("labo", "le")}futur {voc.nom("labo")}</p>')).ok);
  assert.ok(comparer(jsx('<p>labos</p>'), jsx('<p>{voc.nom("labo")}s</p>')).erreurs.some((e) => e.type === 'collage'));
  // DOIT échouer : mauvais déterminant, déterminant inconnu (le moteur rend une chaîne vide), argument non littéral.
  ecart(avant, apres.replace('"du"', '"le"'), { moins: 'Cette action modifiera les valeurs du ⟦<strong>⟧. Vérifiez.', plus: 'Cette action modifiera les valeurs le ⟦<strong>⟧. Vérifiez.' });
  ecart(avant, apres.replace('"du"', '"quel"'), { plus: 'Cette action modifiera les valeurs ⟦<strong>⟧. Vérifiez.' });
  ecart(avant, apres.replace('"du"', 'lequel'), { erreur: /voc\.det : argument n° 2 non littéral/ });
});

test('R9 : extension de l\'étape S5 — voc.accN (termes coordonnés), forme courte de MAJ / nomS / NomS, clé article_ingredient', () => {
  // accN : le participe accordé avec DEUX termes sort du moteur ; par défaut (activité f + labo m) il reste au masculin.
  const avant = jsx('<label>Activités &amp; labos assignés</label>');
  const apres = jsx('<label>{voc.Pl("activite")} &amp; {voc.pl("labo")} {voc.accN(["activite", "labo"], "assignés", "assignées")}</label>');
  identique(avant, apres);
  assert.deepEqual(canons(apres), ['Activités & labos assignés']);
  identique(jsx('<p>Aucune activité ni labo configuré.</p>'), jsx('<p>{voc.Aucun("activite")} ni {voc.nom("labo")} {voc.accN(["activite", "labo"], "configuré", "configurée")}.</p>'));
  identique('const a = "Ventes et marges calculées";', 'const a = `${voc.Pl("vente")} et ${voc.pl("marge")} ${voc.accN(["vente", "marge"], "calculé", "calculée", true)}`;');
  // Trois termes, nombre conditionnel : le pluriel suit la règle du test (R4), comme voc.acc.
  identique(jsx('<li>Stock, inventaires et pertes supprimés</li>'), jsx('<li>{voc.Nom("stock")}, {voc.pl("inventaire")} et {voc.pl("perte")} {voc.accN(["stock", "inventaire", "perte"], "supprimés", "supprimées")}</li>'));
  assert.deepEqual(canons('const a = voc.accN(["vente", "marge"], "liée", "liée", n);'), ['⟦liée|liées@>1⟧']);
  // Le mode accords ne signale rien, et le miroir montre l'accord réel (usine f + local m → masculin ; denrée f + invention f → féminin).
  const u = analyser(apres).unites;
  assert.deepEqual(u.flatMap((x) => x.accords), []);
  assert.equal(u[0].miroir, 'Locaux & usines assignés');
  const deuxF = analyser(jsx('<p>2 {voc.pl("article")}/{voc.pl("produit_utilisable")} {voc.accN(["article", "produit_utilisable"], "requis", "requises")}</p>')).unites;
  assert.equal(deuxF[0].miroir, '2 denrées/inventions utiles requises');
  assert.deepEqual(deuxF.flatMap((x) => x.accords), []);
  // … alors que le participe laissé en dur derrière le second terme reste signalé.
  assert.deepEqual(signalements(phrase("{voc.Aucun('activite')} ni {voc.nom('labo')} configuré.")), ['configuré/apres nom:labo']);
  // voc.accN prolonge le groupe, comme voc.acc : le mot en dur qui le suit s'accorde encore avec le terme nommé avant.
  assert.deepEqual(signalements(phrase("{voc.Pl('vente')} et {voc.pl('marge')} {voc.accN(['vente', 'marge'], 'calculées', 'calculées')} manuelles")), ['manuelles/apres pl:marge']);
  // DOIT échouer : mauvais accord, liste non littérale, une seule clé (c'est voc.acc), clé inconnue, forme non littérale.
  ecart(avant, apres.replace('"assignés", "assignées"', '"assignées", "assignés"'), { moins: 'Activités & labos assignés', plus: 'Activités & labos assignées' });
  ecart(avant, apres.replace('["activite", "labo"]', 'cles'), { erreur: /voc\.accN : le 1er argument est une liste d'au moins deux clés littérales/ });
  ecart(avant, apres.replace('["activite", "labo"]', '"activite"'), { erreur: /voc\.accN : le 1er argument est une liste/ });
  ecart(avant, apres.replace('["activite", "labo"]', '["activite"]'), { erreur: /au moins deux clés littérales/ });
  ecart(avant, apres.replace('["activite", "labo"]', '["activite", cle]'), { erreur: /au moins deux clés littérales/ });
  ecart(avant, apres.replace('["activite", "labo"]', '["activite", "laboratoire"]'), { erreur: /clé de lexique inconnue/ });
  ecart(avant, apres.replace('"assignées")', 'fem)'), { erreur: /voc\.accN : argument n° 3 non littéral/ });

  // Forme courte : identique par défaut (« labo » n'a pas de forme courte), distincte au miroir (« Abr-… »).
  identique('const a = "Ex: LABO-001";', 'const a = `Ex: ${voc.MAJ("labo", false, "court")}-001`;');
  identique(jsx('<label>Labo(s) de fabrication</label>'), jsx('<label>{voc.NomS("labo", "Court")} de fabrication</label>'));
  identique(jsx('<p>le/les labo(s) de fabrication</p>'), jsx('<p>{voc.acc("labo", "le/les", "la/les")} {voc.nomS("labo", "court")} de fabrication</p>'));
  assert.equal(analyser(jsx('<label>{voc.NomS("labo", "Court")} de fabrication</label>')).unites[0].miroir, 'Abr-Usine(s) de fabrication');
  assert.equal(analyser(jsx('<label>{voc.NomS("labo")} de fabrication</label>')).unites[0].miroir, 'Usine(s) de fabrication');
  assert.equal(analyser('const a = `Ex: ${voc.MAJ("labo", false, "court")}-001`;').unites[0].miroir, 'Ex: ABR-USINE-001');
  ecart('const a = "Ex: LABO-001";', 'const a = `Ex: ${voc.MAJ("labo", false, casse)}-001`;', { erreur: /voc\.MAJ : argument n° 3 non littéral/ });

  // Clé dérivée article_ingredient : « Ingrédient » par défaut (identité avec la clé ingredient), « Denrée » → « Provision » au miroir.
  identique(jsx('<th>Ingrédient</th>'), jsx('<th>{voc.Nom("article_ingredient")}</th>'));
  identique(jsx('<p>Aucun ingrédient trouvé.</p>'), jsx('<p>{voc.Aucun("article_ingredient")} {voc.acc("article_ingredient", "trouvé", "trouvée")}.</p>'));
  assert.equal(analyser(jsx('<p>{voc.Aucun("article_ingredient")} {voc.acc("article_ingredient", "trouvé", "trouvée")}.</p>')).unites[0].miroir, 'Aucune provision trouvée.');
});

test('R9 : DOIT échouer — clé non littérale, clé inconnue, méthode inconnue, argument non littéral, voc dans du SQL', () => {
  ecart(jsx('<p>Stock {nom}</p>'), jsx('<p>Stock {voc.nom(cle)}</p>'), { erreur: /voc\.nom : clé non littérale/ });
  ecart('const a = "Stock labo";', 'const a = `Stock ${voc.nom(CLES[i])}`;', { erreur: /clé non littérale/ });
  ecart('const a = "Stock labo";', 'const a = `Stock ${voc.nom(c ? "labo" : autre)}`;', { erreur: /clé non littérale/ });
  ecart('const a = "Stock labo";', 'const a = `Stock ${voc.nom("laboratoire")}`;', { erreur: /clé de lexique inconnue/ });
  ecart('const a = "Stock labo";', 'const a = `Stock ${voc.nomme("labo")}`;', { erreur: /méthode voc inconnue « nomme »/ });
  ecart('const a = "le Labo";', 'const a = voc.le("labo", false, casse);', { erreur: /argument n° 3 non littéral/ });
  ecart('const a = "liée";', 'const a = voc.acc("activite", masc, "liée");', { erreur: /argument n° 2 non littéral/ });
  // Une erreur du moteur est signalée même si l'unité remplace un simple trou.
  const r = comparer(jsx('<p>{libelle}</p>'), jsx('<p>{voc.nom(cle)}</p>'));
  assert.equal(r.ok, false);
  // Jamais d'appel voc dans une requête SQL.
  const sql = comparer('await pool.query(`SELECT \'Labo\' AS site FROM labos`);', 'await pool.query(`SELECT \'${voc.Nom("labo")}\' AS site FROM labos`);', { nom: 'x.js', t: false });
  assert.deepEqual(sql.moins, []);
  assert.ok(sql.erreurs.some((e) => e.type === 'sql'), JSON.stringify(sql.erreurs));
});

test('R10 : une variable qui existait déjà n\'est pas une erreur ; une variable intermédiaire nouvelle en est une', () => {
  identique('const titre = "Stock Labo";\nconst C = () => <h1>{titre}</h1>;', 'const titre = `Stock ${voc.Court("labo")}`;\nconst C = () => <h1>{titre}</h1>;');
  identique('const nom = "Labo";\nconst C = () => <h1>Stock {nom}</h1>;', 'const nom = voc.Nom("labo");\nconst C = () => <h1>Stock {nom}</h1>;');
  ecart('const C = () => <h1>Stock Labo — {x}</h1>;', 'const lab = voc.Nom("labo");\nconst C = () => <h1>Stock {lab} — {x}</h1>;',
    { moins: `Stock Labo — ${TROU}`, plus: `Stock ${TROU} — ${TROU}`, erreur: /variable intermédiaire « lab »/ });
  ecart('const a = `Stock Labo de ${x}`;', 'const lab = voc.Nom("labo");\nconst a = `Stock ${lab} de ${x}`;', { erreur: /variable intermédiaire « lab »/ });
});

test('R11 : la comparaison est celle des multi-ensembles (une occurrence sur deux modifiée = écart)', () => {
  identique('const a = ["Labo", "Labo", "Activité"];', 'const a = ["Activité", voc.Nom("labo"), "Labo"];');
  ecart('const a = ["Labo", "Labo"];', 'const a = ["Labo", "Labos"];', { moins: 'Labo', plus: 'Labos' });
  ecart('const a = ["Labo", "Labo"];', 'const a = ["Labo"];', { moins: 'Labo' });
  const r = comparer('const a = ["Labo"];', 'const a = ["Labo", "Labo"];');
  assert.deepEqual([r.moins.length, r.plus.length], [0, 1]);
  // La ligne rapportée est celle de l'occurrence réellement nouvelle (la 2e), pas de la dernière du fichier.
  const d = differences(
    [{ canon: 'a', l: 1, fichier: 'f' }, { canon: 'x', l: 2, fichier: 'f' }, { canon: 'b', l: 3, fichier: 'f' }, { canon: 'x', l: 4, fichier: 'f' }],
    [{ canon: 'a', l: 1, fichier: 'f' }, { canon: 'x', l: 2, fichier: 'f' }, { canon: 'x', l: 3, fichier: 'f' }, { canon: 'b', l: 4, fichier: 'f' }, { canon: 'x', l: 5, fichier: 'f' }],
  );
  assert.deepEqual(d.plus.map((u) => u.l), [3]);
  assert.deepEqual(d.moins, []);
  // Deux occurrences au voisinage identique : une seule référence n'en absorbe qu'une.
  const u = (canon, l) => ({ canon, l, fichier: 'f' });
  const e = differences([u('x', 1), u('Labo', 2), u('x', 3)], [u('x', 1), u('Labo', 2), u('x', 3), u('Labo', 4), u('x', 5)]);
  assert.deepEqual(e.plus.map((p) => p.canon).sort(), ['Labo', 'x']);
  assert.deepEqual(e.moins, []);
});

test('R12 : imports, types littéraux, console.* et commentaires ne sont pas des unités', () => {
  const source = [
    'import x from "./labo";',
    'import type { Labo } from "../types";',
    'export { y } from "./activite";',
    'const charge = lazy(() => import("./components/LaboPage"));',
    'const fs = require("node:fs");',
    'type Mode = "labo" | "activite";',
    'interface P { type: "labo"; }',
    'const m = x as "labo";',
    'console.warn("Labo introuvable", x);',
    '// Le labo en commentaire',
    '/* Stock labo */',
    'const visible = "Stock labo";',
  ].join('\n');
  assert.deepEqual(canons(source), ['Stock labo']);
  assert.deepEqual(canons(jsx('<p>{/* Aucun labo */}Texte</p>')), ['Texte']);
  // Changer un import ou un message de console n'est pas un écart ; changer le texte en est un.
  identique(source, source.replace('./labo', './usine').replace('Labo introuvable', 'Usine introuvable'));
  ecart(source, source.replace('= "Stock labo"', '= "Stock usine"'), { moins: 'Stock labo', plus: 'Stock usine' });
});

test('apostrophe : ’ et \' sont la même apostrophe, et rien d\'autre', () => {
  identique('const a = "Géré dans l’activité";', 'const a = `Géré dans ${voc.le("activite")}`;');
  identique('const a = "l’activité";', 'const a = "l\'activité";');
  ecart('const a = "l’activité";', 'const a = "l activité";', { moins: "l'activité", plus: 'l activité' });
});

test('DOIT échouer — texte modifié d\'un caractère (lettre, espace, ponctuation, casse, accent)', () => {
  const avant = jsx('<p>Aucun labo créé.</p>');
  for (const [apres, texte] of [
    ['<p>Aucun labo crée.</p>', 'Aucun labo crée.'],
    ['<p>Aucun  labo créé.</p>', 'Aucun  labo créé.'],
    ['<p>Aucun labo créé</p>', 'Aucun labo créé'],
    ['<p>aucun labo créé.</p>', 'aucun labo créé.'],
    ['<p>Aucun labo cree.</p>', 'Aucun labo cree.'],
    ['<p>Aucun {voc.Nom("labo")} créé.</p>', 'Aucun Labo créé.'],
    ['<p>Aucun {voc.pl("labo")} créé.</p>', 'Aucun labos créé.'],
    ['<p>Aucun {voc.nom("activite")} créé.</p>', 'Aucun activité créé.'],
    ['<p>Aucun labo créé.{" "}</p>', 'Aucun labo créé. '],
  ]) ecart(avant, jsx(apres), { moins: 'Aucun labo créé.', plus: texte });
  // Attribut et propriété.
  ecart(jsx('<input placeholder="Nom du labo" />'), jsx('<input placeholder={`Nom ${voc.du("labo")}.`} />'), { moins: 'Nom du labo', plus: 'Nom du labo.' });
  ecart('confirm({ title: "Supprimer le labo ?" });', 'confirm({ title: `Supprimer ${voc.le("labo")}?` });', { plus: 'Supprimer le labo?' });
});

test('témoin : un fichier inchangé est identique à lui-même — et ses unités sont bien lues (la comparaison n\'est pas vide)', () => {
  const source = jsx('<p title="Stock labo">{n} article{n !== 1 ? "s" : ""} — {t("x.y", "Défaut")} <b>{c ? "oui" : "non"}</b></p>');
  const r = identique(source, source);
  assert.deepEqual([r.moins.length, r.plus.length, r.erreurs.length], [0, 0, 0]);
  assert.deepEqual(canons(source), ['Stock labo', `${TROU} ⟦article|articles@≠1⟧ — Défaut ⟦<b>⟧`, '⟦?oui|non⟧']);
  // Chacune de ces unités, modifiée seule, est un écart.
  for (const [de, vers] of [['Stock labo', 'Stock labos'], ['!== 1', '> 1'], ['"Défaut"', '"Defaut"'], ['"oui"', '"Oui"']]) {
    assert.equal(comparer(source, source.replace(de, vers)).ok, false, `${de} → ${vers}`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Modes residuels et accords, écarts admis
// ═════════════════════════════════════════════════════════════════════════════

const candidates = (source, nom = 'x.tsx') => analyser(source, nom).unites.filter((u) => u.termes.length && !u.exclu).map((u) => u.canon);
const exclus = (source, nom = 'x.tsx') => analyser(source, nom).unites.filter((u) => u.termes.length && u.exclu).map((u) => u.exclu);

test('residuels : formes par défaut repérées par mots entiers', () => {
  assert.deepEqual(termesDans('Stock labo'), ['labo', 'stock']);
  assert.deepEqual(termesDans('Les Activités du compte'), ['activite']);
  assert.deepEqual(termesDans('produit(s) vendable(s)'), ['produit']);
  assert.deepEqual(termesDans('Produits vendables'), ['produit_vendable', 'produit']);
  assert.deepEqual(termesDans('3 PT et 2 FT'), ['fiche_technique', 'pt']);
  assert.deepEqual(termesDans('laboratoire'), ['labo_long']);
  // Pas un mot entier, identifiant, sigle en minuscules : rien.
  for (const t of ['collaborer', 'labo_id', 'activite', 'un script pt', 'restocker']) assert.deepEqual(termesDans(t), [], t);
});

test('residuels : tout texte en dur portant un terme est candidat', () => {
  assert.deepEqual(candidates(jsx('<p title="Stock du labo">Aucun labo</p>')), ['Stock du labo', 'Aucun labo']);
  assert.deepEqual(candidates('setError("Labo introuvable"); const x = { label: "Articles", emptyMsg: "Aucune vente" };'), ['Labo introuvable', 'Articles', 'Aucune vente']);
  assert.deepEqual(candidates('parts.push("labo");'), ['labo']); // mot isolé visible : à classer (allow discriminant s'il ne l'est pas)
  assert.deepEqual(candidates('const a = `${n} article${n > 1 ? "s" : ""}`;'), [`${TROU} ⟦article|articles@>1⟧`]);
  assert.deepEqual(candidates('const a = t("x.y", "Stock Activités");'), ['Stock Activités']);
  // Une fois réécrit, plus rien : ni l'appel voc, ni la balise, ni la clé i18n ne sont du texte en dur.
  assert.deepEqual(candidates(jsx('<p title={`${voc.Nom("stock")} ${voc.du("labo")}`}>{voc.Aucun("labo")} ici</p>')), []);
  assert.deepEqual(candidates(`${msg('"[[Nom:stock]] [[Court:activite:pl]]"')} const b = t("nav.stock_activite");`, 'x.js'), []);
  // … mais dans un .tsx la balise n'est pas rendue : le terme est bel et bien écrit en dur.
  assert.deepEqual(candidates('const a = "[[Nom:stock]] [[Court:activite:pl]]";'), ['[[Nom:stock]] [[Court:activite:pl]]']);
  // Mais un terme resté en dur à côté d'un appel voc reste candidat.
  assert.deepEqual(candidates(jsx('<p>Stock {voc.nom("labo")}</p>')), ['Stock labo']);
  // Le nom d'un composant JSX n'est pas un texte.
  assert.deepEqual(candidates(jsx('<div><Article /> <Stock>x</Stock></div>')), []);
});

test('residuels : contextes techniques exclus (liste de la spec)', () => {
  const tech = [
    ['if (x === "labo") {}', 'comparaison'], ['if (x !== "labo") {}', 'comparaison'],
    ['switch (x) { case "labo": break; }', 'case'],
    ['const o = { "labo": 1 };', 'cle-objet'], ['const v = o["labo"];', 'index'],
    ['api.get("/labo/stock");', 'argument de api.get'], ['api.post(`/labo/${id}/appro`, {});', 'argument de api.post'],
    ['navigate("/stock-labo");', 'argument de navigate'],
    ['s.has("labo");', 'argument de s.has'], ['l.includes("labo");', 'argument de l.includes'],
    ['s.add("labo");', 'argument de s.add'], ['s.delete("labo");', 'argument de s.delete'],
    ['window.addEventListener("labos-changed", f);', 'argument de window.addEventListener'],
    ['window.dispatchEvent(new Event("labos-changed"));', 'argument de new Event'],
    ['pool.query("SELECT * FROM labos WHERE stock > 0");', 'argument de pool.query'],
    ['router.get("/labo/stock", h);', 'argument de router.get'], ['app.use("/api/labo", r);', 'argument de app.use'],
    [jsx('<Link to="/stock-labo">x</Link>'), 'attribut to'], [jsx('<Route path="/labo/stock" />'), 'attribut path'],
    [jsx('<div className="carte labo">x</div>'), 'attribut className'], [jsx('<li key="labo">x</li>'), 'attribut key'],
    [jsx('<input id="labo" name="labo" type="labo" value="labo" />'), 'attribut id'],
    [jsx('<G section="labo" theme="labo" href="/labo" src="/labo.png" htmlFor="labo" role="labo" dataKey="labo" labelKey="labo" data-tab="labo" />'), 'attribut section'],
    ['const o = { key: "labo", type: "labo", value: "labo", id: "labo", mode: "labo", origine: "labo", type_vente: "labo", field: "labo", path: "labo" };', 'propriété key'],
    ['const u = "/stock/labo";', 'chemin ou URL'], ['const u = "https://x.tn/labo";', 'chemin ou URL'],
    ['const c = "stock-labo";', 'identifiant technique'], ['const c = "labo.stock";', 'identifiant technique'],
    ['const q = `UPDATE labos SET stock = $1`;', 'SQL'],
  ];
  for (const [source, raison] of tech) {
    assert.deepEqual(candidates(source, 'x.tsx'), [], source);
    assert.ok(exclus(source).includes(raison), `${source} → ${JSON.stringify(exclus(source))}`);
  }
  // t('clé') : la clé n'est pas un texte ; require et import non plus.
  assert.deepEqual(candidates('const a = t("nav.stock"); const b = require("./labo");'), []);
  // À n'importe quelle profondeur d'un attribut technique ; mais pas le texte enfant d'un élément lié.
  assert.deepEqual(candidates(jsx('<div className={clsx("carte", actif && "labo")} style={{ gridArea: "stock" }}>x</div>')), []);
  assert.deepEqual(candidates(jsx('<Link to="/x"><span>Stock labo</span></Link>')), ['Stock labo']);
  assert.deepEqual(candidates(jsx('<Liste render={() => <p>Stock labo</p>} />')), ['Stock labo']);
  assert.deepEqual(candidates(jsx('<Option value={<b>Stock labo {f("du labo")}</b>} />')), ['Stock labo ⟦·⟧', 'du labo'], 'le contenu d\'un élément reste visible, même logé dans un attribut technique');
  // Hors liste : un attribut ou une propriété quelconque reste candidat.
  assert.deepEqual(candidates(jsx('<T title="Labo" label="Labo" subtitle="Labo" emptyMsg="Labo" />')), ['Labo', 'Labo', 'Labo', 'Labo']);
  assert.deepEqual(candidates('const o = { noun: "labo", description: "Le labo" };'), ['labo', 'Le labo']);
});

test('accords (1) : chaque mot de la liste fermée devant un appel voc est signalé', () => {
  assert.equal(MOTS_ACCORD.length, 63);
  assert.equal(new Set(MOTS_ACCORD).size, MOTS_ACCORD.length, 'pas de doublon');
  for (const mot of ['le', 'la', 'un', 'aucun', 'tout', 'toute', 'quels', 'quelles', 'seuls', 'seules', 'nouveaux', 'nouvelles', 'premier', 'première', 'dernier', 'dernière', 'meilleures', 'prochain', 'certains', 'certaines', 'chacun', 'chacune']) {
    assert.ok(MOTS_ACCORD.includes(mot), mot);
  }
  for (const mot of [...MOTS_ACCORD, 'Aucun', 'LES', 'Cette']) {
    const [u] = analyser(jsx(`<p>Voir ${mot} {voc.nom("labo")} ici</p>`)).unites;
    assert.deepEqual(u.accords.map((a) => a.mot), [mot.toLowerCase()], mot);
  }
  for (const [elide, mot] of [["l'", "l'"], ["d'", "d'"], ['l’', "l'"], ["L'", "l'"]]) {
    const [u] = analyser(jsx(`<p>Voir ${elide}{voc.nom("article")}</p>`)).unites;
    assert.deepEqual(u.accords.map((a) => a.mot), [mot], elide);
  }
  const signales = (source, nom = 'x.tsx') => analyser(source, nom).unites.flatMap((u) => u.accords.map((a) => `${a.mot} ${a.methode}:${a.cle}`));
  // Gabarit, concaténation, condition, balise dans un littéral, fr.json, formes « (s) », élément enfant.
  assert.deepEqual(signales('const a = `Supprimer la ${voc.nom("activite")}`;'), ['la nom:activite']);
  assert.deepEqual(signales('const a = "Supprimer ce " + voc.nom("labo");'), ['ce nom:labo']);
  assert.deepEqual(signales('const a = `Aucun ${c ? voc.nom("labo") : voc.nom("activite")}`;'), ['aucun nom:labo', 'aucun nom:activite']);
  assert.deepEqual(signales('const a = `Aucun ${voc.nom(c ? "labo" : "activite")}`;'), ['aucun nom:labo', 'aucun nom:activite']);
  assert.deepEqual(signales(msg('"Aucun [[nom:labo]] et une [[nom:activite]]"'), 'x.js'), ['aucun nom:labo', 'une nom:activite']);
  assert.deepEqual(analyserFr('{ "a": "Supprimer cette [[nom:activite]]" }').unites[0].accords.map((a) => a.mot), ['cette']);
  assert.deepEqual(signales(jsx('<p>ce(s) {voc.nomS("labo")}</p>')), ['ce nomS:labo']);
  assert.deepEqual(signales(jsx('<p>Sélectionnez la/les <strong>{voc.nomS("activite")}</strong></p>')), ['les nomS:activite']);
  assert.deepEqual(signales(jsx('<p>le {voc.icon("labo")} {voc.nom("labo")}</p>')), ['le nom:labo']);
  // Rien : mot hors liste, trou entre les deux, moteur employé pour l'article.
  assert.deepEqual(signales(jsx('<p>Modifier {voc.le("labo")} à {voc.ce("labo")} avec {voc.nom("labo")}</p>')), []);
  assert.deepEqual(signales(jsx('<p>le {x} {voc.nom("labo")}</p>')), []);
  assert.deepEqual(signales(jsx('<p>{voc.Aucun("labo")} {voc.acc("labo", "créé", "créée")}. Stock {voc.compl("labo")}</p>')), []);
  assert.deepEqual(signales(jsx('<p>modèle {voc.nom("labo")}</p>')), [], '« modèle » finit par « le » mais n\'est pas le mot « le »');
  // « de » devant un déterminant invariable posé par le moteur : juste dans tous les domaines, non signalé.
  assert.deepEqual(signales(jsx('<p>Stock de {voc.ce("labo")}, de {voc.votre("activite")}, d\'{voc.un("article")} et de {voc.tous("labo")}</p>')), []);
  // Mais la contraction reste due au moteur : « de {voc.le(k)} » (voc.du) et « à {voc.le(k)} » (voc.au).
  assert.deepEqual(signales(jsx('<p>Stock de {voc.le("activite")}</p>')), ['de le:activite']);
  assert.deepEqual(signales(jsx('<p>Livré à {voc.le("activite")} puis à {voc.ce("labo")}</p>')), ['à le:activite']);
  assert.deepEqual(signales(msg('"Livré à [[le:activite]]"'), 'x.js'), ['à le:activite']);
  assert.deepEqual(signales(jsx('<p>Liste de {voc.pl("labo")} et d\'{voc.pl("activite")}</p>')), ['de pl:labo', "d' pl:activite"]);
});

test('accords (2) : vocab-accords.txt rend chaque unité à appel voc avec le lexique miroir', () => {
  const a = analyser(jsx('<div><p>Créer <strong>le premier {voc.nom("labo")}</strong> de {voc.votre("activite")}</p><p>Sans terme</p><p>{voc.n("article", n)}</p></div>'));
  const miroir = a.unites.filter((u) => u.miroir !== undefined).map((u) => [u.plat, u.miroir]);
  assert.deepEqual(miroir, [
    ['Créer <strong>le premier labo</strong> de votre activité', 'Créer <strong>le premier usine</strong> de votre local'],
    [`${TROU} ⟦article|articles@>1⟧`, `${TROU} ⟦denrée|denrées@>1⟧`],
  ]);
  const texte = texteAccords([{ fichier: 'src/a.tsx', l: 3, defaut: 'Aucun labo', miroir: 'Aucun usine', voc: ['nom:labo'] }]);
  assert.match(texte, /src\/a\.tsx\n {2}l\. 3\n {4}défaut : Aucun labo\n {4}miroir : Aucun usine\n/);
  assert.match(texte, /1 unité\(s\), 1 fichier\(s\)/);
});

test('allow : entrées typées et justifiées, sinon refusées', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-allow-'));
  try {
    const bon = { fichier: 'src\\a.tsx', avant: 'Aucun ⟦?labo|activité⟧', apres: '⟦?Aucun labo|Aucune activité⟧', type: 'faute-corrigee', justification: 'Faute d\'accord d\'origine corrigée par le moteur.' };
    fs.writeFileSync(path.join(d, 'F1.json'), JSON.stringify([bon, { fichier: 'src/a.tsx', avant: 'prix de vente', apres: 'prix de vente', type: 'locution', justification: 'Locution figée (spec §3 règle 4).' }]));
    const ok = chargerAllow(d);
    assert.deepEqual(ok.problemes, []);
    assert.deepEqual(ok.entrees.map((e) => [e.fichier, e.lot, e.modes]), [['src/a.tsx', 'F1', ['identite']], ['src/a.tsx', 'F1', ['residuels']]]);
    assert.equal(TYPES_ALLOW.length, 17); // + reporte, admin (E8), fiscal (E1), retire, remplace et ajoute (lot 3)
    const mauvais = [
      [{ ...bon, type: 'pratique' }, /type « pratique » inconnu/],
      [{ ...bon, justification: '' }, /justification manquante/],
      [{ ...bon, justification: 'ok' }, /justification manquante/],
      [{ ...bon, fichier: undefined }, /« fichier » manquant/],
      [{ ...bon, avant: null, apres: null }, /« avant » \/ « apres »/],
      [{ ...bon, mode: 'tout' }, /mode inconnu/],
    ];
    for (const [entree, motif] of mauvais) {
      fs.writeFileSync(path.join(d, 'F1.json'), JSON.stringify([entree]));
      const r = chargerAllow(d);
      assert.equal(r.problemes.length, 1, JSON.stringify(entree));
      assert.match(r.problemes[0], motif);
    }
    fs.writeFileSync(path.join(d, 'F1.json'), '{ "pas": "un tableau" }');
    assert.match(chargerAllow(d).problemes[0], /tableau/);
    fs.writeFileSync(path.join(d, 'F1.json'), '[ illisible');
    assert.match(chargerAllow(d).problemes[0], /JSON illisible/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 bis. Constats des relectures contradictoires : chaque cas aurait dû être attrapé
// ═════════════════════════════════════════════════════════════════════════════

const signalements = (source, nom = 'x.tsx', options) => analyser(source, nom, options).unites
  .flatMap((u) => u.accords.map((a) => `${a.mot}/${a.position} ${a.methode}:${a.cle}`));
const phrase = (x) => jsx(`<p>${x}</p>`);

test('residuels : un texte VISIBLE n\'est plus pris pour un chemin, un identifiant ou une valeur technique', () => {
  // « n / max terme(s) » : le texte canonique ENTIER est jugé, pas ses fragments littéraux joints.
  assert.deepEqual(candidates(jsx('<span>{n} / {max} labo(s)</span>')), [`${TROU} / ${TROU} labo(s)`]);
  assert.deepEqual(candidates(jsx('<span>{n}{max !== null ? ` / ${max}` : ""} activité(s)</span>')), [`${TROU}⟦? / ${TROU}|⟧ activité(s)`]);
  assert.deepEqual(candidates(jsx('<span>{a}/{b} article{b > 1 ? "s" : ""}</span>')), [`${TROU}/${TROU} ⟦article|articles@>1⟧`]);
  assert.deepEqual(candidates(jsx('<span>/ activité / mois</span>')), ['/ activité / mois']);
  assert.deepEqual(candidates(jsx('<span>/mois par activité</span>')), ['/mois par activité'], 'un mot après une espace : ce n\'est pas un chemin');
  // … alors qu'un vrai chemin reste exclu, avec ou sans trou.
  for (const chemin of ['const u = "/stock/labo";', 'const u = `/labos/${id}/stock`;', 'const u = `/${base}/labo`;', 'const u = "https://x.tn/labo";']) {
    assert.deepEqual(candidates(chemin), [], chemin);
    assert.deepEqual(exclus(chemin), ['chemin ou URL'], chemin);
  }
  // Attributs `value` / `name`, propriétés `value` / `type` / `mode` : exclus seulement s'ils ont la forme d'un identifiant.
  assert.deepEqual(candidates(jsx('<input value="— Aucun fournisseur disponible —" disabled />')), ['— Aucun fournisseur disponible —']);
  assert.deepEqual(candidates(jsx('<Line dataKey="marge" name="Marge brute" />')), ['Marge brute']);
  assert.deepEqual(candidates(jsx('<Line name={`Ventes ${annee}`} />')), [`Ventes ${TROU}`]);
  assert.deepEqual(candidates('const o = [{ value: "Tous les labos" }, { type: "Transfert labo" }, { mode: "Vente directe" }];'), ['Tous les labos', 'Transfert labo', 'Vente directe']);
  assert.deepEqual(candidates(jsx('<input name="labo" value="labo" />')), []);
  assert.deepEqual(candidates(jsx('<input value={estLabo ? "labo" : "activite"} name={`labo-${id}`} />')), []);
  assert.deepEqual(candidates('const o = [{ value: "labo", type: "transfert", mode: "vente" }];'), []);
  // Les autres attributs techniques (to, className, id…) restent exclus quel que soit leur texte.
  assert.deepEqual(candidates(jsx('<Link to="/Stock Labo" className="Carte Labo" id="Labo">x</Link>')), []);
});

test('residuels : comparaison sur un LIBELLÉ — candidate ; sur un identifiant — exclue', () => {
  // L'en-tête devient voc, le test reste en dur : hors restauration, l'alignement de la colonne bascule.
  const source = jsx('<tr>{[voc.Nom("article"), "Qté"].map((h) => <th key={h} style={{ textAlign: h === "Article" ? "left" : "right" }}>{h}</th>)}</tr>');
  assert.deepEqual(candidates(source), ['Article'], 'même au fond d\'un attribut technique (style)');
  assert.deepEqual(candidates('if (h === "Article / Produit" || x !== "Produit") y();'), ['Article / Produit', 'Produit']);
  assert.deepEqual(candidates('switch (h) { case "Article": break; case "article": break; }'), ['Article']);
  assert.deepEqual(candidates('const ok = ["a"].includes("Article") || s.has("Labo central");'), ['Article', 'Labo central']);
  assert.deepEqual(candidates('if (type === "PT") y();'), ['PT'], 'valeur d\'API en capitales : à admettre en « discriminant »');
  // La bonne écriture : comparer au même appel voc.
  assert.deepEqual(candidates(jsx('<th style={{ textAlign: h === voc.Nom("article") ? "left" : "right" }}>{h}</th>')), []);
  for (const technique of ['if (x === "labo") y();', 'if (x !== "pt-utilisable") y();', 'switch (x) { case "labo": break; }', 's.has("labo"); l.includes("stock.labo");']) {
    assert.deepEqual(candidates(technique), [], technique);
  }
});

test('residuels : un exemple de saisie écrit en dur est repéré, même sans terme du lexique', () => {
  const ex = (source) => analyser(source).unites.filter((u) => u.exemple).map((u) => u.canon);
  assert.deepEqual(ex(jsx('<input placeholder="Ex. Burger, Pizza Margherita…" />')), ['Ex. Burger, Pizza Margherita…']);
  assert.deepEqual(ex(jsx('<input placeholder="Ex: Poulet entier" />')), ['Ex: Poulet entier']);
  assert.deepEqual(ex(jsx('<input placeholder="ex : BRG-001" />')), ['ex : BRG-001']);
  assert.deepEqual(ex('const champ = { placeholder: "Exemple : Viandes & Volailles" };'), ['Exemple : Viandes & Volailles']);
  // Réécrit en exemple neutre et construit, ou purement numérique : plus rien.
  assert.deepEqual(ex(jsx('<input placeholder={`Ex: ${voc.Nom("labo")} 1`} />')), []);
  assert.deepEqual(ex(jsx('<input placeholder={`Ex: ${voc.Nom("article")} A`} />')), []);
  assert.deepEqual(ex(jsx('<input placeholder="Ex: 12.5" />')), []);
  // Pas un exemple : un autre attribut, un placeholder ordinaire, « Exporter… ».
  assert.deepEqual(ex(jsx('<input title="Ex: Poulet entier" placeholder="Rechercher…" />')), []);
  assert.deepEqual(ex(jsx('<input placeholder="Exporter la liste" />')), []);
});

test('accords (2) : le miroir distingue Nom de Court (chaque terme du miroir a une forme courte « Abr-… »)', () => {
  const miroir = (x) => analyser(jsx(x)).unites.find((u) => u.miroir !== undefined).miroir;
  // Identiques par défaut (« Stock Labo »), donc invisibles du mode identite : la ligne miroir les sépare.
  identique(jsx('<span>Stock Labo</span>'), jsx('<span>{voc.Nom("stock")} {voc.Nom("labo")}</span>'));
  identique(jsx('<span>Stock Labo</span>'), jsx('<span>{voc.Nom("stock")} {voc.Court("labo")}</span>'));
  assert.equal(miroir('<span>{voc.Nom("stock")} {voc.Nom("labo")}</span>'), 'Armoire Usine');
  assert.equal(miroir('<span>{voc.Nom("stock")} {voc.Court("labo")}</span>'), 'Armoire Abr-Usine');
  assert.notEqual(miroir('<span>{voc.Nom("labo")}</span>'), miroir('<span>{voc.Court("labo")}</span>'));
  assert.equal(miroir('<span>Pertes {voc.court("labo", true)}</span>'), 'Pertes abr-usines');
  // Un terme qui a déjà une forme courte dans le miroir la garde ; l'élision suit la forme courte.
  assert.equal(miroir('<span>{voc.Court("pt")} / {voc.le("labo", false, "Court")}</span>'), "EI / l'Abr-Usine");
  // « nom » contre « compl » reste visible, comme avant.
  assert.equal(miroir('<p>depuis {voc.le("stock")} {voc.nom("labo")}</p>'), "depuis l'armoire usine");
  assert.equal(miroir('<p>depuis {voc.le("stock")} {voc.compl("labo")}</p>'), "depuis l'armoire de l'usine");
});

test('accords (1) : mots ajoutés — pluriels, tout, premier, dernier, meilleur, certain, chacun ; adjectif invariable intercalé ; guillemet, emoji', () => {
  const cas = [
    ["Toute {voc.le('activite')} compte", ['toute/devant le:activite']],
    ["Tout {voc.le('stock')} compte", ['tout/devant le:stock']],
    ["Nouvelles {voc.pl('activite')}", ['nouvelles/devant pl:activite']],
    ["Nouveaux {voc.pl('article')}", ['nouveaux/devant pl:article']],
    ["Quelles {voc.pl('activite')} ?", ['quelles/devant pl:activite']],
    ["Seuls {voc.le('labo', true)} comptent", ['seuls/devant le:labo']],
    ["Certaines {voc.pl('activite')}", ['certaines/devant pl:activite']],
    ["Première {voc.nom('activite')}", ['première/devant nom:activite']],
    ["Dernier {voc.nom('inventaire')}", ['dernier/devant nom:inventaire']],
    ["Meilleures {voc.pl('marge')}", ['meilleures/devant pl:marge']],
    ["Chacune {voc.du('activite', true)}", ['chacune/devant du:activite']],
    ["Aucun autre {voc.nom('labo')}", ['aucun/devant nom:labo']],
    ["La même {voc.nom('activite')}", ['la/devant nom:activite']],
    ["votre premier {voc.nom('labo')}", ['premier/devant nom:labo']],
    ["l'autre {voc.nom('article')}", ["l'/devant nom:article"]],
    // guillemet, parenthèse ou emoji écrit en dur entre le mot et l'appel
    ["Supprimer le « {voc.nom('labo')} » ?", ['le/devant nom:labo']],
    ["le 🏭 {voc.nom('labo')}", ['le/devant nom:labo']],
    ["Stock (du {voc.nom('labo')})", ['du/devant nom:labo']],
    ['le "{voc.nom(\'labo\')}"', ['le/devant nom:labo']],
    ["qu'un {voc.nom('labo')}", ['un/devant nom:labo']],
  ];
  for (const [x, attendu] of cas) assert.deepEqual(signalements(phrase(x)), attendu, x);
  // Rien : mot invariable, ou mot de la liste séparé de l'appel par un vrai mot ou une ponctuation forte.
  for (const x of ["Chaque {voc.nom('labo')}", "Ventes par {voc.nom('activite')}", "plusieurs {voc.pl('labo')}", "le nom : {voc.nom('labo')}", "Le premier arrivé, {voc.nom('labo')}", "Aucun. {voc.Le('labo')}", "même {voc.nom('labo')}"]) {
    assert.deepEqual(signalements(phrase(x)), [], x);
  }
});

test('accords (1) : déterminant porté par une condition ou un suffixe conditionnel, ou venu de t()', () => {
  assert.deepEqual(signalements('const a = `${n > 1 ? "les" : "le"} ${voc.nom("labo", n)}`;'), ['les/devant nom:labo']);
  assert.deepEqual(signalements(phrase('ce{n > 1 ? "s" : ""} {voc.nom("labo", n)}')), ['ces/devant nom:labo']);
  assert.deepEqual(signalements(phrase('Stock {isLabo ? "du" : "de la"} {voc.nom(isLabo ? "labo" : "vente")}')), ['du/devant nom:labo', 'du/devant nom:vente']);
  assert.deepEqual(signalements(phrase('{vide ? "Aucun" : n} {voc.nom("labo", n)}')), ['aucun/devant nom:labo']);
  // Une branche sans mot de la liste ne masque pas l'autre ; deux branches neutres ne signalent rien.
  assert.deepEqual(signalements(phrase('{c ? "Stock" : "Le"} {voc.nom("labo")}')), ['le/devant nom:labo']);
  assert.deepEqual(signalements(phrase('{c ? "Stock" : "Historique"} {voc.nom("labo")}')), []);
  // Valeur par défaut de t() dans le fichier, et valeur lue dans fr.json.
  assert.deepEqual(signalements(phrase('{t("x.supprimer_le", "Supprimer le")} {voc.nom("labo")}')), ['le/devant nom:labo']);
  const fr = { fr: new Map([['x.supprimer_le', 'Supprimer le'], ['x.titre', '[[Nom:activite]]']]) };
  assert.deepEqual(signalements(phrase('{t("x.supprimer_le")} {voc.nom("labo")}'), 'x.tsx', fr), ['le/devant nom:labo']);
  assert.deepEqual(signalements(phrase('{t("x.titre")} créée'), 'x.tsx', fr), ['créée/apres Nom:activite']);
});

test('accords (1) : déterminant ou accord en dur autour d\'une VARIABLE qui reçoit un appel voc', () => {
  const source = 'const nom = voc.nom(isLabo ? "labo" : "activite");\nconst m = `Aucun ${nom} trouvé`;';
  // identite : la variable existait déjà et le texte est le même — aucun écart (R10 ne vaut que si le texte change)…
  identique('const nom = isLabo ? "labo" : "activité";\nconst m = `Aucun ${nom} trouvé`;', source);
  // … mais le mode accords lit la variable DANS la phrase qui l'emploie, et l'écrit dans le miroir.
  const u = analyser(source).unites.find((x) => x.canon === `Aucun ${TROU} trouvé`);
  assert.deepEqual(u.accords.map((s) => `${s.mot}/${s.position} ${s.cle}${s.variable ? ` (${s.variable})` : ''}`),
    ['aucun/devant labo (nom)', 'aucun/devant activite (nom)', 'trouvé/apres labo']);
  assert.equal(u.accords[0].l, 2, 'signalé à la ligne de la phrase, pas de la déclaration');
  assert.equal(u.plat, 'Aucun ⟦?labo|activité⟧ trouvé');
  assert.equal(u.miroir, 'Aucun ⟦?usine|local⟧ trouvé');
  // Gabarit rangé dans une variable : lu de la même façon (la déclaration est signalée pour elle-même, puis la phrase).
  assert.deepEqual(signalements('const titre = `${voc.nom("labo")} central`;\nconst C = () => <h1>Votre {titre}</h1>;'),
    ['central/apres nom:labo', 'votre/devant nom:labo', 'central/apres nom:labo']);
  // Variable sans appel voc, variable déclarée deux fois, paramètre : un trou ordinaire.
  assert.deepEqual(signalements('const nom = "labo";\nconst m = `Aucun ${nom} trouvé`;'), []);
  assert.deepEqual(signalements('const f = (nom) => `Aucun ${nom} trouvé`;\nconst nom = voc.nom("labo");'), []);
  // La bonne écriture.
  assert.deepEqual(signalements('const m = `${voc.Aucun(isLabo ? "labo" : "activite")} ${voc.acc(isLabo ? "labo" : "activite", "trouvé", "trouvée")}`;'), []);
});

test('accords (1) : participe ou adjectif de la liste fermée écrit en dur juste APRÈS un appel voc nominal', () => {
  assert.ok(ACCORDS_APRES.length >= 60 && ACCORDS_APRES.every((p) => /^[\p{L}]+\|[\p{L}]+$/u.test(p)));
  assert.equal(new Set(ACCORDS_APRES).size, ACCORDS_APRES.length, 'pas de doublon');
  for (const paire of ['créé|créée', 'lié|liée', 'alimenté|alimentée', 'insuffisant|insuffisante', 'enregistré|enregistrée', 'sélectionné|sélectionnée', 'affecté|affectée', 'rattaché|rattachée', 'trouvé|trouvée']) {
    assert.ok(ACCORDS_APRES.includes(paire), paire);
  }
  const cas = [
    ["{voc.Nom('activite')} créée", ['créée/apres Nom:activite']],
    ["{voc.Nom('activite')} supprimée", ['supprimée/apres Nom:activite']],
    ["{voc.Aucun('labo')} créé.", ['créé/apres Aucun:labo']],
    ["{voc.Pl('article')} valorisés", ['valorisés/apres Pl:article']],
    ["{voc.Nom('stock')} {voc.compl('labo')} insuffisant :", ['insuffisant/apres compl:labo']],
    ["{voc.Le('activite')} est déjà liée ici", ['liée/apres Le:activite']],
    ["{voc.Le('article', true)} ne sont pas inventoriés", ['inventoriés/apres Le:article']],
    ["{voc.pl('article')} non inventoriés", ['inventoriés/apres pl:article']],
    ["{voc.Ce('labo')} sera supprimé", ['supprimé/apres Ce:labo']],
    ["{voc.Nom('vente')} directe", ['directe/apres Nom:vente']],
    ["{voc.n('labo', n)} actifs", ['actifs/apres n:labo']],
    ["{voc.Nom('activite')}{' '}créée", ['créée/apres Nom:activite']],
    ["{voc.Nom('activite')} <b>créée</b>", ['créée/apres Nom:activite']],
    ["{voc.Nom('activite')} {ok ? 'créée' : 'modifiée'}", ['créée/apres Nom:activite', 'modifiée/apres Nom:activite']],
    ["{c ? voc.Nom('labo') : voc.Nom('activite')} créé", ['créé/apres Nom:labo']],
    ["Chaque {voc.nom('labo')} actif", ['actif/apres nom:labo']],
  ];
  for (const [x, attendu] of cas) assert.deepEqual(signalements(phrase(x)), attendu, x);
  // Rien : accord porté par voc.acc, adjectif épicène, mot séparé du terme par une ponctuation, icône, déterminant seul.
  for (const x of [
    "{voc.Aucun('activite')} {voc.acc('activite', 'créé', 'créée')}.",
    "{voc.Le('activite')} est {voc.acc('activite', 'lié', 'liée')}",
    "{voc.Nom('labo')} disponible", "{voc.Nom('labo')} introuvable", "{voc.Pl('article')} vendables",
    "{voc.Nom('labo')} : créé le 12", "Stock {voc.nom('labo')}, créé hier", "{voc.icon('labo')} créé", "{voc.det('labo', 'le')}créé",
    "{voc.Nom('labo')} créera", "{voc.Nom('labo')} créément",
    "{voc.acc('labo', 'Créé', 'Créée')} manuellement", "{voc.det('labo', 'le')} {voc.acc('labo', 'seul', 'seule')} actif",
  ]) assert.deepEqual(signalements(phrase(x)), [], x);
  // voc.acc prolonge le groupe du terme : le mot en dur qui le suit s'accorde encore avec le terme nommé avant.
  assert.deepEqual(signalements(phrase("{voc.Nom('activite')} {voc.acc('activite', 'créé', 'créée')} manuelle")), ['manuelle/apres Nom:activite']);
  // fr.json : même lecture autour des balises.
  const fr = analyserFr('{ "a": "[[Nom:activite]] créée.", "b": "[[Aucun:labo]] [[acc:labo:créé:créée]].", "c": "Aucune [[nom:activite]] liée" }');
  assert.deepEqual(fr.unites.map((u) => u.accords.map((s) => `${s.mot}/${s.position}`)), [['créée/apres'], [], ['aucune/devant', 'liée/apres']]);
});

test('accords (1) : pronom de reprise après un appel voc nominal', () => {
  const cas = [
    ["{voc.Le('activite')} est vide : elle sera masquée", ['elle/reprise Le:activite']],
    ["{voc.Tous('activite', 'vos')} ont-elles un nom ?", ['elles/reprise Tous:activite']],
    ["{voc.Le('labo', true)} comptent : ils seront fermés", ['ils/reprise Le:labo']],
    ["{voc.Le('labo')} ferme : il sera archivé", ['il/reprise Le:labo']],
    ["{voc.Un('article')} dans lequel on range", ['lequel/reprise Un:article']],
  ];
  for (const [x, attendu] of cas) assert.deepEqual(signalements(phrase(x)), attendu, x);
  // Rien : « il » impersonnel, pronom AVANT le terme, pronom porté par voc.acc, mot qui finit par « il ».
  for (const x of [
    "{voc.Le('labo')} : il faut le configurer", "{voc.Le('labo')} — s'il y a lieu", "{voc.Le('labo')} : il n'y a rien",
    "{voc.Le('labo')} : il est possible de le fermer", "{voc.Le('labo')}, s'il vous plaît",
    "Elle contient {voc.un('labo')}", "{voc.Le('activite')} est vide : {voc.acc('activite', 'il', 'elle')} sera masquée",
    "{voc.Le('labo')} et son outil",
  ]) assert.deepEqual(signalements(phrase(x)), [], x);
});

test('DOIT échouer — méthode de chaîne appliquée à un appel voc (toUpperCase, slice, trim…)', () => {
  // Rendu par défaut « Labo », écran « LABO » : le texte n'a pas d'écart, l'erreur est levée quand même.
  const r = comparer(jsx('<th>Labo</th>'), jsx('<th>{voc.Nom("labo").toUpperCase()}</th>'));
  assert.equal(r.ok, false);
  assert.deepEqual([r.moins.length, r.plus.length], [0, 0]);
  assert.ok(r.erreurs.some((e) => e.type === 'methode-chaine' && e.toujours && /voc\.MAJ/.test(e.message)), JSON.stringify(r.erreurs));
  // Gabarit qui contient un appel voc, puis .slice : l'écran n'affiche que « Stock ».
  const s = comparer(jsx('<th>Stock labo</th>'), jsx('<th>{`Stock ${voc.nom("labo")}`.slice(0, 5)}</th>'));
  assert.ok(s.erreurs.some((e) => e.type === 'methode-chaine'), JSON.stringify(s.erreurs));
  for (const apres of ['const a = voc.nom("labo").trim();', 'const a = voc.nom("labo").length;', 'const a = voc.nom("labo")[0];']) {
    assert.ok(comparer('const a = "labo";', apres).erreurs.some((e) => e.type === 'methode-chaine'), apres);
  }
  // Conformes : les méthodes du moteur, le mini-vocabulaire voc.avec({…}).m('_'), une méthode sur un littéral sans voc.
  identique(jsx('<th>LABO</th>'), jsx('<th>{voc.MAJ("labo")}</th>'));
  assert.deepEqual(comparer('const a = "ma salle";', 'const a = voc.avec({ sg: "Salle", pl: "Salles", g: "f", el: false }).mon("_");').erreurs, []);
  assert.deepEqual(comparer('const a = "Stock labo".trim();', 'const a = "Stock labo".trim();').erreurs, []);
});

test('mutations survivantes des relectures : SQL hors .query, collage devant, booléen nié, nombre de voc.acc, « de » + déterminant du moteur', () => {
  // SQL reconnu par son premier mot, même hors d'un appel .query.
  const sql = comparer("const q = `SELECT 'Labo' AS site FROM labos`;", 'const q = `SELECT \'${voc.Nom("labo")}\' AS site FROM labos`;', { nom: 'x.js', t: false });
  assert.deepEqual(sql.moins, []);
  assert.ok(sql.erreurs.some((e) => e.type === 'sql'), JSON.stringify(sql.erreurs));
  // Texte collé DEVANT un appel voc.
  const colle = comparer(jsx('<p>prélabo</p>'), jsx('<p>pré{voc.nom("labo")}</p>'));
  assert.deepEqual(colle.moins, []);
  assert.ok(colle.erreurs.some((e) => e.type === 'collage' && /collé devant un appel voc/.test(e.message)), JSON.stringify(colle.erreurs));
  // Booléen nié : condition ordinaire, jamais un nombre.
  assert.deepEqual(canons('const a = voc.nom("labo", !seul);'), ['⟦?labos|labo⟧']);
  identique('const a = !seul ? "labos" : "labo";', 'const a = voc.nom("labo", !seul);');
  ecart('const a = n > 1 ? "labos" : "labo";', 'const a = voc.nom("labo", !seul);', { moins: '⟦labo|labos@>1⟧', plus: '⟦?labos|labo⟧' });
  // Nombre dynamique de voc.acc : 4e argument, et lui seul.
  assert.deepEqual(canons('const a = voc.acc("labo", "créé", "créée", n);'), ['⟦créé|créés@>1⟧']);
  identique(jsx('<p>{n} labo{n > 1 ? "s" : ""} créé{n > 1 ? "s" : ""}</p>'), jsx('<p>{voc.n("labo", n)} {voc.acc("labo", "créé", "créée", n)}</p>'));
  ecart('const a = "créé";', 'const a = voc.acc("labo", "créé", genre);', { erreur: /voc\.acc : argument n° 3 non littéral/ });
  // « de » devant mon, son, nouveau, aucun : juste dans tous les domaines, non signalé ; devant le ou du : signalé.
  assert.deepEqual(signalements(phrase('Stock de {voc.mon("labo")}, de {voc.son("labo")}, de {voc.nouveau("article")}, d\'{voc.aucun("labo")}')), []);
  assert.deepEqual(signalements(phrase('Stock de {voc.du("labo")}')), ['de/devant du:labo']);
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 ter. Exemples de saisie : voc.ex(parDefaut, sinon) et la balise [[ex:clé:texte par défaut]]
// ═════════════════════════════════════════════════════════════════════════════

const EX_AVANT = jsx('<input placeholder="Ex: Poulet entier" />');
const EX_APRES = jsx('<input placeholder={voc.ex("Ex: Poulet entier", `Ex: ${voc.Nom("article")} A`)} />');

test('voc.ex — identite : voc.ex(a, b) vaut son premier argument, le texte de la référence', () => {
  identique(EX_AVANT, EX_APRES);
  assert.deepEqual(canons(EX_APRES), ['Ex: Poulet entier']);
  // Second argument en dur (mot hors lexique), entité de la référence décodée, propriété d'objet, gabarit sans trou.
  identique(jsx('<input placeholder="Ex: Viandes &amp; Volailles" />'), jsx('<input placeholder={voc.ex("Ex: Viandes & Volailles", "Ex: Catégorie A")} />'));
  identique('const champ = { placeholder: "Ex. BRG-001" };', 'const champ = { placeholder: voc.ex("Ex. BRG-001", "Ex. REF-001") };');
  identique(EX_AVANT, jsx('<input placeholder={voc.ex(`Ex: Poulet entier`, "Ex: " + voc.Nom("article") + " A")} />'));
  // Dans une phrase, et sur req.voc (backend).
  identique('const a = "Saisir un plat, puis valider";', 'const a = `Saisir ${voc.ex("un plat", voc.un("produit"))}, puis valider`;');
  identique('const m = "Ex: Poulet entier";', 'const m = req.voc.ex("Ex: Poulet entier", `Ex: ${req.voc.Nom("article")} A`);', JS);
  // Une seule unité : ni le premier ni le second argument ne forment une unité à part.
  assert.equal(analyser(EX_APRES).unites.length, 1);
  // L'apostrophe typographique du premier argument est la même apostrophe que celle de la référence.
  identique(jsx('<input placeholder="Ex: Salade d\'été" />'), jsx('<input placeholder={voc.ex("Ex: Salade d’été", `Ex: ${voc.Nom("article")} A`)} />'));
});

test('voc.ex — DOIT échouer : premier argument modifié par rapport à la référence, arguments inversés, exemple neutre sans voc.ex', () => {
  // Un mot, un caractère, la casse : l'écran d'un compte restauration changerait.
  ecart(EX_AVANT, EX_APRES.replace('Poulet entier"', 'Poulet fermier"'), { moins: 'Ex: Poulet entier', plus: 'Ex: Poulet fermier' });
  ecart(EX_AVANT, EX_APRES.replace('"Ex: Poulet entier"', '"Ex : Poulet entier"'), { moins: 'Ex: Poulet entier', plus: 'Ex : Poulet entier' });
  ecart(EX_AVANT, EX_APRES.replace('"Ex: Poulet entier"', '"Ex: poulet entier"'), { moins: 'Ex: Poulet entier', plus: 'Ex: poulet entier' });
  // Arguments inversés : le compte restauration verrait l'exemple neutre.
  ecart(EX_AVANT, jsx('<input placeholder={voc.ex(`Ex: Article A`, "Ex: Poulet entier")} />'), { moins: 'Ex: Poulet entier', plus: 'Ex: Article A' });
  // L'exemple neutre seul (l'état d'avant voc.ex) reste un écart.
  ecart(EX_AVANT, jsx('<input placeholder={`Ex: ${voc.Nom("article")} A`} />'), { moins: 'Ex: Poulet entier', plus: 'Ex: Article A' });
  // Le second argument ne rattrape pas un premier argument faux.
  ecart(EX_AVANT, jsx('<input placeholder={voc.ex("Ex: Article A", "Ex: Poulet entier")} />'), { plus: 'Ex: Article A' });
});

test('voc.ex — DOIT échouer : formes que l\'outil ne sait pas juger, erreurs du second argument', () => {
  const avec = (appel) => jsx(`<input placeholder={${appel}} />`);
  ecart(EX_AVANT, avec('voc.ex("Ex: Poulet entier")'), { erreur: /voc\.ex : deux arguments attendus/ });
  ecart(EX_AVANT, avec('voc.ex("Ex: Poulet entier", "Ex: A", "Ex: B")'), { erreur: /voc\.ex : deux arguments attendus/ });
  ecart(EX_AVANT, avec('voc.ex(exemple, "Ex: Catégorie A")'), { erreur: /le texte littéral de la référence/ });
  ecart(EX_AVANT, avec('voc.ex(`Ex: ${x}`, "Ex: Catégorie A")'), { erreur: /le texte littéral de la référence/ });
  ecart(EX_AVANT, avec('voc.ex("Ex: Poulet entier", neutre)'), { erreur: /voc\.ex : le 2e argument est un texte/ });
  ecart(EX_AVANT, avec('voc.avec({ sg: "Salle" }).ex("Ex: Poulet entier", "Ex: Salle 1")'), { erreur: /voc\.ex : à appeler sur voc/ });
  // Le second argument n'est pas affiché par défaut, mais ses erreurs sont signalées : le texte est identique, le code de sortie non.
  const cleInconnue = comparer(EX_AVANT, EX_APRES.replace('"article"', '"articles"'));
  assert.deepEqual([cleInconnue.moins, cleInconnue.plus], [[], []]);
  assert.ok(cleInconnue.erreurs.some((e) => /clé de lexique inconnue/.test(e.message)), JSON.stringify(cleInconnue.erreurs));
  assert.equal(cleInconnue.ok, false);
  ecart(EX_AVANT, EX_APRES.replace('voc.Nom("article")', 'voc.Nom(cle)'), { erreur: /voc\.Nom : clé non littérale/ });
  ecart(EX_AVANT, EX_APRES.replace('voc.Nom("article")} A', 'voc.Nom("article")}s'), { erreur: /collé à la suite d'un appel voc/ });
  // Une balise dans un fichier source n'est jamais rendue, pas plus dans voc.ex qu'ailleurs (R8).
  ecart(EX_AVANT, avec('voc.ex("Ex: Poulet entier", "Ex: [[Nom:article]] A")'), { erreur: /balise \[\[Nom:article\]\] dans un fichier source/ });
  // Méthode de chaîne appliquée à voc.ex : le texte affiché n'est plus celui que l'outil juge.
  assert.ok(comparer('const a = "EX: POULET";', 'const a = voc.ex("Ex: Poulet", "Ex: A").toUpperCase();').erreurs.some((e) => e.type === 'methode-chaine'));
});

test('voc.ex — residuels : le premier argument est exempté, le second est jugé comme n\'importe quel texte', () => {
  const unite = (source) => analyser(source).unites[0];
  // Le premier argument porte des termes (« Labo », « vente », « Produits ») : aucun n'est un résiduel.
  for (const source of [
    jsx('<input placeholder={voc.ex("Ex: Labo Central", `Ex: ${voc.Nom("labo")} 1`)} />'),
    jsx('<input placeholder={voc.ex("Ex: Point de vente Tunis", `Ex: ${voc.Nom("activite")} 1`)} />'),
    jsx('<input placeholder={voc.ex("Ex: Produits laitiers, articles frais", `Ex: ${voc.Nom("article")} A`)} />'),
  ]) {
    const u = unite(source);
    assert.deepEqual([u.termes, u.exemple, u.exclu], [[], false, null], source);
    assert.doesNotMatch(u.dur, /Labo|vente|Produits/, 'le texte « dur » est celui du second argument');
  }
  assert.equal(unite(EX_APRES).dur, 'Ex: ⟦voc⟧ A');
  assert.deepEqual([unite(EX_APRES).canon, unite(EX_APRES).neutre], ['Ex: Poulet entier', 'Ex: Article A']);
  // Second argument en dur : un terme du lexique y reste un résiduel ; un mot hors lexique y reste un [exemple] à admettre.
  const terme = unite(jsx('<input placeholder={voc.ex("Ex: Labo Central", "Ex: Labo 1")} />'));
  assert.deepEqual([terme.termes, terme.neutre, terme.dur], [['labo'], 'Ex: Labo 1', 'Ex: Labo 1']);
  const horsLexique = unite(jsx('<input placeholder={voc.ex("Ex: Viandes", "Ex: Catégorie A")} />'));
  assert.deepEqual([horsLexique.termes, horsLexique.exemple, horsLexique.canon, horsLexique.neutre], [[], true, 'Ex: Viandes', 'Ex: Catégorie A']);
  // Hors voc.ex, un exemple de restauration en dur reste listé : l'exemption ne vaut que pour le premier argument.
  assert.equal(unite(EX_AVANT).exemple, true);
  assert.equal(unite(jsx('<input placeholder={`Ex: Poulet ${voc.nom("article")}`} />')).exemple, true);
  // Une unité sans voc.ex n'a pas de texte neutre.
  assert.equal(unite(EX_AVANT).neutre, undefined);
  // Contexte technique : c'est le second argument qui est jugé (un premier argument en forme d'URL n'exclut rien).
  const url = unite(jsx('<input placeholder={voc.ex("https://resto.tn/labo", "Ex: site du labo")} />'));
  assert.deepEqual([url.exclu, url.termes, url.exemple], [null, ['labo'], true]);
  assert.equal(unite(jsx('<input placeholder={voc.ex("Ex: site du labo", "https://exemple.tn/labo")} />')).exclu, 'chemin ou URL');
});

test('voc.ex — accords : le second argument est analysé comme n\'importe quel texte ; la ligne miroir le rend', () => {
  // Déterminant ou accord en dur dans l'exemple neutre : signalé. Dans l'exemple de la référence : jamais.
  assert.deepEqual(signalements(jsx('<input placeholder={voc.ex("Ex: un plat", `Ex: un ${voc.nom("produit")}`)} />')), ['un/devant nom:produit']);
  assert.deepEqual(signalements(jsx('<input placeholder={voc.ex("Ex: un plat", `Ex: ${voc.nom("produit")} créé`)} />')), ['créé/apres nom:produit']);
  assert.deepEqual(signalements(jsx('<input placeholder={voc.ex("Ex: le labo créé", `Ex: ${voc.un("labo")}`)} />')), []);
  assert.deepEqual(signalements(EX_APRES), []);
  // Un mot devant voc.ex s'accorde avec le terme qui ouvre le second argument.
  assert.deepEqual(signalements('const a = `Saisir un ${voc.ex("plat", voc.nom("produit"))}`;'), ['un/devant nom:produit']);
  // Ligne miroir : « défaut » = l'exemple de la référence, « miroir » = l'exemple neutre rendu avec le lexique miroir.
  const [u] = analyser(EX_APRES).unites;
  assert.deepEqual([u.plat, u.miroir, u.voc], ['Ex: Poulet entier', 'Ex: Denrée A', ['ex:', 'Nom:article']]);
  const [dur] = analyser(jsx('<input placeholder={voc.ex("Ex: Viandes", "Ex: Catégorie A")} />')).unites;
  assert.deepEqual([dur.plat, dur.miroir, dur.voc], ['Ex: Viandes', 'Ex: Catégorie A', ['ex:']]);
  assert.equal(analyser(jsx('<input placeholder={voc.ex("Ex: LABO-001", `Ex: ${voc.MAJ("labo", false, "court")}-001`)} />')).unites[0].miroir, 'Ex: ABR-USINE-001');
});

test('balise [[ex:clé:texte par défaut]] — fr.json et messages du serveur : identité par défaut, exemption, miroir', () => {
  const [u] = analyserFr('{ "a": "Nom [[du:activite]] (ex: [[ex:activite:Restaurant A]])" }').unites;
  assert.equal(u.canon, "Nom de l'activité (ex: Restaurant A)");
  assert.equal(u.dur, 'Nom ⟦voc⟧ (ex: ⟦voc⟧)');
  assert.deepEqual([u.termes, u.accords, u.erreurs], [[], [], []]);
  assert.equal(u.miroir, 'Nom du local (ex: Local A)');
  assert.deepEqual(u.voc, ['du:activite', 'ex:activite']);
  // Messages du serveur (.js) : même rendu ; le texte par défaut porte un terme sans être un résiduel.
  assert.deepEqual(canonsJs(msg('"Nom requis (ex: [[ex:labo:Labo Central]])"')), ['Nom requis (ex: Labo Central)']);
  assert.deepEqual(candidates(msg('"Nom requis (ex: [[ex:labo:Labo Central]])"'), 'x.js'), []);
  // Un déterminant en dur devant la balise s'accorde avec le terme qu'elle rend hors restauration.
  assert.deepEqual(analyserFr('{ "a": "Créez un [[ex:labo:Labo Central]]" }').unites[0].accords.map((s) => [s.mot, s.methode, s.cle]), [['un', 'ex', 'labo']]);
  // DOIT échouer : texte par défaut absent, vide ou en double ; clé inconnue ; texte par défaut différent de la référence.
  for (const balise of ['[[ex:activite]]', '[[ex:activite:]]', '[[ex:activite:Restaurant A:B]]']) {
    const r = analyserFr(JSON.stringify({ a: `Nom (ex: ${balise})` }));
    assert.ok(r.erreurs.some((e) => /balise invalide/.test(e.message) && e.message.includes(balise)), balise);
  }
  assert.ok(analyserFr('{ "a": "[[ex:restaurant:Restaurant A]]" }').erreurs.some((e) => /clé de lexique inconnue « restaurant »/.test(e.message)));
  ecart(msg('"Nom (ex: Restaurant A)"'), msg('"Nom (ex: [[ex:activite:Restaurant B]])"'), { moins: 'Nom (ex: Restaurant A)', plus: 'Nom (ex: Restaurant B)' }, JS);
  identique(msg('"Nom (ex: Restaurant A)"'), msg('"Nom (ex: [[ex:activite:Restaurant A]])"'), JS);
  // Dans un fichier source du front, la balise n'est pas rendue (R8) : c'est voc.ex qu'il faut écrire.
  ecart(jsx('<label>Nom (ex: Restaurant A)</label>'), jsx('<label>Nom (ex: [[ex:activite:Restaurant A]])</label>'), { erreur: /balise \[\[ex:activite:Restaurant A\]\] dans un fichier source/ });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Ligne de commande, de bout en bout, sur un dépôt git jetable
// ═════════════════════════════════════════════════════════════════════════════

const temporaires = [];
test.after(() => { for (const d of temporaires) fs.rmSync(d, { recursive: true, force: true }); });

const ecrire = (racine, fichiers) => {
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const f = path.join(racine, nom);
    if (contenu === null) { fs.rmSync(f, { force: true }); continue; }
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, contenu);
  }
};
// Dépôt jetable (hors des dépôts du projet) : `fichiers` forment le commit de référence.
function depot(fichiers) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-check-'));
  temporaires.push(d);
  ecrire(d, fichiers);
  const git = (...a) => execFileSync('git', ['-C', d, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid',
    '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'reference');
  ecrire(d, { 'scripts/vocab-check.base': `${git('rev-parse', 'HEAD').trim()}\n` });
  return d;
}
const outil = (racine, ...args) => {
  const r = spawnSync(process.execPath, [OUTIL, args[0], '--root', racine, ...args.slice(1)], { encoding: 'utf8' });
  return { code: r.status, sortie: r.stdout, erreur: r.stderr };
};

const PAGE_A = jsx('<div>\n  <h1>Stock Labo</h1>\n  <p>Aucun labo créé.</p>\n  <p>{n} article{n > 1 ? "s" : ""}</p>\n</div>');
const PAGE_B = jsx('<div>\n  <h1>Stock Activité</h1>\n  <Link to="/stock-labo">Retour</Link>\n</div>');

test('CLI identite : 0 sur un arbre inchangé ou réécrit fidèlement, 1 avec fichier:ligne et avant / après sinon', () => {
  const d = depot({ 'src/A.tsx': PAGE_A, 'src/B.tsx': PAGE_B, 'src/components/admin/Admin.tsx': jsx('<p>Labos du client</p>') });
  let r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie + r.erreur);
  assert.match(r.sortie, /identite : 0 fichier\(s\) comparé\(s\).*2 inchangé\(s\).* 0 écart\(s\), 0 erreur\(s\)/, 'A et B : l\'espace admin est hors périmètre');

  // Réécriture fidèle (CRLF compris) : conforme.
  ecrire(d, { 'src/A.tsx': jsx('<div>\n  <h1>Stock {voc.Court("labo")}</h1>\n  <p>{voc.Aucun("labo")} {voc.acc("labo", "créé", "créée")}.</p>\n  <p>{voc.n("article", n)}</p>\n</div>').replace(/\n/g, '\r\n') });
  r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie + r.erreur);
  assert.match(r.sortie, /identite : 1 fichier\(s\) comparé\(s\).* 0 écart\(s\)/);

  // Un caractère de différence : écart localisé.
  ecrire(d, { 'src/A.tsx': PAGE_A.replace('Aucun labo créé.', 'Aucun labo crée.') });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:3\n {2}avant : « Aucun labo créé\. » {2}\(référence l\. 3\)\n {2}après : « Aucun labo crée\. »$/m);
  assert.match(r.sortie, /— 1 écart\(s\), 0 erreur\(s\)/);

  // Fichier demandé explicitement, chemin à la Windows, et fichier hors périmètre par défaut (admin).
  r = outil(d, 'identite', 'src\\B.tsx');
  assert.equal(r.code, 0, r.sortie);
  ecrire(d, { 'src/A.tsx': PAGE_A, 'src/components/admin/Admin.tsx': jsx('<p>Labos du compte</p>') });
  r = outil(d, 'identite');
  assert.equal(r.code, 0, 'l\'espace admin est hors périmètre par défaut');
  assert.match(r.sortie, /src\/components\/admin\/Admin\.tsx : modifié, hors périmètre par défaut/, 'mais un fichier admin modifié est nommé');
  r = outil(d, 'identite', 'src/components/admin/Admin.tsx');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /Admin\.tsx:1\n {2}avant : « Labos du client »/);

  // Erreur du moteur (clé non littérale) : ligne d'erreur et code 1.
  ecrire(d, { 'src/A.tsx': PAGE_A.replace('Stock Labo', 'Stock {voc.Court(cle)}') });
  r = outil(d, 'identite', 'src/A.tsx');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:2 {2}ERREUR voc\.Court : clé non littérale/m);
});

test('CLI identite : DOIT échouer — libellés permutés entre deux fichiers ; --ensemble compare l\'union', () => {
  const d = depot({ 'src/A.tsx': PAGE_A, 'src/B.tsx': PAGE_B });
  ecrire(d, { 'src/A.tsx': PAGE_A.replace('Stock Labo', 'Stock Activité'), 'src/B.tsx': PAGE_B.replace('Stock Activité', 'Stock Labo') });
  let r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /src\/A\.tsx:2\n {2}avant : « Stock Labo ».*\n {2}après : « Stock Activité »/);
  assert.match(r.sortie, /src\/B\.tsx:2\n {2}avant : « Stock Activité ».*\n {2}après : « Stock Labo »/);
  assert.match(r.sortie, /— 2 écart\(s\)/);
  r = outil(d, 'identite', 'src/A.tsx', 'src/B.tsx');
  assert.equal(r.code, 1, 'sans --ensemble, la comparaison reste par fichier');
  // Avec --ensemble : l'union des deux fichiers est inchangée (chaînes déplacées).
  r = outil(d, 'identite', '--ensemble', 'src/A.tsx', 'src/B.tsx');
  assert.equal(r.code, 0, r.sortie);
  // Chaîne déplacée vers un nouveau fichier : écart par fichier, conforme en ensemble, écart si le texte change en route.
  ecrire(d, { 'src/A.tsx': PAGE_A.replace('<h1>Stock Labo</h1>', '<h1>{titre(voc)}</h1>'), 'src/B.tsx': PAGE_B, 'src/titres.ts': 'export const titre = (voc) => `Stock ${voc.Court("labo")}`;\n' });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /src\/titres\.ts:1\n {2}avant : \(rien\)\n {2}après : « Stock Labo »/);
  assert.match(r.sortie, /src\/titres\.ts : nouveau fichier/);
  assert.equal(outil(d, 'identite', '--ensemble', 'src/A.tsx', 'src/titres.ts').code, 0);
  ecrire(d, { 'src/titres.ts': 'export const titre = (voc) => `Stock ${voc.Court("labo", true)}`;\n' });
  r = outil(d, 'identite', '--ensemble', 'src/A.tsx', 'src/titres.ts');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /ENSEMBLE src\/A\.tsx \+ src\/titres\.ts/);
  assert.match(r.sortie, /avant : « Stock Labo ».*\n {2}après : « Stock Labos »/);
  // Fichier supprimé : ses textes ont disparu.
  ecrire(d, { 'src/A.tsx': PAGE_A, 'src/titres.ts': null, 'src/B.tsx': null });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /src\/B\.tsx : fichier supprimé/);
  assert.match(r.sortie, /avant : « Stock Activité »\n {2}après : \(rien\)/);
});

test('CLI identite : écarts admis par scripts/vocab-allow/*.json, entrée invalide = code 2', () => {
  const d = depot({ 'src/A.tsx': jsx('<p>Aucun {isLabo ? "labo" : "activité"} disponible.</p>') });
  ecrire(d, { 'src/A.tsx': jsx('<p>{voc.Aucun(isLabo ? "labo" : "activite")} disponible.</p>') });
  let r = outil(d, 'identite', '--proposer-allow');
  assert.equal(r.code, 1);
  const proposees = JSON.parse(r.sortie.slice(r.sortie.indexOf('[\n')));
  assert.deepEqual(proposees, [{ fichier: 'src/A.tsx', avant: 'Aucun ⟦?labo|activité⟧ disponible.', apres: '⟦?Aucun labo|Aucune activité⟧ disponible.', type: 'À CHOISIR', justification: '' }]);
  // La proposition recopiée telle quelle est refusée : le type et la justification sont à écrire.
  ecrire(d, { 'scripts/vocab-allow/F6.json': JSON.stringify(proposees) });
  r = outil(d, 'identite');
  assert.equal(r.code, 2);
  assert.match(r.erreur, /F6\.json\[0\] : type « À CHOISIR » inconnu/);
  assert.match(r.erreur, /F6\.json\[0\] : justification manquante/);
  ecrire(d, { 'scripts/vocab-allow/F6.json': JSON.stringify([{ ...proposees[0], type: 'faute-corrigee', justification: 'Faute d\'origine « Aucun activité » corrigée par voc.Aucun.' }]) });
  r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /écarts admis \(allow\) : 1 entrée\(s\) — faute-corrigee 1/);
  assert.equal(outil(d, 'identite', '--sans-allow').code, 1);
  // L'entrée ne vaut que pour SON texte…
  ecrire(d, { 'src/A.tsx': jsx('<p>{voc.Aucun(isLabo ? "labo" : "activite")} disponibles.</p>') });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  // … et une entrée qui ne sert plus est montrée du doigt.
  assert.match(r.sortie, /allow sans objet : F6\.json\[0\] \(src\/A\.tsx\)/);
});

test('CLI identite : une entrée allow ne vaut que pour SON fichier', () => {
  const avant = jsx('<p>Aucun {isLabo ? "labo" : "activité"} disponible.</p>');
  const apres = jsx('<p>{voc.Aucun(isLabo ? "labo" : "activite")} disponible.</p>');
  const d = depot({ 'src/A.tsx': avant, 'src/B.tsx': avant });
  ecrire(d, { 'src/A.tsx': apres, 'src/B.tsx': apres });
  const entree = (fichier) => ({ fichier, avant: 'Aucun ⟦?labo|activité⟧ disponible.', apres: '⟦?Aucun labo|Aucune activité⟧ disponible.', type: 'faute-corrigee', justification: 'Faute d\'origine corrigée par voc.Aucun.' });
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([entree('src/A.tsx')]) });
  let r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/B\.tsx:1$/m);
  assert.doesNotMatch(r.sortie, /^src\/A\.tsx:1$/m);
  assert.match(r.sortie, /— 1 écart\(s\)/);
  // … même quand les deux fichiers sont contrôlés séparément.
  assert.equal(outil(d, 'identite', 'src/B.tsx').code, 1);
  assert.equal(outil(d, 'identite', 'src/A.tsx').code, 0);
  ecrire(d, { 'scripts/vocab-allow/F2.json': JSON.stringify([entree('src/B.tsx')]) });
  r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /écarts admis \(allow\) : 2 entrée\(s\) — faute-corrigee 2/);
});

test('CLI identite : DOIT échouer — une erreur sans écart de texte donne quand même le code 1', () => {
  const d = depot({ 'src/A.tsx': jsx('<p>Vos labos</p>'), 'src/q.js': 'exports.f = (pool) => pool.query(`SELECT \'Labo\' AS site FROM labos`);\n' });
  // « {voc.nom('labo')}s » rend « labos » par défaut : aucun écart de texte, mais un pluriel maison.
  ecrire(d, { 'src/A.tsx': jsx('<p>Vos {voc.nom("labo")}s</p>') });
  let r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:1 {2}ERREUR texte « s » collé à la suite d'un appel voc/m);
  assert.match(r.sortie, /— 0 écart\(s\), 1 erreur\(s\)/);
  // Aucune entrée allow n'éteint une erreur.
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([{ fichier: 'src/A.tsx', avant: 'Vos labos', apres: 'Vos labos', type: 'provisoire', justification: 'Tentative de faire taire une erreur.', mode: ['identite', 'residuels', 'accords'] }]) });
  assert.equal(outil(d, 'identite').code, 1);
  // Appel voc dans une requête SQL : même texte par défaut, erreur quand même.
  ecrire(d, { 'scripts/vocab-allow/F1.json': null, 'src/A.tsx': jsx('<p>Vos labos</p>'), 'src/q.js': 'exports.f = (pool, voc) => pool.query(`SELECT \'${voc.Nom("labo")}\' AS site FROM labos`);\n' });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/q\.js:1 {2}ERREUR appel voc dans une requête SQL/m);
  assert.match(r.sortie, /— 0 écart\(s\), 1 erreur\(s\)/);
});

test('CLI identite : fr.json — clé purgée sans écart, valeur balisée rendue, valeur changée signalée', () => {
  const fr = (o) => `${JSON.stringify(o, null, 2)}\n`;
  const d = depot({
    'src/i18n/locales/fr.json': fr({ nav: { labo: 'Stock Labo', morte: 'Jamais lue', titre: 'Mes activités' } }),
    'src/A.tsx': jsx('<h1>{t("nav.labo")} — {t("nav.absente", "Activités")}</h1>'),
  });
  // Purge + balisage + clé absente ajoutée, appel t() inchangé ou simplifié : conforme.
  ecrire(d, {
    'src/i18n/locales/fr.json': fr({ nav: { labo: '[[Nom:stock]] [[Court:labo]]', titre: '[[Mon:activite:pl]]', absente: '[[Pl:activite]]' } }),
    'src/A.tsx': jsx('<h1>{t("nav.labo")} — {t("nav.absente")}</h1>'),
  });
  let r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /fr\.json : 3 clé\(s\), 1 purgée\(s\), 1 ajoutée\(s\)/);
  // Valeur rendue différente de la référence : écart, avec la clé.
  ecrire(d, { 'src/i18n/locales/fr.json': fr({ nav: { labo: '[[Nom:stock]] [[Court:labo:pl]]', titre: '[[Mon:activite:pl]]', absente: '[[Pl:activite]]' } }) });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /src\/i18n\/locales\/fr\.json:3 \(nav\.labo\)\n {2}avant : « Stock Labo ».*\n {2}après : « Stock Labos »/);
  // Le même changement se voit aussi dans le fichier qui appelle t('nav.labo').
  r = outil(d, 'identite', 'src/A.tsx');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /avant : « Stock Labo — Activités ».*\n {2}après : « Stock Labos — Activités »/);
  // Clé purgée mais encore appelée : le texte a disparu de l'écran, c'est un écart dans le fichier appelant.
  ecrire(d, { 'src/i18n/locales/fr.json': fr({ nav: { titre: '[[Mon:activite:pl]]', absente: '[[Pl:activite]]' } }) });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /après : « ⟦t:nav\.labo⟧ — Activités »/);
  // Balise invalide dans fr.json : erreur.
  ecrire(d, { 'src/i18n/locales/fr.json': fr({ nav: { labo: '[[Nom:stock]] [[Courte:labo]]', titre: 'Mes activités' } }), 'src/A.tsx': jsx('<h1>{t("nav.titre")}</h1>') });
  r = outil(d, 'identite', 'src/i18n/locales/fr.json');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /fr\.json:3 {2}ERREUR balise invalide \[\[Courte:labo\]\]/);
});

test('CLI --root : un dépôt backend (JS CommonJS, req.voc, messages balisés)', () => {
  const avant = "const pool = require('../db');\nexports.lire = async (req, res) => {\n  const r = await pool.query('SELECT id FROM labos WHERE id = $1', [req.params.id]);\n  if (!r.rows.length) return res.status(404).json({ message: 'Labo introuvable' });\n  res.json({ titre: `Stock du labo ${r.rows[0].id}` });\n};\n";
  const d = depot({ 'src/controllers/laboController.js': avant, 'src/utils/vocab.js': '// moteur généré\nmodule.exports = {};\n' });
  ecrire(d, {
    'src/controllers/laboController.js': avant.replace("'Labo introuvable'", "'[[Nom:labo]] introuvable'").replace('Stock du labo ${', 'Stock ${req.voc.du("labo")} ${').replace("require('../db')", "require('../config/db')"),
    'src/utils/vocab.js': '// moteur régénéré\nmodule.exports = { x: "Laboratoire" };\n',
  });
  let r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie + r.erreur);
  assert.match(r.sortie, /1 fichier\(s\) comparé\(s\)/, 'le moteur généré (src/utils/vocab.js) est hors périmètre');
  ecrire(d, { 'src/controllers/laboController.js': avant.replace("'Labo introuvable'", "'[[Nom:labo:pl]] introuvable'") });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /laboController\.js:4\n {2}avant : « Labo introuvable ».*\n {2}après : « Labos introuvable »/);
  // residuels : le SQL n'est pas un texte ; le message et le titre en dur le sont.
  ecrire(d, { 'src/controllers/laboController.js': avant });
  r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /laboController\.js:4 {2}\[labo\] {2}« Labo introuvable »/);
  assert.match(r.sortie, /laboController\.js:5 {2}\[labo, stock\] {2}« Stock du labo ⟦·⟧ »/);
  assert.doesNotMatch(r.sortie, /SELECT/);
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 2 unité\(s\) dans 1 fichier\(s\)/);
});

test('CLI residuels : liste, décompte par fichier, écarts admis par unité entière ou par extrait', () => {
  const d = depot({
    'src/A.tsx': jsx('<div>\n  <p>Prix de vente du labo</p>\n  <p>Formule Activité Basique</p>\n  <p>Vente</p>\n  <p>{x === "labo" ? 1 : 2}</p>\n</div>'),
    'src/components/auth/Login.tsx': jsx('<p>Votre labo</p>'),
  });
  let r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:2 {2}\[labo, vente\] {2}« Prix de vente du labo »$/m);
  assert.match(r.sortie, /^src\/A\.tsx:3 {2}\[activite\] {2}« Formule Activité Basique »$/m);
  assert.match(r.sortie, /^ {4}3 {2}src\/A\.tsx$/m);
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 3 unité\(s\) dans 1 fichier\(s\)/, 'les pages publiques (auth) sont hors périmètre');
  const entree = (avant, type, justification = 'Justification relue en revue.') => ({ fichier: 'src/A.tsx', avant, apres: avant, type, justification });
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([
    entree('Prix de vente', 'locution'), // extrait : « labo » reste à traiter dans la même unité
    entree('Formule Activité Basique', 'formule'), // unité entière
    entree('Vente', 'homonyme'), // unité entière d'un seul mot
  ]) });
  r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:2 {2}\[labo\] {2}« Prix de vente du labo »$/m);
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 1 unité\(s\)/);
  assert.match(r.sortie, /écarts admis \(allow\) : 3 entrée\(s\) — locution 1, formule 1, homonyme 1/);
  // Un extrait réduit à un terme ne masque rien (il ferait taire l'outil pour tout le fichier).
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([entree('labo', 'homonyme'), entree('Prix de vente', 'locution'), entree('Formule Activité Basique', 'formule'), entree('Vente', 'homonyme')]) });
  assert.equal(outil(d, 'residuels').code, 1);
  // Réécrit : plus rien.
  ecrire(d, { 'src/A.tsx': jsx('<div>\n  <p>Prix de vente {voc.du("labo")}</p>\n  <p>Formule Activité Basique</p>\n  <p>Vente</p>\n</div>') });
  r = outil(d, 'residuels');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 0 unité\(s\)/);
});

test('allow commun (fichier "*") : un extrait resté en dur, pour tous les fichiers ; jamais un terme seul ni un autre mode', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-allow-'));
  try {
    const bon = { fichier: '*', avant: 'prix de vente', apres: 'prix de vente', type: 'locution', justification: 'Locution figée (spec §3 règle 4).' };
    fs.writeFileSync(path.join(d, '_global.json'), JSON.stringify([bon]));
    const ok = chargerAllow(d);
    assert.deepEqual(ok.problemes, []);
    assert.deepEqual(ok.entrees.map((e) => [e.fichier, e.lot, e.modes]), [['*', '_global', ['residuels']]]);
    const mauvais = [
      [{ ...bon, avant: 'Labo', apres: 'Labo' }, /jamais le terme seul/],
      [{ ...bon, avant: 'Labos', apres: 'labos' }, /ne vaut que pour le mode residuels/],
      [{ ...bon, avant: null }, /ne vaut que pour le mode residuels/],
      [{ ...bon, mode: 'identite' }, /ne vaut que pour le mode residuels/],
      [{ ...bon, mode: 'accords' }, /ne vaut que pour le mode residuels/],
      [{ ...bon, mode: ['residuels', 'accords'] }, /ne vaut que pour le mode residuels/],
    ];
    for (const [entree, motif] of mauvais) {
      fs.writeFileSync(path.join(d, '_global.json'), JSON.stringify([entree]));
      const r = chargerAllow(d);
      assert.equal(r.problemes.length, 1, JSON.stringify(entree));
      assert.match(r.problemes[0], motif);
    }
    fs.writeFileSync(path.join(d, '_global.json'), JSON.stringify([{ ...bon, mode: 'residuels' }]));
    assert.deepEqual(chargerAllow(d).problemes, []);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('CLI residuels : scripts/vocab-allow/_global.json vaut pour tous les fichiers, et pour ce mode seulement', () => {
  const page = (titre) => jsx(`<div>\n  <p>${titre}</p>\n  <p>Saisissez un prix de vente pour le labo</p>\n  <p>Formule Activité Premium requise</p>\n  <p>Vente</p>\n</div>`);
  const d = depot({ 'src/A.tsx': page('Page A'), 'src/sous/B.tsx': page('Page B') });
  let r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /residuels : 2 fichier\(s\), 6 unité\(s\) dans 2 fichier\(s\)/);
  const commun = (extrait, type) => ({ fichier: '*', avant: extrait, apres: extrait, type, justification: 'Exclusion commune à tous les lots (spec §3 règle 4).' });
  ecrire(d, { 'scripts/vocab-allow/_global.json': JSON.stringify([commun('prix de vente', 'locution'), commun('Activité Premium', 'formule'), commun('Supplément Labo', 'formule')]) });
  r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  // Dans les DEUX fichiers : la locution est masquée (il reste « labo »), la formule est admise, « Vente » seul reste.
  for (const f of ['src/A.tsx', 'src/sous/B.tsx']) {
    assert.match(r.sortie, new RegExp(`^${f.replace(/[./]/g, '\\$&')}:3 {2}\\[labo\\] {2}« Saisissez un prix de vente pour le labo »$`, 'm'));
    assert.match(r.sortie, new RegExp(`^${f.replace(/[./]/g, '\\$&')}:5 {2}\\[vente\\] {2}« Vente »$`, 'm'));
  }
  assert.doesNotMatch(r.sortie, /Formule Activité Premium requise/);
  assert.match(r.sortie, /residuels : 2 fichier\(s\), 4 unité\(s\) dans 2 fichier\(s\)/);
  assert.match(r.sortie, /écarts admis \(allow\) : 2 entrée\(s\) — locution 1, formule 1/);
  // Une entrée commune restée sans emploi est montrée par un passage complet, pas par un passage sur un fichier.
  assert.match(r.sortie, /allow sans objet : _global\.json\[2\] \(\*\) — « Supplément Labo »/);
  assert.doesNotMatch(outil(d, 'residuels', 'src/A.tsx').sortie, /allow sans objet/);
  // Réécrit avec voc : l'extrait commun continue de masquer la locution, plus rien ne reste.
  const propre = (titre) => jsx(`<div>\n  <p>${titre}</p>\n  <p>Saisissez un prix de vente pour {voc.le("labo")}</p>\n  <p>Formule Activité Premium requise</p>\n  <p>{voc.Nom("vente")}</p>\n</div>`);
  ecrire(d, { 'src/A.tsx': propre('Page A'), 'src/sous/B.tsx': propre('Page B') });
  r = outil(d, 'residuels');
  assert.equal(r.code, 0, r.sortie);
  // L'entrée commune n'admet AUCUN écart d'identité : un texte changé reste un écart, dans chaque fichier.
  ecrire(d, { 'src/A.tsx': propre('Page A').replace('prix de vente', 'prix de ventes') });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /avant : « Saisissez un prix de vente pour le labo ».*\n {2}après : « Saisissez un prix de ventes pour le labo »/);
  // Entrée commune invalide (terme seul) : configuration refusée, code 2.
  ecrire(d, { 'scripts/vocab-allow/_global.json': JSON.stringify([commun('Vente', 'homonyme')]) });
  r = outil(d, 'residuels');
  assert.equal(r.code, 2);
  assert.match(r.erreur, /_global\.json\[0\] : une entrée « fichier: "\*" » doit porter le terme avec au moins un autre mot/);
});

test('CLI accords : signalement = code 1 ; le fichier vocab-accords.txt n\'est réécrit que par un passage complet', () => {
  const d = depot({ 'src/A.tsx': jsx('<p>Aucun labo créé.</p>'), 'src/B.tsx': jsx('<p>x</p>') });
  ecrire(d, { 'src/A.tsx': jsx('<p>Aucun {voc.nom("labo")} créé.</p>'), 'src/B.tsx': jsx('<p>{voc.Votre("activite")}</p>') });
  const sortie = path.join(d, 'scripts', 'vocab-accords.txt');
  let r = outil(d, 'accords', 'src/A.tsx');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:1 {2}« aucun » devant voc\.nom\('labo'\) {2}« Aucun labo créé\. »$/m);
  assert.match(r.sortie, /miroir : Aucun usine créé\./);
  assert.equal(fs.existsSync(sortie), false, 'passage partiel : le fichier partagé n\'est pas écrit');
  assert.match(r.sortie, /^src\/A\.tsx:1 {2}« créé » après voc\.nom\('labo'\) {2}« Aucun labo créé\. »$/m);
  r = outil(d, 'accords');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /accords : 2 fichier\(s\), 2 signalement\(s\) ; 2 unité\(s\) à appel voc écrite\(s\) dans scripts\/vocab-accords\.txt/);
  const texte = fs.readFileSync(sortie, 'utf8');
  assert.match(texte, /src\/A\.tsx\n {2}l\. 1\n {4}défaut : Aucun labo créé\.\n {4}miroir : Aucun usine créé\.\n/);
  assert.match(texte, /src\/B\.tsx\n {2}l\. 1\n {4}défaut : Votre activité\n {4}miroir : Votre local\n/);
  // Une entrée allow ordinaire (residuels) n'éteint pas un signalement d'accord ; il faut mode: "accords".
  const entree = { fichier: 'src/A.tsx', avant: 'Aucun labo créé.', apres: 'Aucun labo créé.', type: 'provisoire', justification: 'En attente de voc.aucun au pluriel (besoin F1).' };
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([entree]) });
  assert.equal(outil(d, 'accords').code, 1);
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([{ ...entree, mode: 'accords' }]) });
  r = outil(d, 'accords');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /rappel : 1 entrée\(s\) allow de type « provisoire »/);
  // Corrigé : plus de signalement, et le miroir s'accorde.
  ecrire(d, { 'scripts/vocab-allow/F1.json': null, 'src/A.tsx': jsx('<p>{voc.Aucun("labo")} {voc.acc("labo", "créé", "créée")}.</p>') });
  r = outil(d, 'accords');
  assert.equal(r.code, 0, r.sortie);
  assert.match(fs.readFileSync(sortie, 'utf8'), /miroir : Aucune usine créée\./);
});

test('CLI inventaire : JSON par fichier (texte, ligne, termes, clés voc)', () => {
  const d = depot({ 'src/A.tsx': PAGE_A, 'src/B.tsx': jsx('<p>{voc.Votre("activite")} — <Link to="/stock-labo">Stock</Link></p>') });
  const r = outil(d, 'inventaire');
  assert.equal(r.code, 0, r.erreur);
  const inv = JSON.parse(r.sortie);
  assert.deepEqual(Object.keys(inv.fichiers), ['src/A.tsx', 'src/B.tsx']);
  assert.deepEqual(inv.fichiers['src/A.tsx'].unites.map((u) => [u.l, u.texte, u.termes, u.candidate]), [
    [2, 'Stock Labo', ['labo', 'stock'], true],
    [3, 'Aucun labo créé.', ['labo'], true],
    [4, `${TROU} ⟦article|articles@>1⟧`, ['article'], true],
  ]);
  assert.deepEqual(inv.fichiers['src/B.tsx'].unites.map((u) => [u.texte, u.termes, u.voc, u.candidate, u.exclu ?? null]), [
    ['Votre activité — ⟦<Link>⟧', [], ['Votre:activite'], false, null],
    ['/stock-labo', ['labo', 'stock'], [], false, 'attribut to'],
    ['Stock', ['stock'], [], true, null],
  ]);
  assert.deepEqual([inv.resume.fichiers, inv.resume.candidates, inv.resume.exclues, inv.resume.unitesVoc], [2, 4, 1, 1]);
  assert.deepEqual(inv.resume.parCle, { labo: 2, stock: 2, article: 1 });
  assert.match(r.erreur, /inventaire : 2 fichier\(s\)/);
});

test('CLI : usage et configuration — code 2', () => {
  const d = depot({ 'src/A.tsx': PAGE_A });
  assert.equal(outil(d, 'verifier').code, 2);
  assert.equal(outil(d, 'identite', '--inconnue').code, 2);
  assert.equal(outil(d, 'residuels', 'src/Absent.tsx').code, 2);
  const absent = outil(d, 'identite', 'src/Absent.tsx');
  assert.equal(absent.code, 2);
  assert.match(absent.erreur, /src\/Absent\.tsx : introuvable/);
  fs.rmSync(path.join(d, 'scripts', 'vocab-check.base'));
  const r = outil(d, 'identite');
  assert.equal(r.code, 2);
  assert.match(r.erreur, /référence absente/);
  assert.equal(outil(d, 'identite', '--base', 'HEAD').code, 0, '--base remplace le fichier');
  ecrire(d, { 'scripts/vocab-check.base': 'pas un sha\n' });
  assert.equal(outil(d, 'identite').code, 2);
  ecrire(d, { 'scripts/vocab-check.base': `${'0'.repeat(40)}\n` });
  const g = outil(d, 'identite');
  assert.equal(g.code, 2);
  assert.match(g.erreur, /git a échoué/);
});

test('CLI identite : allow « avant: null » / « apres: null » — `occurrences` unités au plus (défaut 1), entrée nommée dans le rapport', () => {
  const d = depot({ 'src/A.tsx': jsx('<div><p>Ancien texte</p><p>Ancien texte</p></div>') });
  ecrire(d, { 'src/A.tsx': jsx('<div><p>{x === "labo" ? 1 : 2}</p><span>labo</span><span>labo</span><span>labo</span></div>') });
  let r = outil(d, 'identite', '--sans-allow');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /— 7 écart\(s\)/, r.sortie); // 4 × « labo », 1 × « ⟦?1|2⟧ », 2 × « Ancien texte »
  const entree = (avant, apres, extra = {}) => ({ fichier: 'src/A.tsx', avant, apres, type: 'discriminant', justification: 'Valeur technique ajoutée, jamais affichée.', ...extra });
  // Sans `occurrences` : UNE unité par entrée. Les trois <span>labo</span> visibles ne passent pas avec la comparaison.
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([entree(null, 'labo'), entree(null, '⟦?1|2⟧'), entree('Ancien texte', null)]) });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /— 4 écart\(s\)/, r.sortie); // il reste 3 × « labo » et 1 × « Ancien texte »
  assert.equal((r.sortie.match(/après : « labo »/g) || []).length, 3);
  assert.equal((r.sortie.match(/avant : « Ancien texte »/g) || []).length, 1);
  // Avec le nombre exact : conforme, et l'entrée qui absorbe plusieurs unités est nommée.
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([entree(null, 'labo', { occurrences: 4 }), entree(null, '⟦?1|2⟧'), entree('Ancien texte', null, { occurrences: 2 })]) });
  r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /F1\.json\[0\] : 4 unités absorbées — « labo »/);
  assert.match(r.sortie, /F1\.json\[2\] : 2 unités absorbées — « Ancien texte »/);
  // `occurrences` invalide, ou posé sur une paire avant → apres : configuration refusée.
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([entree(null, 'labo', { occurrences: 0 })]) });
  r = outil(d, 'identite');
  assert.equal(r.code, 2);
  assert.match(r.erreur, /« occurrences » doit être un entier ≥ 1/);
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([entree('Ancien texte', 'labo', { occurrences: 2 })]) });
  r = outil(d, 'identite');
  assert.equal(r.code, 2);
  assert.match(r.erreur, /« occurrences » ne vaut que pour une entrée « avant: null » ou « apres: null »/);
});

test('CLI identite --ensemble : une entrée allow reste attachée à SON fichier', () => {
  const d = depot({ 'src/A.tsx': jsx('<h1>Stock Labo</h1>'), 'src/B.tsx': jsx('<p>x</p>') });
  // Texte nouveau dans A ET dans B ; l'entrée « avant: null » de A ne couvre pas B, même en --ensemble.
  ecrire(d, { 'src/A.tsx': jsx('<h1>Stock Labo</h1><span>labo</span>'), 'src/B.tsx': jsx('<p>x</p><span>labo</span>') });
  const nouveau = { fichier: 'src/A.tsx', avant: null, apres: 'labo', type: 'discriminant', justification: 'Valeur technique ajoutée dans A.', occurrences: 5 };
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([nouveau]) });
  let r = outil(d, 'identite', '--ensemble', 'src/A.tsx', 'src/B.tsx');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/B\.tsx:1\n {2}avant : \(rien\)\n {2}après : « labo »$/m);
  assert.match(r.sortie, /— 1 écart\(s\)/);
  // Chaîne déplacée ET modifiée : la paire de A couvre le texte arrivé dans l'autre fichier de l'ensemble…
  ecrire(d, { 'src/A.tsx': jsx('<h1>{titre(voc)}</h1>'), 'src/B.tsx': jsx('<p>x</p>'), 'src/titres.ts': 'export const titre = (voc) => `Stock ${voc.Court("labo", true)}`;\n' });
  const paire = { fichier: 'src/A.tsx', avant: 'Stock Labo', apres: 'Stock Labos', type: 'faute-corrigee', justification: 'Titre mis au pluriel en le déplaçant (décision du lot).' };
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([paire]) });
  r = outil(d, 'identite', '--ensemble', 'src/A.tsx', 'src/titres.ts');
  assert.equal(r.code, 0, r.sortie);
  // … mais pas une paire dont AUCUN côté n'est dans le fichier de l'entrée (B est modifié, sans texte changé).
  ecrire(d, { 'src/B.tsx': `${jsx('<p>x</p>')}\n// retouche sans texte\n`, 'scripts/vocab-allow/F1.json': JSON.stringify([{ ...paire, fichier: 'src/B.tsx' }]) });
  r = outil(d, 'identite', '--ensemble', 'src/A.tsx', 'src/B.tsx', 'src/titres.ts');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /ENSEMBLE src\/A\.tsx \+ src\/B\.tsx \+ src\/titres\.ts/);
  assert.match(r.sortie, /avant : « Stock Labo ».*\n {2}après : « Stock Labos »/);
});

test('CLI residuels et accords : extrait à mot plein, texte « dur » entier, entrée accords par fichier', () => {
  const d = depot({ 'src/A.tsx': jsx('<div><p>Stock du labo</p><p>Historique du labo</p><p>Pertes du labo et du labo voisin</p></div>') });
  // Un extrait « déterminant + terme » ne masque rien : il ferait taire l'outil pour tout le fichier.
  const entree = (fichier, texte, extra = {}) => ({ fichier, avant: texte, apres: texte, type: 'locution', justification: 'Locution jugée figée par le lot.', ...extra });
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([entree('src/A.tsx', 'du labo'), entree('src/A.tsx', 'pour le labo')]) });
  let r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:1 {2}\[labo\] {2}« Historique du labo »$/m);
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 3 unité\(s\)/);
  // Même règle pour une entrée commune à tous les fichiers.
  ecrire(d, { 'scripts/vocab-allow/F1.json': null, 'scripts/vocab-allow/_global.json': JSON.stringify([entree('*', 'du labo')]) });
  r = outil(d, 'residuels');
  assert.equal(r.code, 2);
  assert.match(r.erreur, /doit porter le terme avec au moins un autre mot/);
  // Unité à appel voc : l'entrée se donne par le texte canonique OU par le texte « dur » (appels masqués) —
  // en entier ; un extrait « appel voc + terme » ne masque rien (le marqueur ⟦voc⟧ n'est pas un mot plein).
  ecrire(d, { 'scripts/vocab-allow/_global.json': null, 'src/A.tsx': jsx('<div><p>{voc.Nom("stock")} Labo</p><p>Le {voc.nom("stock")} Labo central</p></div>'), 'src/B.tsx': jsx('<p>Aucun {voc.nom("labo")} ici</p>'), 'src/C.tsx': jsx('<p>Aucun {voc.nom("labo")} ici</p>') });
  r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /residuels : 3 fichier\(s\), 2 unité\(s\)/);
  ecrire(d, { 'scripts/vocab-allow/F1.json': JSON.stringify([entree('src/A.tsx', '⟦voc⟧ Labo', { type: 'homonyme' })]) });
  r = outil(d, 'residuels');
  assert.equal(r.code, 1, 'la 1re unité est admise par son texte « dur » entier ; la 2e, qui le contient, ne l\'est pas');
  assert.match(r.sortie, /^src\/A\.tsx:1 {2}\[labo\] {2}« Le stock Labo central »$/m);
  assert.match(r.sortie, /residuels : 3 fichier\(s\), 1 unité\(s\)/);
  ecrire(d, { 'src/A.tsx': jsx('<div><p>{voc.Nom("stock")} Labo</p></div>') });
  r = outil(d, 'residuels');
  assert.equal(r.code, 0, r.sortie);
  // Une entrée accords ne vaut que pour SON fichier : C reste signalé.
  ecrire(d, { 'scripts/vocab-allow/F2.json': JSON.stringify([entree('src/B.tsx', 'Aucun labo ici', { type: 'provisoire', mode: 'accords' })]) });
  r = outil(d, 'accords');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/C\.tsx:1 {2}« aucun » devant voc\.nom\('labo'\)/m);
  assert.doesNotMatch(r.sortie, /^src\/B\.tsx:1 {2}« aucun »/m);
  assert.match(r.sortie, /accords : 3 fichier\(s\), 1 signalement\(s\)/);
});

test('CLI residuels : exemple de saisie en dur listé « [exemple] » ; admis par l\'unité entière seulement', () => {
  const d = depot({ 'src/A.tsx': jsx('<div><input placeholder="Ex. Burger, Pizza Margherita…" /><input placeholder="Ex: kg, L, pièce…" /></div>') });
  let r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:1 {2}\[exemple\] {2}« Ex\. Burger, Pizza Margherita… »$/m);
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 2 unité\(s\)/);
  // Exemple neutre (unités de mesure) : admis tel quel ; exemple propre à la restauration : réécrit.
  ecrire(d, {
    'scripts/vocab-allow/F9.json': JSON.stringify([{ fichier: 'src/A.tsx', avant: 'Ex: kg, L, pièce…', apres: 'Ex: kg, L, pièce…', type: 'exemple', justification: 'Unités de mesure citées en exemple : neutres dans tous les domaines.' }]),
    'src/A.tsx': jsx('<div><input placeholder={`Ex. ${voc.Nom("produit")} A`} /><input placeholder="Ex: kg, L, pièce…" /></div>'),
  });
  r = outil(d, 'residuels');
  assert.equal(r.code, 0, r.sortie);
  const inv = JSON.parse(outil(d, 'inventaire').sortie);
  assert.deepEqual(inv.fichiers['src/A.tsx'].unites.map((u) => [u.texte, u.termes]), [['Ex. Produit A', []], ['Ex: kg, L, pièce…', ['exemple']]]);
});

test('CLI identite : fr.json — une clé AJOUTÉE est comparée au défaut de son point d\'appel', () => {
  const fr = (o) => `${JSON.stringify(o, null, 2)}\n`;
  const FR = 'src/i18n/locales/fr.json';
  const d = depot({ [FR]: fr({ nav: { a: 'A' } }), 'src/A.tsx': jsx('<h1>{t("nav.stock_labo", "Stock Labo")} {t("nav.a")}</h1>') });
  // Valeur ajoutée = défaut du point d'appel : conforme, que l'appel garde son 2e argument ou non.
  ecrire(d, { [FR]: fr({ nav: { a: 'A', stock_labo: '[[Nom:stock]] [[Court:labo]]' } }) });
  let r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /fr\.json : 2 clé\(s\), 0 purgée\(s\), 1 ajoutée\(s\)/);
  // Valeur ajoutée ≠ défaut : l'écran change (« Stock Labos ») alors que le fichier appelant est inchangé.
  ecrire(d, { [FR]: fr({ nav: { a: 'A', stock_labo: '[[Nom:stock]] [[Court:labo:pl]]' } }) });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /src\/i18n\/locales\/fr\.json:4 \(nav\.stock_labo\)\n {2}avant : « Stock Labo ».*\n {2}après : « Stock Labos »/);
  assert.match(r.sortie, /— 1 écart\(s\)/);
  // Clé ajoutée sans aucun défaut dans la référence : texte nouveau, dit en clair.
  ecrire(d, { [FR]: fr({ nav: { a: 'A', stock_labo: '[[Nom:stock]] [[Court:labo]]', neuve: 'Texte neuf' } }) });
  r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /clé ajoutée « nav\.neuve » sans appel t\('nav\.neuve', défaut\) dans la référence/);
});

test('CLI identite : apostrophe typographique devenue droite — jugée identique, mais citée', () => {
  const d = depot({ 'src/A.tsx': jsx('<div><p>Supprimer l’activité ?</p><p>Stock labo</p></div>') });
  ecrire(d, { 'src/A.tsx': jsx('<div><p>Supprimer l’activité ?</p><p>Stock {voc.nom("labo")}</p></div>') });
  let r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie);
  assert.doesNotMatch(r.sortie, /apostrophe/);
  ecrire(d, { 'src/A.tsx': jsx('<div><p>Supprimer {voc.le("activite")} ?</p><p>Stock {voc.nom("labo")}</p></div>') });
  r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /src\/A\.tsx : 1 apostrophe\(s\) typographique\(s\) ’ devenue\(s\) droite\(s\) '/);
});

test('CLI voc.ex : identite sans écart admis, DOIT échouer si le premier argument s\'écarte de la référence', () => {
  const fr = (o) => `${JSON.stringify(o, null, 2)}\n`;
  const FR = 'src/i18n/locales/fr.json';
  const reference = jsx('<div>\n  <label>{t("c.nom")}</label>\n  <input placeholder="Ex: Poulet entier" />\n  <input placeholder="Ex: Viandes &amp; Volailles" />\n</div>');
  const d = depot({ 'src/A.tsx': reference, [FR]: fr({ c: { nom: "Nom de l'activité (ex: Restaurant A)" } }) });
  // L'état d'avant voc.ex (exemples neutres) : trois écarts, que seul un écart admis faisait taire.
  ecrire(d, {
    'src/A.tsx': jsx('<div>\n  <label>{t("c.nom")}</label>\n  <input placeholder={`Ex: ${voc.Nom("article")} A`} />\n  <input placeholder="Ex: Catégorie A" />\n</div>'),
    [FR]: fr({ c: { nom: 'Nom [[du:activite]] (ex: [[Nom:activite]] A)' } }),
  });
  let r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /avant : « Ex: Poulet entier ».*\n {2}après : « Ex: Article A »/);
  assert.match(r.sortie, /fr\.json:3 \(c\.nom\)\n {2}avant : « Nom de l'activité \(ex: Restaurant A\) ».*\n {2}après : « Nom de l'activité \(ex: Activité A\) »/);
  // Réécrit avec voc.ex et la balise ex : 0 écart, sans aucune entrée allow.
  const conforme = {
    'src/A.tsx': jsx('<div>\n  <label>{t("c.nom")}</label>\n  <input placeholder={voc.ex("Ex: Poulet entier", `Ex: ${voc.Nom("article")} A`)} />\n  <input placeholder={voc.ex("Ex: Viandes & Volailles", "Ex: Catégorie A")} />\n</div>'),
    [FR]: fr({ c: { nom: 'Nom [[du:activite]] (ex: [[ex:activite:Restaurant A]])' } }),
  };
  ecrire(d, conforme);
  r = outil(d, 'identite', '--sans-allow');
  assert.equal(r.code, 0, r.sortie + r.erreur);
  assert.match(r.sortie, /identite : 2 fichier\(s\) comparé\(s\).* 0 écart\(s\), 0 erreur\(s\)/);
  // DOIT échouer : premier argument modifié (source), texte par défaut modifié (fr.json).
  ecrire(d, { 'src/A.tsx': conforme['src/A.tsx'].replace('"Ex: Poulet entier"', '"Ex: Poulet rôti"') });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:3\n {2}avant : « Ex: Poulet entier » {2}\(référence l\. 3\)\n {2}après : « Ex: Poulet rôti »$/m);
  assert.match(r.sortie, /— 1 écart\(s\), 0 erreur\(s\)/);
  ecrire(d, { ...conforme, [FR]: fr({ c: { nom: 'Nom [[du:activite]] (ex: [[ex:activite:Restaurant B]])' } }) });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /fr\.json:3 \(c\.nom\)\n {2}avant : « Nom de l'activité \(ex: Restaurant A\) ».*\n {2}après : « Nom de l'activité \(ex: Restaurant B\) »/);
  assert.match(r.sortie, /^src\/A\.tsx:2\n {2}avant : « Nom de l'activité \(ex: Restaurant A\) ».*\n {2}après : « Nom de l'activité \(ex: Restaurant B\) »$/m, 'le libellé se voit aussi dans le fichier qui appelle t()');
  // DOIT échouer : erreur du second argument, à texte par défaut identique.
  ecrire(d, { ...conforme, 'src/A.tsx': conforme['src/A.tsx'].replace('voc.Nom("article")', 'voc.Nom("articles")') });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:3 {2}ERREUR voc\.Nom\('articles'\) : clé de lexique inconnue/m);
  assert.match(r.sortie, /— 0 écart\(s\), 1 erreur\(s\)/);
});

test('CLI voc.ex : residuels et accords jugent le second argument, affiché et admis par son texte neutre', () => {
  const d = depot({ 'src/A.tsx': jsx('<div />') });
  ecrire(d, { 'src/A.tsx': jsx('<div>\n  <input placeholder={voc.ex("Ex: Labo Central", `Ex: ${voc.Nom("labo")} 1`)} />\n  <input placeholder={voc.ex("Ex: Viandes", "Ex: Catégorie A")} />\n  <input placeholder={voc.ex("Ex: Poulet du labo", "Ex: un " + voc.nom("article") + " du labo")} />\n</div>') });
  let r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.sortie, /Labo Central|Viandes|Poulet/, 'le premier argument n\'est ni listé ni affiché');
  assert.match(r.sortie, /^src\/A\.tsx:3 {2}\[exemple\] {2}« Ex: Catégorie A »$/m);
  assert.match(r.sortie, /^src\/A\.tsx:4 {2}\[labo, exemple\] {2}« Ex: un article du labo »$/m);
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 2 unité\(s\) dans 1 fichier\(s\)/);
  // Une entrée écrite sur l'exemple de la référence n'admet rien ; écrite sur le texte neutre, elle admet l'unité.
  const entree = (texte) => ({ fichier: 'src/A.tsx', avant: texte, apres: texte, type: 'exemple', justification: 'Exemple neutre gardé en dur : mot hors lexique.' });
  ecrire(d, { 'scripts/vocab-allow/F9.json': JSON.stringify([entree('Ex: Viandes')]) });
  r = outil(d, 'residuels');
  assert.match(r.sortie, /^src\/A\.tsx:3 {2}\[exemple\] {2}« Ex: Catégorie A »$/m);
  assert.match(r.sortie, /allow sans objet : F9\.json\[0\]/);
  ecrire(d, { 'scripts/vocab-allow/F9.json': JSON.stringify([entree('Ex: Catégorie A')]) });
  r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.doesNotMatch(r.sortie, /\[exemple\]/);
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 1 unité\(s\) dans 1 fichier\(s\)/);
  assert.match(r.sortie, /écarts admis \(allow\) : 1 entrée\(s\) — exemple 1/);
  // accords : le déterminant en dur du second argument est signalé, avec le texte neutre ; la ligne miroir rend le second argument.
  r = outil(d, 'accords', 'src/A.tsx');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/A\.tsx:4 {2}« un » devant voc\.nom\('article'\) {2}« Ex: un article du labo »$/m);
  assert.match(r.sortie, /accords : 1 fichier\(s\), 1 signalement\(s\)/);
  assert.match(r.sortie, / {2}l\. 2\n {4}défaut : Ex: Labo Central\n {4}miroir : Ex: Usine 1\n/);
  assert.match(r.sortie, / {2}l\. 3\n {4}défaut : Ex: Viandes\n {4}miroir : Ex: Catégorie A\n/);
  // Réécrit proprement : plus rien.
  ecrire(d, { 'src/A.tsx': jsx('<div>\n  <input placeholder={voc.ex("Ex: Labo Central", `Ex: ${voc.Nom("labo")} 1`)} />\n  <input placeholder={voc.ex("Ex: Viandes", "Ex: Catégorie A")} />\n  <input placeholder={voc.ex("Ex: Poulet du labo", `Ex: ${voc.un("article")} ${voc.du("labo")}`)} />\n</div>') });
  assert.equal(outil(d, 'residuels').code, 0);
  assert.equal(outil(d, 'accords', 'src/A.tsx').code, 0);
  const inv = JSON.parse(outil(d, 'inventaire').sortie);
  assert.deepEqual(inv.fichiers['src/A.tsx'].unites.map((u) => [u.texte, u.neutre, u.termes]), [
    ['Ex: Labo Central', 'Ex: Labo 1', []],
    ['Ex: Viandes', 'Ex: Catégorie A', ['exemple']],
    ['Ex: Poulet du labo', 'Ex: un article du labo', []],
  ]);
});

// ═════════════════════════════════════════════════════════════════════════════
// Mode lexique : backend généré, vecteurs, empreinte de gel
// ═════════════════════════════════════════════════════════════════════════════

test('lexique : l\'empreinte change avec le moteur ou le lexique, pas avec les fins de ligne', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-gel-'));
  temporaires.push(d);
  ecrire(d, { 'vocab.ts': 'export const a = 1;\nexport const b = 2;\n', 'rendre.ts': 'export const r = 1;\n' });
  const lexique = { labo: { sg: 'Labo', pl: 'Labos' } };
  const gel = empreinte(d, lexique);
  assert.deepEqual(Object.keys(gel.fichiers), ['src/vocab/rendre.ts', 'src/vocab/vocab.ts']);
  assert.deepEqual(ecartsDeGel(gel, empreinte(d, lexique)), []);
  ecrire(d, { 'vocab.ts': 'export const a = 1;\r\nexport const b = 2;\r\n' });
  assert.deepEqual(ecartsDeGel(gel, empreinte(d, lexique)), [], 'CRLF ou LF : même empreinte');
  ecrire(d, { 'vocab.ts': 'export const a = 1;\nexport const b = 3;\n' });
  assert.deepEqual(ecartsDeGel(gel, empreinte(d, lexique)), ['src/vocab/vocab.ts : modifié depuis le gel']);
  ecrire(d, { 'vocab.ts': 'export const a = 1;\nexport const b = 2;\n', 'plus.ts': 'export {};\n' });
  assert.deepEqual(ecartsDeGel(gel, empreinte(d, lexique)), ['src/vocab/plus.ts : ajouté depuis le gel']);
  // Tout fichier de src/vocab compte, quelle que soit son extension, sous-dossiers compris.
  ecrire(d, { 'plus.ts': null, 'donnees.json': '{}', 'aide/outil.js': 'module.exports = 1;\n' });
  assert.deepEqual(ecartsDeGel(gel, empreinte(d, lexique)), ['src/vocab/aide/outil.js : ajouté depuis le gel', 'src/vocab/donnees.json : ajouté depuis le gel']);
  fs.rmSync(path.join(d, 'aide'), { recursive: true });
  ecrire(d, { 'donnees.json': null, 'rendre.ts': null });
  assert.deepEqual(ecartsDeGel(gel, empreinte(d, lexique)), ['src/vocab/rendre.ts : supprimé depuis le gel']);
  ecrire(d, { 'rendre.ts': 'export const r = 1;\n' });
  assert.deepEqual(ecartsDeGel(gel, empreinte(d, { labo: { sg: 'Labo', pl: 'Labo' } })), ['lexique par défaut : modifié depuis le gel']);
});

test('CLI lexique : backend généré à jour, vecteurs identiques, gel — et chacun des trois DOIT pouvoir échouer', () => {
  const back = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-back-'));
  temporaires.push(back);
  fs.mkdirSync(path.join(back, 'src'), { recursive: true });
  const gel = path.join(back, 'gel.json');
  const lexique = (...args) => {
    const r = spawnSync(process.execPath, [OUTIL, 'lexique', '--back', back, '--fichier-gel', gel, ...args], { encoding: 'utf8' });
    return { code: r.status, sortie: r.stdout + r.stderr };
  };
  // Backend vide : périmé.
  let r = lexique();
  assert.equal(r.code, 1);
  assert.match(r.sortie, /backend généré : PÉRIMÉ/);
  // Généré par le vrai script : à jour ; pas encore gelé.
  const sync = spawnSync(process.execPath, [path.join(ICI, 'sync-vocab-back.mjs'), '--back', back], { encoding: 'utf8' });
  assert.equal(sync.status, 0, sync.stdout + sync.stderr);
  r = lexique();
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /backend généré : à jour/);
  assert.match(r.sortie, /vocab-vecteurs\.json : pas encore de copie dans le backend/);
  assert.match(r.sortie, /gel : moteur et lexique pas encore gelés/);
  // Copie des vecteurs : identique (aux fins de ligne près), puis différente.
  fs.mkdirSync(path.join(back, 'test'));
  const vecteurs = fs.readFileSync(path.join(ICI, 'vocab-vecteurs.json'), 'utf8');
  fs.writeFileSync(path.join(back, 'test', 'vocab-vecteurs.json'), vecteurs.replace(/\r?\n/g, '\r\n'));
  r = lexique();
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /vocab-vecteurs\.json : copie du backend identique/);
  fs.writeFileSync(path.join(back, 'test', 'vocab-vecteurs.json'), vecteurs.replace('"labos"', '"labo"'));
  r = lexique();
  assert.equal(r.code, 1);
  assert.match(r.sortie, /vocab-vecteurs\.json : la copie du backend \(test\/vocab-vecteurs\.json\) DIFFÈRE/);
  fs.writeFileSync(path.join(back, 'test', 'vocab-vecteurs.json'), vecteurs);
  // Gel : écrit, puis inchangé, puis altéré.
  r = lexique('--geler');
  assert.equal(r.code, 0, r.sortie);
  // Une fois le moteur gelé, les DEUX copies sont dues : celle des lexiques d'essai manque encore.
  r = lexique();
  assert.equal(r.code, 1);
  assert.match(r.sortie, /vocab-lexiques-test\.json : copie ABSENTE du backend \(test\/vocab-lexiques-test\.json\) alors que le moteur est gelé/);
  fs.copyFileSync(path.join(ICI, 'vocab-lexiques-test.json'), path.join(back, 'test', 'vocab-lexiques-test.json'));
  const ecrit = JSON.parse(fs.readFileSync(gel, 'utf8'));
  assert.deepEqual(ecrit.fichiers, empreinte().fichiers);
  assert.ok(Object.keys(ecrit.fichiers).includes('src/vocab/vocab.ts') && Object.keys(ecrit.fichiers).includes('src/vocab/lexiqueDefaut.ts'));
  r = lexique();
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /gel : empreinte inchangée/);
  fs.writeFileSync(gel, JSON.stringify({ ...ecrit, fichiers: { ...ecrit.fichiers, 'src/vocab/vocab.ts': '0'.repeat(64) } }));
  r = lexique();
  assert.equal(r.code, 1);
  assert.match(r.sortie, /gel : le moteur ou le lexique a CHANGÉ depuis le gel\n {2}src\/vocab\/vocab\.ts : modifié depuis le gel/);
  fs.writeFileSync(gel, JSON.stringify({ ...ecrit, lexique: '0'.repeat(64) }));
  assert.match(lexique().sortie, /lexique par défaut : modifié depuis le gel/);
  // Moteur généré édité à la main dans le backend : périmé.
  fs.writeFileSync(gel, JSON.stringify(ecrit));
  fs.appendFileSync(path.join(back, 'src', 'utils', 'vocab.js'), '\n// retouche manuelle\n');
  r = lexique();
  assert.equal(r.code, 1);
  assert.match(r.sortie, /backend généré : PÉRIMÉ[\s\S]*src\/utils\/vocab\.js/);
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Lot 2b — extensions serveur (spec docs/lot-2b-spec.md §3.2) : E1 à E9 et E11, cas positifs ET négatifs
// ═════════════════════════════════════════════════════════════════════════════

const SRV = 'src/controllers/x.js';
const analyseSrv = (source, nom = SRV, rendu = []) => analyser(source, nom, { t: false, rendu: rendu.map((d) => ({ fichier: nom, ...d })) });
const canonsSrv = (source, nom, rendu) => analyseSrv(source, nom, rendu).unites.map((u) => u.canon);
const sansRendu = (source, nom, rendu) => analyseSrv(source, nom, rendu).erreurs.filter((e) => e.type === 'balise-sans-rendu').map((e) => e.message);
// Rendue = aucune erreur, aucune balise restée dans un texte ; → les textes, sans les codes ('X', 'LABO_REQUIS'…).
function rendue(source, nom, rendu) {
  const a = analyseSrv(source, nom, rendu);
  assert.deepEqual(a.erreurs.map((e) => e.message), [], source);
  assert.ok(a.unites.length > 0, source);
  for (const u of a.unites) assert.ok(!u.canon.includes('[['), `${source} → ${u.canon}`);
  return a.unites.map((u) => u.canon).filter((c) => !/^(?:[A-Z_]+|[a-z])$/.test(c));
}
function nonRendue(source, balise, nom, rendu) {
  const m = sansRendu(source, nom, rendu);
  assert.ok(m.some((x) => x.includes(`balise sans rendu ${balise}`)), `${source}\n→ ${JSON.stringify(m)}`);
}

test('E2 — points de rendu : message d\'une réponse JSON, de `erreurs`, d\'une erreur levée, rendre(voc, m) — la balise est rendue', () => {
  assert.deepEqual(rendue("res.status(404).json({ message: '[[Nom:labo]] introuvable' });"), ['Labo introuvable']);
  assert.deepEqual(rendue("return res.json({ success: true, message: '[[Nom:labo]] supprimé' });"), ['Labo supprimé']);
  assert.deepEqual(rendue("res.status(200).set('X', 'y').json({ message: '[[Nom:transfert]] annulé' });"), ['Transfert annulé']);
  // Chemin : parenthèses, ternaire (branches), || / ??, concaténation +, gabarit (morceaux et trous).
  assert.deepEqual(rendue("res.json({ message: n > 1 ? '[[Nom:labo:pl]] créés' : '[[Nom:labo]] créé' });"), ['⟦Labo|Labos@>1⟧ ⟦créé|créés@>1⟧']);
  assert.deepEqual(rendue("res.json({ message: (err.message || '[[Nom:labo]] introuvable') });"), ['⟦?⟦·⟧|Labo introuvable⟧']);
  assert.deepEqual(rendue("res.json({ message: '[[Nom:labo]] « ' + nom + ' » introuvable' });"), ['Labo « ⟦·⟧ » introuvable']);
  assert.deepEqual(rendue('res.json({ message: `[[Le:labo]] ${nom} est ${plein ? "[[acc:labo:plein:pleine]]" : "vide"}` });'), ['Le labo ⟦·⟧ est ⟦?plein|vide⟧']);
  const message = "const message = '[[Nom:labo]] introuvable';\nreturn res.status(404).json({ message });";
  assert.deepEqual(rendue(message), ['Labo introuvable']);
  // Tableau `erreurs` : élément poussé, ou élément du tableau d'un corps de réponse.
  assert.deepEqual(rendue("erreurs.push({ code: 'X', message: '[[Nom:labo]] requis' });"), ['Labo requis']);
  assert.deepEqual(rendue("this.erreurs.push({ code: 'X', message: '[[Nom:activite]] requise' });"), ['Activité requise']);
  assert.deepEqual(rendue("res.status(400).json({ erreurs: [{ code: 'X', message: '[[Nom:labo]] requis' }] });"), ['Labo requis']);
  // Erreurs levées : position du message propre à chaque constructeur.
  assert.deepEqual(rendue("throw new Error('[[Nom:labo]] introuvable');"), ['Labo introuvable']);
  assert.deepEqual(rendue("throw new TransfertError(400, 'STOCK', 'Stock [[compl:labo]] insuffisant');"), ['Stock labo insuffisant']);
  assert.deepEqual(rendue("throw new UniteError('INCONNUE', '[[Nom:activite]] inconnue');"), ['Activité inconnue']);
  assert.deepEqual(rendue("return { error: rendre(voc, '[[Nom:labo]] introuvable') };"), ['Labo introuvable']);
  // Identique à la référence : « Labo introuvable » balisé ne fait aucun écart.
  identique("res.status(404).json({ message: 'Labo introuvable' });", "res.status(404).json({ message: '[[Nom:labo]] introuvable' });", { nom: SRV, t: false });
});

test('E2 — variable `const` de message : point de rendu si son initialiseur est littéral et TOUS ses emplois sont des trous d\'un point de rendu (cas `cible`, transfertService.js:174)', () => {
  const cible = (emplois) => `const cible = missing.activiteId != null ? '[[ce:activite]]' : '[[ce:labo]]';\n${emplois}`;
  const lever = 'throw new TransfertError(400, \'PT_NON_AFFECTE\', `PT non affecté à ${cible}`);';
  assert.deepEqual(rendue(cible(lever)), ['⟦?cette activité|ce labo⟧', 'PT non affecté à ⟦·⟧']);
  identique(
    "const cible = missing.activiteId != null ? 'cette activité' : 'ce labo';\n" + lever,
    cible(lever), { nom: SRV, t: false },
  );
  // DOIT échouer : un emploi hors d'un point de rendu (journal), une variable `let`, un initialiseur non littéral.
  nonRendue(cible(`${lever}\nconsole.log(cible);`), '[[ce:activite]]');
  nonRendue(cible(`${lever}\nws.addWorksheet(cible);`), '[[ce:labo]]');
  nonRendue(`let cible = '[[ce:labo]]';\n${lever}`, '[[ce:labo]]');
  nonRendue(`const cible = f('[[ce:labo]]');\n${lever}`, '[[ce:labo]]');
  nonRendue("const m = '[[Nom:labo]] introuvable';\nconst copie = m;\nres.json({ message: copie });", '[[Nom:labo]]');
});

test('E2 — DOIT échouer : balise sans rendu (onglet, en-tête Excel, HTML d\'email, routes, validateur, details[], autre champ JSON) — erreur « balise sans rendu »', () => {
  nonRendue("const ws = wb.addWorksheet('Historique [[Pl:perte]]');", '[[Pl:perte]]');
  nonRendue("headerRow(ws, 5, ['Date', '[[Nom:labo]]', 'Quantité']);", '[[Nom:labo]]');
  nonRendue('const html = `<p>[[Votre:labo:pl]] sont prêts</p>`;\nawait resend.emails.send({ to, subject, html });', '[[Votre:labo:pl]]');
  nonRendue("await sendEmail({ subject: '[[Nom:labo]] créé', html });", '[[Nom:labo]]');
  nonRendue("doc.text('[[Nom:labo]] : ' + nom);", '[[Nom:labo]]');
  nonRendue("await pool.query('INSERT INTO notifications (message) VALUES ($1)', ['[[Nom:labo]] créé']);", '[[Nom:labo]]');
  // Routes : jamais un point de rendu (texte parti dans errors[].msg) ; validateur .custom(…) de même, partout.
  nonRendue("res.status(400).json({ message: '[[Nom:labo]] requis' });", '[[Nom:labo]]', 'src/routes/produits.js');
  nonRendue("body('portion').custom((v) => { if (v <= 0) throw new Error('[[Nom:ingredient]] invalide'); return true; });", '[[Nom:ingredient]]', 'src/routes/produits.js');
  nonRendue("body('portion').custom((v) => { if (v <= 0) throw new Error('[[Nom:ingredient]] invalide'); return true; });", '[[Nom:ingredient]]');
  nonRendue("res.status(400).json({ message: 'Import refusé', details: [{ ligne: 2, message: '[[Nom:fournisseur]] en double' }] });", '[[Nom:fournisseur]]');
  nonRendue("res.json({ titre: '[[Nom:labo]]', message: 'ok' });", '[[Nom:labo]]');
  nonRendue("res.json([{ message: '[[Nom:labo]] requis' }]);", '[[Nom:labo]]');
  nonRendue("client.json({ message: '[[Nom:labo]] requis' });", '[[Nom:labo]]');
  nonRendue("const corps = { message: '[[Nom:labo]] requis' };\nres.json(corps);", '[[Nom:labo]]');
  // Chemin rompu : `&&`, argument d'une fonction, mauvais rang d'argument.
  nonRendue("res.json({ message: vide && '[[Nom:labo]] vide' });", '[[Nom:labo]]');
  nonRendue("res.json({ message: f('[[Nom:labo]] vide') });", '[[Nom:labo]]');
  nonRendue("throw new TransfertError(400, '[[Nom:labo]]', 'Stock insuffisant');", '[[Nom:labo]]');
  nonRendue("throw new UniteError('[[Nom:labo]]');", '[[Nom:labo]]');
  nonRendue("throw new AutreErreur('[[Nom:labo]] introuvable');", '[[Nom:labo]]');
  nonRendue("return rendre('[[Nom:labo]] introuvable', voc);", '[[Nom:labo]]');
  // Le texte reste celui de la balise : un écart d'identité, ET l'erreur, qu'aucune entrée allow n'éteint (CLI ci-dessous).
  const r = comparer("const ws = wb.addWorksheet('Historique Pertes');", "const ws = wb.addWorksheet('Historique [[Pl:perte]]');", { nom: SRV, t: false });
  assert.equal(r.ok, false);
  assert.deepEqual(r.plus.map((u) => u.canon), ['Historique [[Pl:perte]]']);
  assert.ok(r.erreurs.some((e) => e.type === 'balise-sans-rendu'), JSON.stringify(r.erreurs));
  // … et au front (.ts / .tsx), rien n'a changé : c'est toujours l'erreur R8 « dans un fichier source ».
  assert.ok(analyser("const a = '[[Nom:labo]]';", 'src/a.ts').erreurs.some((e) => e.type === 'balise-source'));
});

test('E2 — points déclarés dans scripts/vocab-rendu.json : argument, valeurs-objet (cles), retours-fonction ; jamais hors de leur fichier', () => {
  const points = [
    { genre: 'argument', nom: 'push', argument: 2 },
    { genre: 'valeurs-objet', nom: 'CODES' },
    { genre: 'valeurs-objet', nom: 'LIBELLES', cles: ['sg', 'pl'] },
    { genre: 'retours-fonction', nom: 'messageSupplement' },
  ];
  assert.deepEqual(rendue("push('LABO_REQUIS', '[[Nom:labo]] requis');", SRV, points), ['Labo requis']);
  assert.deepEqual(rendue("const CODES = Object.freeze({ INCONNUE: '[[Nom:activite]] inconnue', AUTRE: { x: '[[Nom:labo]] plein' } });", SRV, points), ['Activité inconnue', 'Labo plein']);
  assert.deepEqual(rendue("const LIBELLES = { labo: { sg: '[[nom:labo]]', pl: '[[nom:labo:pl]]' } };", SRV, points), ['labo', 'labos']);
  assert.deepEqual(rendue("function messageSupplement(t) {\n  if (t) return 'Un [[nom:supplement]] est lié';\n  return `Aucun [[nom:supplement]] (${t})`;\n}", SRV, points), ['Un supplément est lié', 'Aucun supplément (⟦·⟧)']);
  assert.deepEqual(rendue("const messageSupplement = (t) => (t ? '[[Nom:supplement]] lié' : '[[Nom:supplement]] seul');", SRV, points), ['Supplément ⟦?lié|seul⟧']);
  // DOIT échouer : autre rang, autre nom, clé hors liste, fonction non déclarée, autre fichier.
  nonRendue("push('[[Nom:labo]] requis', 'X');", '[[Nom:labo]]', SRV, points);
  nonRendue("ajouter('LABO', '[[Nom:labo]] requis');", '[[Nom:labo]]', SRV, points);
  nonRendue("const LIBELLES = { labo: { sg: '[[nom:labo]]', titre: '[[Nom:labo]]' } };", '[[Nom:labo]]', SRV, points);
  nonRendue("const AUTRES = { a: '[[Nom:labo]] plein' };", '[[Nom:labo]]', SRV, points);
  nonRendue("function autreMessage() { return '[[Nom:labo]] plein'; }", '[[Nom:labo]]', SRV, points);
  const ailleurs = analyser("push('LABO_REQUIS', '[[Nom:labo]] requis');", SRV, { t: false, rendu: points.map((d) => ({ fichier: 'src/services/autre.js', ...d })) });
  assert.ok(ailleurs.erreurs.some((e) => e.type === 'balise-sans-rendu'), 'un point déclaré ne vaut que dans SON fichier');
});

test('E2 — vocab-rendu.json : schéma validé (genre, nom, argument, cles, champs inconnus)', () => {
  const bon = [
    { fichier: 'src/services/a.js', genre: 'argument', nom: 'push', argument: 2, justification: 'x' },
    { fichier: 'src\\services\\b.js', genre: 'valeurs-objet', nom: 'LIBELLES', cles: ['sg', 'pl'] },
    { fichier: 'src/c.js', genre: 'retours-fonction', nom: 'messageSupplement' },
  ];
  const ok = validerRendu(bon);
  assert.deepEqual(ok.problemes, []);
  assert.deepEqual(ok.points.map((p) => p.fichier), ['src/services/a.js', 'src/services/b.js', 'src/c.js']);
  const mauvais = [
    [{ fichier: 'a.js', genre: 'variable', nom: 'x' }, /genre « variable » inconnu/],
    [{ fichier: 'a.js', genre: 'argument', nom: 'push' }, /« argument » \(rang à partir de 1\) obligatoire/],
    [{ fichier: 'a.js', genre: 'argument', nom: 'push', argument: 0 }, /« argument » \(rang à partir de 1\) obligatoire/],
    [{ fichier: 'a.js', genre: 'valeurs-objet', nom: 'X', argument: 1 }, /« argument » ne vaut que pour le genre argument/],
    [{ fichier: 'a.js', genre: 'retours-fonction', nom: 'f', cles: ['sg'] }, /« cles » = liste de noms de propriétés/],
    [{ fichier: 'a.js', genre: 'valeurs-objet', nom: 'X', cles: [] }, /« cles » = liste de noms de propriétés/],
    [{ genre: 'argument', nom: 'push', argument: 1 }, /« fichier » manquant/],
    [{ fichier: 'a.js', genre: 'argument', argument: 1 }, /« nom » manquant/],
    [{ fichier: 'a.js', genre: 'argument', nom: 'push', argument: 1, rang: 2 }, /champ « rang » inconnu/],
  ];
  for (const [entree, attendu] of mauvais) {
    const r = validerRendu([entree]);
    assert.ok(r.problemes.some((p) => attendu.test(p)), `${JSON.stringify(entree)} → ${JSON.stringify(r.problemes)}`);
  }
  assert.match(validerRendu({}).problemes[0], /doit être un tableau/);
});

test('CLI E2 : « balise sans rendu » — code 1 qu\'aucune entrée allow n\'éteint ; vocab-rendu.json lu ; invalide = code 2', () => {
  const avant = "exports.exporter = async (req, res) => {\n  const ws = wb.addWorksheet('Historique Pertes');\n  push('X', 'Labo requis');\n  res.json({ message: 'Labo introuvable' });\n};\n";
  const d = depot({ 'src/controllers/pertesController.js': avant });
  ecrire(d, { 'src/controllers/pertesController.js': avant.replace("'Labo introuvable'", "'[[Nom:labo]] introuvable'") });
  let r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie + r.erreur);
  ecrire(d, { 'src/controllers/pertesController.js': avant.replace("'Historique Pertes'", "'Historique [[Pl:perte]]'") });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /pertesController\.js:2 {2}ERREUR balise sans rendu \[\[Pl:perte\]\]/);
  const entree = { fichier: 'src/controllers/pertesController.js', avant: 'Historique Pertes', apres: 'Historique [[Pl:perte]]', type: 'deplacement', justification: 'Tentative : une entrée ne doit pas éteindre l\'erreur.' };
  ecrire(d, { 'scripts/vocab-allow/socle.json': JSON.stringify([entree]) });
  r = outil(d, 'identite');
  assert.equal(r.code, 1, 'l\'écart est admis, l\'erreur reste');
  assert.match(r.sortie, /ERREUR balise sans rendu \[\[Pl:perte\]\]/);
  // residuels : la balise non rendue garde son terme en dur, ET l'erreur « balise sans rendu » est dite (code 1).
  r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /pertesController\.js:2 {2}\[perte\] {2}« Historique \[\[Pl:perte\]\] »/);
  assert.match(r.sortie, /pertesController\.js:2 {2}ERREUR balise sans rendu \[\[Pl:perte\]\]/);
  assert.match(r.sortie, /residuels : \d+ fichier\(s\), \d+ unité\(s\) dans \d+ fichier\(s\), 1 erreur\(s\)/);
  // Point déclaré : push(code, message), argument 2 — lu dans <root>/scripts/vocab-rendu.json.
  ecrire(d, { 'scripts/vocab-allow/socle.json': null, 'src/controllers/pertesController.js': avant.replace("'Labo requis'", "'[[Nom:labo]] requis'") });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /pertesController\.js:3 {2}ERREUR balise sans rendu \[\[Nom:labo\]\]/);
  const point = { fichier: 'src/controllers/pertesController.js', genre: 'argument', nom: 'push', argument: 2, justification: 'push(code, message) : message rendu au bord.' };
  ecrire(d, { 'scripts/vocab-rendu.json': JSON.stringify([point]) });
  r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie + r.erreur);
  ecrire(d, { 'scripts/vocab-rendu.json': JSON.stringify([{ ...point, genre: 'appel' }]) });
  r = outil(d, 'identite');
  assert.equal(r.code, 2);
  assert.match(r.erreur, /vocab-rendu\.json : \d+ problème\(s\)\n {2}vocab-rendu\.json\[0\] : genre « appel » inconnu/);
  ecrire(d, { 'scripts/vocab-rendu.json': '{ pas du json' });
  assert.equal(outil(d, 'residuels').code, 2);
});

test('E3 — lexeur SQL : constantes, \'\' = apostrophe, commentaires -- et /* */ sautés, trou accepté, squelette', () => {
  const l = lireSql("SELECT 'l''activité' AS a, -- on n'utilise pas 'labo' ici\n  'PT' /* 'Labo' */, \"col'x\", '⟦·⟧' FROM t WHERE c = $1 AND d = $12");
  assert.deepEqual(l.constantes.map((c) => [c.texte, c.ligne]), [["l'activité", 0], ['PT', 1], ['⟦·⟧', 1]]);
  assert.equal(l.squelette, "SELECT '⟦c⟧' AS a, '⟦c⟧' , \"col'x\", '⟦c⟧' FROM t WHERE c = $⟦n⟧ AND d = $⟦n⟧");
  assert.deepEqual(lireSql("SELECT 'a\nb', 'c'").constantes.map((c) => c.ligne), [0, 1]);
  // Codes : [a-z0-9_]+, ou la liste fermée des codes en capitales ('PT' au départ). Le reste est un texte.
  assert.deepEqual(CODES_SQL_CAPITALES, ['PT']);
  for (const c of ['labo', 'produit_transforme', 'pt', '1', 'PT']) assert.equal(estCodeSql(c), true, c);
  for (const c of ['Labo', 'Prestataire', ' (labo)', 'FT', 'Sans catégorie', 'labo-x', '']) assert.equal(estCodeSql(c), false, c);
});

test('E3 — residuels : les constantes-textes d\'une requête sont jugées une par une ; les codes, les commentaires et les identifiants non', () => {
  const sqlTextes = (source) => analyser(source, SRV, { t: false, complet: true }).unites.flatMap((u) => (u.sqlTextes ?? []).filter((c) => c.termes.length).map((c) => c.texte));
  assert.deepEqual(sqlTextes("await pool.query(`SELECT COALESCE(p.nom, 'Prestataire') AS canal, 'labo' AS t FROM ventes v WHERE type_appro = 'PT'`, [id]);"), ['Prestataire']);
  assert.deepEqual(sqlTextes("await pool.query(`SELECT ld.nom || ' (labo)' AS dest -- l'activité 'Activité'\n FROM labos ld /* 'Labo' */`);"), [' (labo)']);
  assert.deepEqual(sqlTextes("const q = `SELECT 'Activité' AS site_type, '${grain}' AS g FROM activites`;"), ['Activité']);
  assert.deepEqual(sqlTextes("await client.query(\"UPDATE stock SET type = 'transfert' WHERE origine = 'labo' AND ref = 'PT'\");"), []);
  // Fonctions SQL : leurs arguments littéraux restent dans l'unité, jamais des unités à part.
  const unites = analyser("await pool.query(`SELECT ${ptCategorieSql('pp')} AS cat, ${ptTypeSql('p', ptType)} FROM produits pp`);", SRV, { t: false, complet: true }).unites;
  assert.equal(unites.length, 1);
  assert.deepEqual(unites.filter((u) => !u.exclu).map((u) => u.canon), []);
});

test('CLI E3 : residuels lit le SQL — libellé en dur listé « sql », code jamais ; réécrit en paramètre, il sort', () => {
  const avant = "exports.ventes = async (req, res) => {\n  const r = await pool.query(\n    `SELECT COALESCE(p.nom, 'Prestataire') AS canal,\n            'labo' AS t\n     FROM ventes v WHERE v.type_appro = 'PT'`, [id]);\n  res.json(r.rows);\n};\n";
  const d = depot({ 'src/controllers/ventesController.js': avant });
  let r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/controllers\/ventesController\.js:3 {2}\[prestataire\] {2}« Prestataire »$/m);
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 1 unité\(s\) dans 1 fichier\(s\)/);
  ecrire(d, { 'src/controllers/ventesController.js': avant.replace("'Prestataire'", '$2').replace('[id]', "[id, voc.Nom('prestataire')]") });
  r = outil(d, 'residuels');
  assert.equal(r.code, 0, r.sortie);
});

test('E3 — mesure figée sur la copie de référence du serveur (bfb590a) : 46 constantes-libellés dans 22 requêtes ; 18 \'PT\' codes', (t) => {
  const BACK = path.resolve(ICI, '..', '..', 'fiche-technique-backend');
  const REF = 'bfb590a';
  const git = (...a) => execFileSync('git', ['-C', BACK, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  try { git('cat-file', '-e', `${REF}^{commit}`); } catch { t.skip(`dépôt backend ou commit ${REF} indisponible (${BACK})`); return; }
  const fonctionsSql = fonctionsSqlDe(git('show', `${REF}:src/utils/stockUtils.js`));
  let requetes = 0;
  let constantes = 0;
  let pt = 0;
  const parTexte = {};
  for (const f of git('ls-tree', '-r', '--name-only', REF, '--', 'src').split('\n').filter((x) => x.endsWith('.js'))) {
    for (const u of analyser(git('show', `${REF}:${f}`), f, { t: false, complet: true, fonctionsSql }).unites) {
      const libelles = (u.sqlTextes ?? []).filter((c) => c.termes.length);
      if (libelles.length) { requetes += 1; constantes += libelles.length; }
      for (const c of libelles) parTexte[c.texte] = (parTexte[c.texte] ?? 0) + 1;
      pt += (u.sql?.codes ?? []).filter((c) => c.texte === 'PT').length;
    }
  }
  // 44 avec le lexique de 43 clés (spec §3.2 E3) ; 46 depuis S1 (§4.3) : les clés produit_vendable_abr et
  // produit_valorise_abr reconnaissent « P. Vendable / » et « P. Valorisé / » (dashboardV2Controller.js), dans des
  // requêtes déjà comptées — le nombre de requêtes ne bouge pas.
  assert.deepEqual({ requetes, constantes, pt }, { requetes: 22, constantes: 46, pt: 18 });
  assert.equal(parTexte['P. Vendable / '] + parTexte['P. Valorisé / '], 2);
  // Dont 30 pour les catégories PT (10 copies × 3, ptCategorieSql comprise) — spec carto-outil §2.5.
  assert.equal(parTexte['Produits Transformés Utilisables'] + parTexte['Produits Composés Valorisés'] + parTexte['Produits Transformés Vendables'], 30);
});

// stockUtils.js (forme réelle) : la référence et la version courante peuvent différer.
const STOCK_UTILS = "function ptCategorieSql(alias) {\n  return `CASE WHEN ${alias}.type = 'utilisable' THEN 'Produits Transformés Utilisables' ` +\n         `WHEN ${alias}.origine = 'labo' THEN 'Produits Composés Valorisés' ` +\n         `ELSE 'Produits Transformés Vendables' END`;\n}\nfunction ptTypeSql(alias, ptType) {\n  if (ptType === 'utilisable') return `${alias}.type = 'utilisable'`;\n  if (ptType === 'valorise') return `(${alias}.type = 'vendable' AND ${alias}.origine = 'labo')`;\n  return '1=1';\n}\nmodule.exports = { ptCategorieSql, ptTypeSql };\n";
const CASE_PP = "CASE WHEN pp.type = 'utilisable' THEN 'Produits Transformés Utilisables' WHEN pp.origine = 'labo' THEN 'Produits Composés Valorisés' ELSE 'Produits Transformés Vendables' END";
const requete = (sql, params = '[id]') => `const r = await pool.query(\`${sql}\`, ${params});`;

test('E4 — factorisation des catégories PT : ${ptCategorieSql(x)} développée avec stockUtils.js du même commit — aucun écart, aucune requête « à relire »', () => {
  const avant = requete(`SELECT COALESCE(c.nom, (SELECT ${CASE_PP} FROM produits pp WHERE pp.id = p.produit_id)) AS categorie FROM pertes p`);
  const apres = requete("SELECT COALESCE(c.nom, (SELECT ${ptCategorieSql('pp')} FROM produits pp WHERE pp.id = p.produit_id)) AS categorie FROM pertes p");
  const r = identique(avant, apres, { nom: SRV, t: false, stockUtils: STOCK_UTILS });
  assert.deepEqual(r.relire, []);
  // Prédicat ptTypeSql : développé aussi (argument non littéral = branche non évaluable → jeton stable).
  identique(requete("SELECT * FROM produits p WHERE (p.type = 'vendable' AND p.origine = 'labo')"), requete("SELECT * FROM produits p WHERE ${ptTypeSql('p', 'valorise')}"), { nom: SRV, t: false, stockUtils: STOCK_UTILS });
  // DOIT échouer : sans stockUtils.js, ou avec un stockUtils.js dont le libellé a changé (lu AU MÊME commit).
  ecart(avant, apres, { moins: 'Produits Composés Valorisés' }, { nom: SRV, t: false });
  const change = STOCK_UTILS.replace("'Produits Composés Valorisés'", "'Produits Composés'");
  ecart(avant, apres, { moins: 'Produits Composés Valorisés', plus: 'Produits Composés' }, { nom: SRV, t: false, stockUtils: change, stockUtilsRef: STOCK_UTILS });
  // Mauvais alias : le squelette change (requête à relire), pas les textes.
  const alias = comparer(avant, apres.replace("ptCategorieSql('pp')", "ptCategorieSql('p')"), { nom: SRV, t: false, stockUtils: STOCK_UTILS });
  assert.equal(alias.ok, true);
  assert.equal(alias.relire.length, 1);
});

test('E4 — trois multi-ensembles : libellés avec les textes du fichier, codes à part, squelette « à relire » (jamais un écart)', () => {
  const opts = { nom: SRV, t: false };
  const base = "SELECT COALESCE(p.nom, 'Prestataire') AS canal FROM ventes v WHERE v.type_vente = 'prestataire' AND v.date >= $1";
  // Libellé sorti du SQL vers un paramètre $n calculé en JS : la même unité de texte reste — 0 écart, 1 requête à relire.
  const deplace = comparer(requete(base, '[from]'), requete(base.replace("'Prestataire'", '$2'), "[from, voc.Nom('prestataire')]"), opts);
  assert.equal(deplace.ok, true, detail(deplace));
  assert.equal(deplace.relire.length, 1);
  assert.match(deplace.relire[0].avant.canon, /COALESCE\(p\.nom, '⟦c⟧'\)/);
  assert.match(deplace.relire[0].apres.canon, /COALESCE\(p\.nom, \$⟦n⟧\)/);
  // Squelette seul changé ($1 → $2, colonne ajoutée) : pas un écart, une ligne à relire.
  const sq = comparer(requete(base, '[from]'), requete(`${base.replace('$1', '$2')} AND v.id > 0`, '[id, from]'), opts);
  assert.equal(sq.ok, true);
  assert.equal(sq.relire.length, 1);
  assert.deepEqual(diffSquelette('SELECT a FROM t WHERE x = $⟦n⟧', 'SELECT a FROM t WHERE x = $⟦n⟧ AND y'), [
    'avant : « SELECT a FROM t WHERE x = $⟦n⟧⟨⟩ »',
    'après : « SELECT a FROM t WHERE x = $⟦n⟧⟨ AND y⟩ »',
  ]);
  // DOIT échouer : libellé changé dans le SQL ; code changé, ajouté ou retiré.
  ecart(requete(base, '[from]'), requete(base.replace("'Prestataire'", "'Intermédiaire'"), '[from]'), { moins: 'Prestataire', plus: 'Intermédiaire' }, opts);
  ecart(requete(base, '[from]'), requete(base.replace("'prestataire'", "'directe'"), '[from]'), { moins: "⟦sql⟧'prestataire'", plus: "⟦sql⟧'directe'" }, opts);
  ecart(requete("SELECT * FROM appros a WHERE a.type_appro = 'PT'"), requete("SELECT * FROM appros a WHERE a.type_appro = 'transfert'"), { moins: "⟦sql⟧'PT'", plus: "⟦sql⟧'transfert'" }, opts);
  ecart(requete("SELECT * FROM appros a WHERE a.type_appro IN ('PT', 'manuel')"), requete("SELECT * FROM appros a WHERE a.type_appro IN ('PT')"), { moins: "⟦sql⟧'manuel'" }, opts);
  // Un code ne s'apparie jamais à un texte : « Labo » (libellé) devenu 'labo' (code) = deux écarts distincts.
  const code = comparer(requete("SELECT 'Labo' AS site_type FROM labos"), requete("SELECT 'labo' AS site_type FROM labos"), opts);
  assert.equal(code.ok, false);
  assert.ok(code.paires.every((p) => !(p.avant && p.apres)), JSON.stringify(code.paires.map((p) => [p.avant?.canon, p.apres?.canon])));
  // Un libellé déplacé vers le JS ne s'annule que s'il reste une unité JS ENTIÈRE de même texte.
  ecart(requete("SELECT ld.nom || ' (labo)' AS dest FROM labos ld"), "const r = await pool.query(`SELECT ld.nom AS dest FROM labos ld`);\nconst lignes = r.rows.map((x) => `${x.dest} (${voc.court('labo')})`);", { moins: ' (labo)', plus: '⟦·⟧ (labo)' }, opts);
});

test('CLI E4 : identite — « requête modifiée, à relire » avec le diff, code 0 ; un code changé n\'est admis que par « discriminant »', () => {
  const avant = "exports.a = async (req, res) => {\n  const r = await pool.query(\n    `SELECT COALESCE(p.nom, 'Prestataire') AS canal\n     FROM ventes v WHERE v.type_vente = 'prestataire' AND v.date >= $1`, [from]);\n  res.json(r.rows);\n};\n";
  const d = depot({ 'src/controllers/a.js': avant, 'src/utils/stockUtils.js': STOCK_UTILS });
  ecrire(d, { 'src/controllers/a.js': avant.replace("'Prestataire'", '$2').replace('[from]', "[from, voc.Nom('prestataire')]") });
  let r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie + r.erreur);
  assert.match(r.sortie, /src\/controllers\/a\.js:\d+ {2}requête modifiée, à relire\n {2}avant : « .*⟨'⟦c⟧'⟩.* »\n {2}après : « .*⟨\$⟦n⟧⟩.* »/);
  assert.match(r.sortie, /0 écart\(s\), 0 erreur\(s\), 1 requête\(s\) SQL à relire/);
  // Code changé : écart ; une entrée d'un autre type ne l'admet pas ; « discriminant », oui.
  ecrire(d, { 'src/controllers/a.js': avant.replace("'prestataire'", "'via_prestataire'") });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /avant : « ⟦sql⟧'prestataire' ».*\n {2}après : « ⟦sql⟧'via_prestataire' »/);
  const entree = { fichier: 'src/controllers/a.js', avant: "⟦sql⟧'prestataire'", apres: "⟦sql⟧'via_prestataire'", type: 'deplacement', justification: 'Code de canal renommé (essai).' };
  ecrire(d, { 'scripts/vocab-allow/B4.json': JSON.stringify([entree]) });
  assert.equal(outil(d, 'identite').code, 1, 'un code n\'est admis que par une entrée discriminant');
  ecrire(d, { 'scripts/vocab-allow/B4.json': JSON.stringify([{ ...entree, type: 'discriminant' }]) });
  r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /écarts admis \(allow\) : 1 entrée\(s\) — discriminant 1/);
  // Factorisation des catégories PT : stockUtils.js lu au même commit de chaque côté — ni écart, ni « à relire ».
  const pt = `exports.b = async (req, res) => {\n  const r = await pool.query(\`SELECT (SELECT ${CASE_PP} FROM produits pp WHERE pp.id = p.produit_id) AS cat FROM pertes p\`);\n  res.json(r.rows);\n};\n`;
  const d2 = depot({ 'src/controllers/b.js': pt, 'src/utils/stockUtils.js': STOCK_UTILS });
  ecrire(d2, { 'src/controllers/b.js': pt.replace(CASE_PP, "${ptCategorieSql('pp')}") });
  r = outil(d2, 'identite');
  assert.equal(r.code, 0, r.sortie);
  assert.doesNotMatch(r.sortie, /à relire/);
});

test('E5 — profil serveur des residuels : documentation API, fichiers entièrement admin, noms de champs d\'express-validator, router.delete', () => {
  assert.deepEqual(HORS_RESIDUELS, ['src/config/swagger.js', 'src/controllers/bossController.js', 'src/controllers/adminRapportsController.js', 'src/controllers/adminSiteController.js']);
  const exclusSrv = (source, nom = 'src/routes/produits.js') => analyser(source, nom, { t: false }).unites.filter((u) => u.termes.length).map((u) => u.exclu ?? null);
  assert.deepEqual(exclusSrv("router.post('/', body('portion').isFloat(), param('labo').isInt(), query('stock').optional(), h);"), ['nom de champ de body', 'nom de champ de param', 'nom de champ de query']);
  assert.deepEqual(exclusSrv("router.delete('/labo/:id', authenticate, h);"), ['argument de router.delete']);
  assert.deepEqual(exclusSrv("app.use(swaggerUi.setup(spec, { customSiteTitle: 'API Fiche Technique — stock et labo' }));", 'src/app.js'), ['propriété customSiteTitle']);
  // DOIT rester candidat : le message d'un validateur, un texte passé à Set.delete, un titre ordinaire.
  assert.deepEqual(exclusSrv("body('portion').isFloat({ gt: 0 }).withMessage('La portion doit être positive');"), ['nom de champ de body', null]);
  assert.deepEqual(exclusSrv("vus.delete('Labo central');"), [null]);
  assert.deepEqual(exclusSrv("vus.delete('labo');"), ['argument de vus.delete']);
  assert.deepEqual(exclusSrv("res.json({ titre: 'Stock du labo' });", 'src/controllers/x.js'), [null]);
});

test('CLI E5 / E6 : residuels du serveur — exclus par chemin (cités au rapport), moteur généré hors périmètre ; un contrôleur ordinaire reste lu', () => {
  const texte = "module.exports = { titre: 'Stock du labo' };\n";
  const d = depot({
    'src/config/swagger.js': "module.exports = { info: { title: 'API — stock des labos' } };\n",
    'src/controllers/bossController.js': texte, 'src/controllers/adminRapportsController.js': texte, 'src/controllers/adminSiteController.js': texte,
    'src/utils/vocab.js': "module.exports = { Nom: () => 'Labo' };\n",
    'src/controllers/laboController.js': texte,
  });
  let r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^src\/controllers\/laboController\.js:1 {2}\[labo, stock\] {2}« Stock du labo »$/m);
  assert.match(r.sortie, /exclus par chemin \(documentation API, fichiers entièrement admin — I4\) : src\/config\/swagger\.js, src\/controllers\/bossController\.js, src\/controllers\/adminRapportsController\.js, src\/controllers\/adminSiteController\.js/);
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 1 unité\(s\) dans 1 fichier\(s\)/);
  // Demandé nommément, un fichier exclu reste exclu (cité au rapport).
  r = outil(d, 'residuels', 'src/controllers/bossController.js');
  assert.equal(r.code, 0, r.sortie);
  assert.match(r.sortie, /exclus par chemin .* : src\/controllers\/bossController\.js$/m);
  // Le mode accords et l'identité, eux, lisent tous les fichiers du périmètre (l'exclusion E5 est propre aux résiduels).
  ecrire(d, { 'src/controllers/bossController.js': "module.exports = { titre: 'Stock du labo central' };\n" });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /bossController\.js:1\n {2}avant : « Stock du labo ».*\n {2}après : « Stock du labo central »/);
});

test('E1 / CLI : docuseal-templates/generate.js est dans le périmètre du serveur — parcours, ls-tree, diff, ls-files', () => {
  assert.deepEqual(PERIMETRE_EN_PLUS, ['docuseal-templates/generate.js']);
  const gen = "function buildFactureAppro(data) {\n  doc.text('Facture d\\'approvisionnement — labo');\n}\nmodule.exports = { buildFactureAppro };\n";
  const d = depot({ 'src/a.js': "module.exports = {};\n", 'docuseal-templates/generate.js': gen, 'docuseal-templates/autre.js': "doc.text('Stock du labo');\n" });
  let r = outil(d, 'residuels');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /^docuseal-templates\/generate\.js:2 {2}\[labo, appro\] {2}« Facture d'approvisionnement — labo »$/m);
  assert.doesNotMatch(r.sortie, /autre\.js/, 'seul generate.js est ajouté au périmètre');
  // identite : fichier modifié (git diff), comparé à la référence (ls-tree) — sans demande nominative.
  ecrire(d, { 'docuseal-templates/generate.js': gen.replace('— labo', '— atelier') });
  r = outil(d, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /docuseal-templates\/generate\.js:2\n {2}avant : « Facture d'approvisionnement — labo ».*\n {2}après : « Facture d'approvisionnement — atelier »/);
  // Nouveau (ls-files --others) : comparé comme un fichier nouveau.
  const d2 = depot({ 'src/a.js': "module.exports = {};\n" });
  ecrire(d2, { 'docuseal-templates/generate.js': gen });
  r = outil(d2, 'identite');
  assert.equal(r.code, 1);
  assert.match(r.sortie, /docuseal-templates\/generate\.js : nouveau fichier \(absent de la référence\)/);
  // Dépôt sans generate.js (le front) : rien de plus n'est lu.
  const d3 = depot({ 'src/a.js': "module.exports = { t: 'Stock du labo' };\n" });
  r = outil(d3, 'residuels');
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 1 unité\(s\)/);
});

test('E7 — vocab-accords.txt du serveur : écrit dans <root>/scripts, seulement si son contenu change, fins de ligne gardées', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-accords-'));
  temporaires.push(dir);
  const f = path.join(dir, 'vocab-accords.txt');
  assert.equal(ecrireAccords(f, 'a\nb\n'), true);
  assert.equal(fs.readFileSync(f, 'utf8'), 'a\nb\n');
  fs.writeFileSync(f, 'a\r\nb\r\n');
  const avant = fs.statSync(f).mtimeMs;
  assert.equal(ecrireAccords(f, 'a\nb\n'), false, 'contenu inchangé (CRLF d\'une extraction git) : fichier non touché');
  assert.equal(fs.statSync(f).mtimeMs, avant);
  assert.equal(ecrireAccords(f, 'a\nc\n'), true);
  assert.equal(fs.readFileSync(f, 'utf8'), 'a\r\nc\r\n', 'CRLF gardé');
  // Au serveur : un passage complet écrit le fichier ; un passage sur une liste de fichiers, jamais.
  const d = depot({ 'src/controllers/a.js': "res.json({ message: 'Labo introuvable' });\n", 'scripts/.garde': '' });
  ecrire(d, { 'src/controllers/a.js': "res.json({ message: '[[Nom:labo]] introuvable' });\n" });
  const sortie = path.join(d, 'scripts', 'vocab-accords.txt');
  let r = outil(d, 'accords', 'src/controllers/a.js');
  assert.equal(r.code, 0, r.sortie);
  assert.equal(fs.existsSync(sortie), false);
  r = outil(d, 'accords');
  assert.equal(r.code, 0, r.sortie);
  assert.match(fs.readFileSync(sortie, 'utf8'), /src\/controllers\/a\.js\n {2}l\. 1\n {4}défaut : Labo introuvable\n {4}miroir : Usine introuvable\n/);
});

test('E8 — types d\'écarts admis : « reporte » (champ lot 3 ou 2c), « admin » (route et garde), « fiscal »', () => {
  for (const t of ['reporte', 'admin', 'fiscal']) assert.ok(TYPES_ALLOW.includes(t), t);
  assert.deepEqual(LOTS_REPORTE, ['3', '2c']);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-allow-2b-'));
  temporaires.push(d);
  const base = { fichier: 'src/services/x.js', avant: 'Contrat de restauration', apres: 'Contrat de restauration' };
  const charger = (entrees) => { fs.writeFileSync(path.join(d, 'B2.json'), JSON.stringify(entrees)); return chargerAllow(d); };
  const ok = charger([
    { ...base, type: 'reporte', lot: 3, justification: 'Texte fixe du contrat : lot 3 (modèle DocuSeal).' },
    { ...base, type: 'reporte', lot: '2c', justification: 'Description de search_knowledge_base : 2c.' },
    { ...base, type: 'admin', justification: 'Lu par le super_admin seulement : route /admin/clients, garde requireSuperAdmin.' },
    { ...base, type: 'admin', justification: 'Annuaire du boss : route GET /api/boss/annuaire, garde requireBoss.' },
    { ...base, type: 'fiscal', justification: 'Facture acheteur : document fiscal inchangé à l\'octet près.' },
  ]);
  assert.deepEqual(ok.problemes, []);
  assert.deepEqual(ok.entrees.map((e) => [e.type, e.lot, e.reporteAuLot ?? null]), [['reporte', 'B2', '3'], ['reporte', 'B2', '2c'], ['admin', 'B2', null], ['admin', 'B2', null], ['fiscal', 'B2', null]]);
  const mauvais = [
    [{ ...base, type: 'reporte', justification: 'Texte fixe du contrat, plus tard.' }, /type « reporte » : champ « lot » obligatoire \(3 ou 2c\)/],
    [{ ...base, type: 'reporte', lot: 4, justification: 'Texte fixe du contrat, plus tard.' }, /champ « lot » obligatoire/],
    [{ ...base, type: 'homonyme', lot: 3, justification: 'Homonyme du mot contrat.' }, /le champ « lot » ne vaut que pour le type « reporte »/],
    [{ ...base, type: 'admin', justification: 'Texte lu seulement par un administrateur.' }, /type « admin » : la justification nomme la route .* et son garde/],
    [{ ...base, type: 'admin', justification: 'Garde requireSuperAdmin, sans la route.' }, /type « admin » : la justification nomme la route/],
    [{ ...base, type: 'admin', justification: 'Route /admin/clients, sans le garde.' }, /type « admin » : la justification nomme la route/],
  ];
  for (const [entree, attendu] of mauvais) {
    const r = charger([entree]);
    assert.ok(r.problemes.some((p) => attendu.test(p)), `${JSON.stringify(entree)} → ${JSON.stringify(r.problemes)}`);
  }
});

test('lot 3 — type « remplace » : seulement un texte nouveau qui remplace un texte retiré', () => {
  assert.ok(TYPES_ALLOW.includes('remplace'));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-allow-l3r-'));
  temporaires.push(d);
  const charger = (entrees) => { fs.writeFileSync(path.join(d, 'L3.json'), JSON.stringify(entrees)); return chargerAllow(d); };
  const just = 'Email de bienvenue sans contrat (décision du client du 04/10/2026) : nouvelle introduction.';
  assert.deepEqual(charger([{ fichier: 'src/a.js', avant: null, apres: 'Votre espace est prêt.', type: 'remplace', justification: just }]).problemes, []);
  for (const entree of [
    { fichier: 'src/a.js', avant: 'Ancien texte', apres: null, type: 'remplace', justification: just },
    { fichier: 'src/a.js', avant: 'Ancien texte', apres: 'Votre espace est prêt.', type: 'remplace', justification: just },
  ]) {
    const r = charger([entree]);
    assert.ok(r.problemes.some((p) => /type « remplace » : seulement un texte nouveau/.test(p)), JSON.stringify(r.problemes));
  }
});

test('lot 3 — type « ajoute » : seulement un texte nouveau d\'une fonction nouvelle', () => {
  assert.ok(TYPES_ALLOW.includes('ajoute'));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-allow-l3a-'));
  temporaires.push(d);
  const charger = (entrees) => { fs.writeFileSync(path.join(d, 'L3.json'), JSON.stringify(entrees)); return chargerAllow(d); };
  const just = 'Section « Mon entreprise » du profil du client (lot 3, étape 6) : texte nouveau, sans terme du lexique.';
  const ok = charger([{ fichier: 'src/a.tsx', avant: null, apres: 'Mon entreprise', type: 'ajoute', justification: just }]);
  assert.deepEqual(ok.problemes, []);
  assert.deepEqual(ok.entrees.map((e) => e.modes), [['identite']]);
  for (const entree of [
    { fichier: 'src/a.tsx', avant: 'Ancien texte', apres: null, type: 'ajoute', justification: just },
    { fichier: 'src/a.tsx', avant: 'Ancien texte', apres: 'Mon entreprise', type: 'ajoute', justification: just },
  ]) {
    const r = charger([entree]);
    assert.ok(r.problemes.some((p) => /type « ajoute » : seulement un texte nouveau/.test(p)), JSON.stringify(r.problemes));
  }
});

test('lot 3 — type « retire » : seulement un texte supprimé avec sa fonctionnalité', () => {
  assert.ok(TYPES_ALLOW.includes('retire'));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-allow-l3-'));
  temporaires.push(d);
  const charger = (entrees) => { fs.writeFileSync(path.join(d, 'L3.json'), JSON.stringify(entrees)); return chargerAllow(d); };
  const just = 'Plus de contrats (décision du client du 04/10/2026) : le bouton et son texte disparaissent.';
  assert.deepEqual(charger([{ fichier: 'src/a.tsx', avant: 'Contrat actif', apres: null, type: 'retire', justification: just }]).problemes, []);
  for (const entree of [
    { fichier: 'src/a.tsx', avant: null, apres: 'Contrat actif', type: 'retire', justification: just },
    { fichier: 'src/a.tsx', avant: 'Contrat actif', apres: 'Abonnement actif', type: 'retire', justification: just },
  ]) {
    const r = charger([entree]);
    assert.ok(r.problemes.some((p) => /type « retire » : seulement un texte supprimé/.test(p)), JSON.stringify(r.problemes));
  }
});

test('E9 — accords : les 8 formes relevées au serveur sont dans ACCORDS_APRES, et signalées après un terme', () => {
  const formes = ['élevé|élevée', 'détecté|détectée', 'bon|bonne', 'récent|récente', 'confirmé|confirmée', 'autorisé|autorisée', 'référencé|référencée', 'réintégré|réintégrée'];
  for (const f of formes) assert.ok(ACCORDS_APRES.includes(f), f);
  // Les 6 autres formes relevées y étaient déjà (constat 15) : aucune en double.
  assert.equal(new Set(ACCORDS_APRES).size, ACCORDS_APRES.length);
  for (const f of ['supprimé|supprimée', 'valorisé|valorisée', 'désactivé|désactivée', 'reçu|reçue', 'actuel|actuelle', 'existant|existante']) assert.ok(ACCORDS_APRES.includes(f), f);
  const apres = (source) => analyser(source, SRV, { t: false }).unites.flatMap((u) => u.accords ?? []).filter((a) => a.position === 'apres').map((a) => a.mot);
  assert.deepEqual(apres(msg("'[[Nom:transfert]] confirmé'")), ['confirmé']);
  assert.deepEqual(apres(msg("'Écart [[compl:inventaire]] détecté'")), ['détecté']);
  assert.deepEqual(apres(msg("'[[Nom:article]] déjà référencé'")), ['référencé']);
  // Accordé par le moteur : rien à signaler.
  assert.deepEqual(apres(msg("'[[Nom:transfert]] [[acc:transfert:confirmé:confirmée]]'")), []);
});

test('E11 — formesDans(texte, formes) : mots entiers d\'une liste DONNÉE, sigle sensible à la casse, accents compris', () => {
  assert.deepEqual(formesDans('Le Labo central et la PT du jour', ['labo', 'PT', 'stock']), ['labo', 'PT']);
  assert.deepEqual(formesDans('Stock pt et labos', ['PT', 'labo']), [], 'sigle : casse respectée ; « labos » n\'est pas « labo »');
  assert.deepEqual(formesDans('laboratoire, labo_id, sous-labo, labo2', ['labo']), ['labo'], '« sous-labo » : le tiret sépare les mots');
  assert.deepEqual(formesDans('laboratoire, labo_id, labo2', ['labo']), []);
  assert.deepEqual(formesDans('Activité du jour', ['activité', 'activite']), ['activité'], 'accents compris : « activite » ne trouve pas « Activité »');
  assert.deepEqual(formesDans('ACTIVITÉ', ['activité']), ['activité'], 'un mot se cherche sans tenir compte de la casse');
  assert.deepEqual(formesDans('Prix (labo) : 3', ['labo', 'labo', 'Prix']), ['labo', 'Prix'], 'formes rendues telles que données, sans doublon, dans l\'ordre de la liste');
  assert.deepEqual(formesDans('Plats du jour', ['plat']), []);
  assert.deepEqual(formesDans('a.b*c', ['b*c', 'b.c', 'a+']), ['b*c'], 'forme échappée dans le motif : « b.c » ne trouve pas « b*c »');
  assert.deepEqual(formesDans('', ['labo']), []);
  assert.deepEqual(formesDans('labo', []), []);
  assert.deepEqual(formesDans(null, ['labo']), []);
  // termesDans, lui, cherche toujours toutes les formes du lexique par défaut.
  assert.ok(termesDans('Stock labo').includes('labo'));
});

test('E10 — idiomes du guide serveur : `const voc = req.voc ?? vocabDefaut;` reconnu ; (req.voc ?? vocabDefaut).Nom(…) et req[\'voc\'] non (interdits)', () => {
  const opts = { nom: SRV, t: false };
  const avant = "res.status(404).json({ message: 'Labo introuvable' });";
  identique(avant, "const voc = req.voc ?? vocabDefaut;\nres.status(404).json({ message: `${voc.Nom('labo')} introuvable` });", opts);
  identique(avant, "res.status(404).json({ message: `${req.voc.Nom('labo')} introuvable` });", opts);
  ecart(avant, "res.status(404).json({ message: `${(req.voc ?? vocabDefaut).Nom('labo')} introuvable` });", { moins: 'Labo introuvable', plus: '⟦·⟧ introuvable' }, opts);
  ecart(avant, "res.status(404).json({ message: `${req['voc'].Nom('labo')} introuvable` });", { moins: 'Labo introuvable', plus: '⟦·⟧ introuvable' }, opts);
});

test('CLI identite : un fichier nommé qui n\'est pas du code (CHAMPS.md) est ignoré et signalé, pas compilé', () => {
  const d = depot({ 'src/A.tsx': PAGE_A, 'docs/CHAMPS.md': '# Champs\n\nNb activités, Option Acheteurs (lot 2)\n' });
  ecrire(d, { 'docs/CHAMPS.md': '# Champs\n\nNb activités, Option Acheteurs (lot 3)\n' });
  const r = outil(d, 'identite', 'src/A.tsx', 'docs/CHAMPS.md');
  assert.equal(r.code, 0, r.sortie + r.erreur);
  assert.match(r.sortie, /docs\/CHAMPS\.md : pas du code, ignoré par identite/);
  assert.match(r.sortie, /identite : 1 fichier\(s\) comparé\(s\).* 0 écart\(s\), 0 erreur\(s\)/);
  assert.doesNotMatch(r.sortie, /analyse impossible/);
});

test('E5b / CLI : residuels sans liste lit aussi docuseal-templates/CHAMPS.md — ses écarts admis servent, pas « sans objet » ; identite ne le lit pas', () => {
  assert.deepEqual(RESIDUELS_EN_PLUS, ['docuseal-templates/CHAMPS.md']);
  const champs = '| `Nb labos` | nombre de labos du compte |\n';
  const d = depot({ 'src/a.js': 'module.exports = {};\n', 'docuseal-templates/CHAMPS.md': champs });
  let r = outil(d, 'residuels');
  assert.equal(r.code, 1, r.sortie + r.erreur);
  assert.match(r.sortie, /^docuseal-templates\/CHAMPS\.md:1 .*« Nb labos »$/m);
  assert.match(r.sortie, /residuels : 2 fichier\(s\), 1 unité\(s\) dans 1 fichier\(s\)/);
  ecrire(d, { 'scripts/vocab-allow/B2.json': JSON.stringify([{ fichier: 'docuseal-templates/CHAMPS.md', avant: 'Nb labos', apres: 'Nb labos', type: 'discriminant', justification: 'Nom de champ DocuSeal, inchangé.' }]) });
  r = outil(d, 'residuels');
  assert.equal(r.code, 0, r.sortie + r.erreur);
  assert.doesNotMatch(r.sortie, /allow sans objet/);
  // Nommé, il est lu de même ; un autre fichier nommé seul ne l'entraîne pas.
  r = outil(d, 'residuels', 'docuseal-templates/CHAMPS.md');
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 0 unité\(s\)/);
  r = outil(d, 'residuels', 'src/a.js');
  assert.match(r.sortie, /residuels : 1 fichier\(s\), 0 unité\(s\)/);
  // identite et accords, sans liste, ne le lisent pas (pas du code, hors périmètre git E1).
  ecrire(d, { 'docuseal-templates/CHAMPS.md': champs.replace('du compte', 'du compte client') });
  r = outil(d, 'identite');
  assert.equal(r.code, 0, r.sortie + r.erreur);
  assert.doesNotMatch(r.sortie, /CHAMPS/);
});

test('Consolidation 2b — compterBesoins ne compte que les besoins ouverts (sans état final dans etat)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-besoins-'));
  try {
    assert.equal(compterBesoins(path.join(d, 'absent')), 0);
    fs.writeFileSync(path.join(d, 'B1.json'), JSON.stringify([
      { demande: 'sans état' },
      { demande: 'a', etat: 'APPLIQUÉ par l\'intégrateur' },
      { demande: 'b', etat: 'REFUSÉ (consolidation) : facultatif' },
      { demande: 'c', etat: 'REPORTÉ au lot 2c' },
      { demande: 'd', etat: 'SANS OBJET : non capté' },
      { demande: 'e', etat: 'DÉCISION CLIENT : garder tel quel' },
      { demande: 'f', etat: 'NON appliqué, porté à la consolidation' },
      { demande: 'g', etat: 'APPLIQUÉES' },
    ]));
    fs.writeFileSync(path.join(d, 'B2.json'), '[]');
    fs.writeFileSync(path.join(d, 'S5-decisions.json'), JSON.stringify({ decisions: [{ demande: 'x' }] }));
    fs.writeFileSync(path.join(d, 'B3.json'), '{ illisible');
    // ouverts : « sans état », « NON appliqué… », « APPLIQUÉES » (pas un état final), + 1 fichier illisible
    assert.equal(compterBesoins(d), 4);
    assert.ok(ETAT_BESOIN_CLOS.test('DÉCISION CLIENT (consolidation)'));
    assert.ok(!ETAT_BESOIN_CLOS.test('Appliqué'));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});
