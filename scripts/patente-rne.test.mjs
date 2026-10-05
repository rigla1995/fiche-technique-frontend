// Lot 3, étape 7 — couche « pdf » de la lecture de la patente : extrait RNE lu PAR POSITIONS, sans IA.
//   node --test scripts/patente-rne.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
// Données SYNTHÉTIQUES seulement : une société fictive posée aux positions (en points) de la mise en page d'un
// extrait. Aucune valeur d'un document réel ne doit entrer ici.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyserExtraitRne, joindre, lectureExtraitRne, reconnaitre, reconstruireArabe, regrouperEnLignes,
  CARACTERES_MAX, LIEN_VERIFICATION_RNE, MORCEAUX_MAX, NOTE_ADRESSE_ENTIERE, NOTE_MATRICULE_RACINE, PAGES_MAX,
} from '../src/components/admin/patente/rne/analyseur.ts';
import { decouperAdresse, formeJuridiqueVersCode, normaliser, qualiteVersFrancais, rognerBouts } from '../src/components/admin/patente/rne/tables.ts';
import { lireCasesACocher, origineDuTexte } from '../src/components/admin/patente/rne/dessins.ts';
import { lireTextePdf } from '../src/components/admin/patente/rne/lireTextePdf.ts';
import { imprimable } from '../src/components/admin/patente/types.ts';

// ── Extrait synthétique ────────────────────────────────────────────────────────────────────────────────────────────
const CODE = 'ABCDEF12GHIJKL';
const IDENTIFIANT = '1234567A';
const NUMERO = 'ER20260000001';
const DATE = '2026/01/15';
const GESTION = 'B01234562026';
const DENOMINATION = 'SOCIETE EXEMPLE';
const ADRESSE = '8 Rue des Jasmins 5000 Monastir Monastir';
const FORME = 'Société à Responsabilité Limitée (SARL)';
const ARABE = /[\u{0600}-\u{06FF}\u{FB50}-\u{FDFF}\u{FE70}-\u{FEFF}]/u;

const m = (str, x, y, largeur) => ({ str, x, y, largeur });
// arabe en un seul morceau : pdf.js remet les morceaux de plusieurs glyphes dans l'ordre logique
const ar = (str, x, y, largeur) => m(str, x, y, largeur);
// arabe glyphe par glyphe, en ordre VISUEL : le premier caractère logique est le plus à droite
const glyphes = (texte, xDroite, y, pas) => [...texte].map((c, k) => m(c, xDroite - (k + 1) * pas, y, c === ' ' ? pas - 1 : pas));

// En-tête répété en haut de chaque page : valeurs À GAUCHE de libellés empilés (arabe au-dessus, français dessous).
const enTete = () => [
  m(`${CODE} :`, 221.1, 797.9, 114.1), m(' ', 335.2, 797.9, 4), ...glyphes('رقم التثبت من السجل', 440, 797.9, 5.3),
  m('registre-entreprises.tn/rne-public/#/qr-code/validation :', 160, 779.9, 221), ar('الرابط للتثبت', 385, 779.9, 60),
  m(DATE, 122, 761.9, 50), ar('تاريخ إستخراج المضمون', 178, 761.9, 112), m(NUMERO, 303, 761.9, 72), ar('عدد المضمون', 384, 761.9, 60),
  m("DATE D'ÉDITION DE", 203.1, 752.9, 62.8), m('L’EXTRAIT', 267.5, 752.9, 31), m('NUMÉRO EXTRAIT', 398.2, 752.9, 52),
  m('IDENTIFIANT UNIQUE', 122.1, 737.9, 103.4), m(IDENTIFIANT, 286, 738.9, 52), ar('المعرف الوحيد', 379, 738.9, 70),
];
const piedDePage = (n) => [m(`${n} / 2`, 287, 81.6, 20), m('+216 70 000 000', 274, 35.6, 70), m('www.registre-entreprises.tn', 365, 35.6, 110)];

const page1 = () => [
  ...enTete(),
  m('(', 99, 657.9, 4), ar('شركة', 106, 657.9, 45), m(')', 154, 657.9, 4), ar('مضمون من السجل الوطني للمؤسسات', 166, 657.9, 250),
  m('EXTRAIT RNE (SOCIÉTÉ)', 231, 635.1, 132),
  m('Extrait complet /', 235, 618.1, 68), ar('مضمون شامل', 306, 618.1, 50),
  m('IDENTIFICATION DE L’ENTREPRISE', 13, 589.0, 190), ar('تعريف المؤسسة', 514, 589.0, 66),
  // grille : libellés arabes, valeurs, libellés français
  ar('نوع السجل', 148, 562.5, 40), ar('عدد التصرف الداخلي', 310, 562.5, 66), ar('المعرف الوحيد', 517, 562.5, 52),
  ar('شركة', 60, 557.2, 22), m(GESTION, 214, 557.2, 76), m(IDENTIFIANT, 430, 557.2, 50),
  m('TYPE DE REGISTRE', 133.1, 550.8, 55.8), m('N° DE GESTION INTERNE', 316.6, 550.8, 74.3), m('IDENTIFIANT UNIQUE', 512.3, 550.8, 62.7),
  // bloc principal : la ligne arabe au-dessus, « Libellé: valeur » dessous
  ar('شركة المثال', 437, 536.0, 60), m(':', 504, 536.0, 3), ar('الإسم الاجتماعي', 509, 536.0, 70),
  m('Dénomination sociale:', 20.2, 519.5, 92.2), m(DENOMINATION, 126, 519.5, 95),
  m(':', 516, 503.6, 3), ar('الإسم التجاري', 520, 503.6, 60),
  m('Nom commercial:', 20.2, 487.2, 73.1),
  m('Enseigne:', 20.2, 471.3, 41.3), m(':', 545, 471.3, 3), ar('الشارة', 549, 471.3, 30),
  ar('المنستير', 361, 454.8, 44), m('5000', 409, 454.8, 20), ar('الياسمين', 434, 454.8, 24), m('8', 462, 454.8, 6), ar('عدد', 476, 454.8, 14), m(':', 505, 454.8, 3), ar('المقر الإجتماعي', 510, 454.8, 70),
  m('Adresse du siège social:', 20.2, 438.9, 99.6), m('8 Rue des Jasmins 5000', 134, 438.9, 105), m(' ', 239, 438.9, 3), m('Monastir Monastir', 242, 438.9, 80),
  ar('المنستير', 374, 422.5, 44), m('5000', 422, 422.5, 20), ar('الياسمين', 448, 422.5, 24), m('8', 475, 422.5, 6), ar('عدد', 489, 422.5, 14), m(':', 519, 422.5, 3), ar('عنوان النشاط', 523, 422.5, 55),
  m('Adresse Activité:', 20.2, 406.6, 70.4), m('8 Rue des Jasmins 5000', 104, 406.6, 105), m('Monastir Monastir', 212, 406.6, 80),
  ar('شركة ذات المسؤولية المحدودة', 302, 390.1, 200), m(':', 509, 390.1, 3), ar('الشكل القانوني', 513, 390.1, 60),
  m('Forme juridique:', 20.2, 374.2, 67.8), m(FORME, 102, 374.2, 190),
  m('Capital social:', 20.2, 357.8, 62), m('10000', 283, 357.8, 28), m(':', 530, 357.8, 3), ar('رأس المال', 534, 357.8, 40),
  m('Durée de l’entreprise:', 20.2, 341.9, 95), m('50', 292, 341.9, 11), m(':', 522, 341.9, 3), ar('مدة الشركة', 527, 341.9, 45),
  m('Date de publication:', 20.2, 325.4, 88), m('2026/01/10', 270, 325.4, 50), m(':', 520, 325.4, 3), ar('تاريخ الاشهار', 524, 325.4, 50),
  m('INFORMATIONS RELATIVES A L’ACTIVITE', 13, 301.0, 215), ar('بيانات تخص النشاط', 507, 301.0, 70),
  ar('تجارة بالتفصيل', 440, 274.5, 65), m(':', 509, 274.5, 3), ar('النشاط الرئيسي', 513, 274.5, 60),
  m('Activité principale:', 20.2, 243.2, 85), m('Commerce de détail', 113, 243.2, 85),
  m('Code activité principale:', 20.2, 211.9, 108), m('47110', 283, 211.9, 28), m(':', 493, 211.9, 3), ar('رمز النشاط الرئيسي', 497, 211.9, 80),
  m('Date debut activité:', 20.2, 195.5, 88), m('2025/06/01', 270, 195.5, 50), m(':', 503, 195.5, 3), ar('تاريخ بداية النشاط', 507, 195.5, 75),
  ...piedDePage(1),
];

const page2 = () => [
  ...enTete(),
  m('INFORMATIONS RELATIVES A LA DIRECTION', 13, 681.8, 225), ar('بيانات تخص الادارة', 510, 681.8, 70),
  m('QUALITÉ', 79, 644.1, 26.9), ar('الصفة', 109, 644.1, 16), m('NATIONALITÉ', 257.2, 644.1, 40.7), ar('الجنسية', 301, 644.1, 24), m('NOM ET PRÉNOM', 426.4, 644.1, 56.1), ar('الإسم و اللقب', 485, 644.1, 50),
  // « وكيل » (gérant) en formes de présentation, un glyphe par morceau, en ordre visuel
  m('\u{FEDE}', 97, 615.0, 4), m('\u{FEF4}', 101, 615.0, 4), m('\u{FEDB}', 105, 615.0, 4), m('\u{FEED}', 109, 615.0, 5),
  ar('تونسية', 282, 615.0, 22), ...glyphes('فلان الفلاني', 505, 615.0, 3.4),
  m('AUTRES INFORMATIONS Y COMPRIS SITUATION FISCALE', 13, 583.7, 290), ar('بيانات أخرى', 430, 583.7, 150),
  ar('سجل مشطب عليه', 66, 557.7, 60), ar('سجل معلق', 249, 557.7, 40), ar('مباشر', 427, 557.7, 25), ar('حالة السجل', 528, 557.7, 45),
  m('REGISTRE', 91.7, 543.4, 29.3), m('RADIÉ', 122.5, 543.4, 18.1), m('SUSPENDU', 264.1, 543.4, 33.1), m('ACTIF', 436.4, 543.4, 16.9), m('ÉTAT DU REGISTRE', 519.7, 545.5, 55.3),
  m('TUNTRUST. Cet extrait fictif sert aux tests.', 18, 244.3, 220),
  ...piedDePage(2),
];

// Cases à cocher de la page 2 (lues dans les dessins) : REGISTRE RADIÉ, SUSPENDU, ACTIF.
const casesEtat = (coches = { actif: true }) => [
  { x0: 147.7, x1: 158, y0: 547.9, y1: 558.2, cochee: !!coches.radie },
  { x0: 304.1, x1: 314.4, y0: 547.9, y1: 558.2, cochee: !!coches.suspendu },
  { x0: 460.6, x1: 470.9, y0: 547.9, y1: 558.2, cochee: !!coches.actif },
];

const extrait = () => [
  { largeur: 595, hauteur: 842, morceaux: page1(), cases: [] },
  { largeur: 595, hauteur: 842, morceaux: page2(), cases: casesEtat() },
];
const retirer = (doc, critere) => {
  for (const [k, p] of doc.entries()) p.morceaux = p.morceaux.filter((i) => !critere(i, k + 1));
  return doc;
};
const morceau = (doc, page, str) => doc[page - 1].morceaux.find((i) => i.str === str);

// ── Lecture complète ───────────────────────────────────────────────────────────────────────────────────────────────
const CHAMPS_ATTENDUS = {
  raisonSociale: { valeur: DENOMINATION, source: 'pdf', aRelire: false },
  formeJuridique: { valeur: 'SARL', source: 'pdf', aRelire: false },
  matriculeFiscal: { valeur: IDENTIFIANT, source: 'pdf', aRelire: false, note: NOTE_MATRICULE_RACINE },
  rne: { valeur: IDENTIFIANT, source: 'pdf', aRelire: false },
  adresse: { valeur: '8 Rue des Jasmins', source: 'pdf', aRelire: false },
  ville: { valeur: '5000 Monastir', source: 'pdf', aRelire: false },
  representantQualite: { valeur: 'Gérant', source: 'pdf', aRelire: false },
};

test('extrait complet : champs de la fiche, vérification, aucun avertissement', () => {
  const l = lectureExtraitRne(extrait());
  assert.ok(l);
  assert.equal(l.document, 'extrait_rne');
  assert.deepEqual(l.champs, CHAMPS_ATTENDUS);
  assert.equal(l.champs.nomCommercial, undefined, 'nom commercial vide sur le document : champ absent');
  assert.equal(l.champs.representantNom, undefined, 'nom du représentant en arabe : champ absent');
  assert.deepEqual(l.verification, { code: CODE, lien: LIEN_VERIFICATION_RNE });
  assert.deepEqual(l.avertissements, []);
  assert.match(NOTE_MATRICULE_RACINE, /^racine seulement/);
  for (const c of Object.values(l.champs)) assert.ok(imprimable(c.valeur), `imprimable : ${c.valeur}`);
});

test('reconnaissance : 8 marqueurs, type lu dans le titre', () => {
  const r = reconnaitre(extrait());
  assert.equal(r.estExtraitRne, true);
  assert.equal(r.type, 'SOCIETE');
  assert.equal(r.marqueurs.length, 8);
});

test('texte reconnu : lignes latines dans l’ordre de lecture, jamais d’arabe', () => {
  const { lignes } = lectureExtraitRne(extrait());
  for (const attendue of [
    `Code de vérification : ${CODE}`,
    'Lien de vérification : registre-entreprises.tn/rne-public/#/qr-code/validation',
    `DATE D'ÉDITION DE L’EXTRAIT : ${DATE}`,
    `NUMÉRO EXTRAIT : ${NUMERO}`,
    `IDENTIFIANT UNIQUE : ${IDENTIFIANT}`,
    'EXTRAIT RNE (SOCIÉTÉ)',
    'Extrait complet',
    'TYPE DE REGISTRE : Société',
    `N° DE GESTION INTERNE : ${GESTION}`,
    `Dénomination sociale: ${DENOMINATION}`,
    'Nom commercial:',
    'Enseigne:',
    `Adresse du siège social: ${ADRESSE}`,
    `Forme juridique: ${FORME}`,
    'Capital social: 10000',
    "Qualité : Gérant — Nationalité : Tunisienne — Nom et prénom : en arabe sur l'extrait",
    'ÉTAT DU REGISTRE : ACTIF',
  ]) assert.ok(lignes.includes(attendue), `ligne attendue : ${attendue}\n${lignes.join('\n')}`);
  for (const l of lignes) assert.ok(!ARABE.test(l), `arabe dans : ${l}`);
  // ordre de lecture, et non ordre du flux
  const rang = (debut) => lignes.findIndex((l) => l.startsWith(debut));
  assert.ok(rang('Code de vérification') < rang('EXTRAIT RNE'));
  assert.ok(rang('Dénomination sociale') < rang('Nom commercial') && rang('Nom commercial') < rang('Adresse du siège'));
  assert.ok(rang('Forme juridique') < rang('Qualité :') && rang('Qualité :') < rang('ÉTAT DU REGISTRE'));
  // l'en-tête répété sur chaque page n'est donné qu'une fois ; le pied de page n'est pas repris
  assert.equal(lignes.filter((l) => l.startsWith('Code de vérification')).length, 1);
  assert.equal(lignes.filter((l) => l === `IDENTIFIANT UNIQUE : ${IDENTIFIANT}`).length, 2, 'en-tête + grille de la page 1');
  assert.ok(!lignes.some((l) => /^\d \/ \d$|\+216|^www\./.test(l)));
  // chiffres et ponctuation de la ligne ARABE de l'adresse : pas repris
  assert.ok(!lignes.some((l) => /^(5000|8|:)/.test(l)));
});

test('ordre du flux mélangé : même résultat (on ne se fie qu’aux positions)', () => {
  const reference = lectureExtraitRne(extrait());
  const inverse = extrait();
  for (const p of inverse) p.morceaux.reverse();
  assert.deepEqual(lectureExtraitRne(inverse), reference);
  // tous les libellés d'abord, puis les valeurs : c'est ainsi que l'extrait est dessiné
  const libellesDabord = extrait();
  for (const p of libellesDabord) p.morceaux.sort((a, b) => Number(/\d/.test(a.str)) - Number(/\d/.test(b.str)) || a.x - b.x);
  assert.deepEqual(lectureExtraitRne(libellesDabord), reference);
  let graine = 20261004;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  for (let essai = 0; essai < 5; essai++) {
    const melange = extrait();
    for (const p of melange) {
      for (let i = p.morceaux.length - 1; i > 0; i--) {
        const j = Math.floor(hasard() * (i + 1));
        [p.morceaux[i], p.morceaux[j]] = [p.morceaux[j], p.morceaux[i]];
      }
    }
    assert.deepEqual(lectureExtraitRne(melange), reference);
  }
});

// ── Valeur absente : vide, sans prendre le voisin ──────────────────────────────────────────────────────────────────
test('nom commercial et enseigne vides sur le document : vides, la ligne suivante n’est pas prise', () => {
  const a = analyserExtraitRne(extrait());
  assert.equal(a.valeurs.nomCommercial, '');
  assert.equal(a.valeurs.enseigne, '');
  assert.equal(a.valeurs.denomination, DENOMINATION);
});

test('dénomination absente : vide (ni le libellé suivant, ni la dénomination arabe du dessus)', () => {
  const doc = retirer(extrait(), (i) => i.str === DENOMINATION);
  assert.equal(analyserExtraitRne(doc).valeurs.denomination, '');
  const l = lectureExtraitRne(doc);
  assert.equal(l.champs.raisonSociale, undefined);
  assert.ok(l.avertissements.some((t) => /Dénomination sociale introuvable/.test(t)));
  assert.deepEqual({ ...l.champs, raisonSociale: CHAMPS_ATTENDUS.raisonSociale }, CHAMPS_ATTENDUS, 'les autres champs sont intacts');
});

test('dénomination écrite en arabe seulement, ou dans un autre alphabet : jamais proposée, avertissement', () => {
  const doc = extrait();
  morceau(doc, 1, DENOMINATION).str = 'شركة المثال';
  const l = lectureExtraitRne(doc);
  assert.equal(l.champs.raisonSociale, undefined);
  assert.deepEqual(l.avertissements, ["Dénomination sociale introuvable sur l'extrait : à saisir à la main."]);
  assert.ok(l.lignes.every((t) => !ARABE.test(t)));
  // lettres qui ne s'impriment pas sur une facture (hors Windows-1252)
  const grec = extrait();
  morceau(grec, 1, DENOMINATION).str = '\u{0395}\u{03A4}\u{0391}\u{0399}\u{03A1}\u{0395}\u{0399}\u{0391}';
  const g = lectureExtraitRne(grec);
  assert.equal(g.champs.raisonSociale, undefined);
  assert.deepEqual(g.avertissements, ["La dénomination sociale n'est pas en lettres latines sur l'extrait : à saisir à la main."]);
});

test('barrières d’une valeur : un autre libellé sur la ligne, un « : » isolé', () => {
  // « Enseigne: » et sa valeur posés sur la ligne de « Nom commercial: » : le nom commercial reste vide
  const voisin = retirer(extrait(), (i) => i.str === 'Enseigne:');
  voisin[0].morceaux.push(m('Enseigne:', 250, 487.2, 41.3), m('CHEZ EXEMPLE', 300, 487.2, 70));
  const a = analyserExtraitRne(voisin);
  assert.equal(a.valeurs.nomCommercial, '');
  assert.equal(a.valeurs.enseigne, 'CHEZ EXEMPLE');
  // un « : » isolé (celui d'un libellé arabe) arrête la lecture : le texte qui le suit n'est pas la valeur
  const deuxPoints = extrait();
  deuxPoints[0].morceaux.push(m(':', 300, 487.2, 3), m('TEXTE VOISIN', 310, 487.2, 60));
  assert.equal(analyserExtraitRne(deuxPoints).valeurs.nomCommercial, '');
  assert.equal(lectureExtraitRne(deuxPoints).champs.nomCommercial, undefined);
});

test('adresse du siège absente : vide (ni le « 5000 » ni le « 8 » de la ligne arabe, ni l’adresse d’activité)', () => {
  const doc = retirer(extrait(), (i, page) => page === 1 && Math.abs(i.y - 438.9) < 0.5 && i.x > 130);
  const a = analyserExtraitRne(doc);
  assert.equal(a.valeurs.adresseSiege, '');
  assert.equal(a.valeurs.adresseActivite, ADRESSE);
  const l = lectureExtraitRne(doc);
  assert.equal(l.champs.adresse, undefined);
  assert.equal(l.champs.ville, undefined);
  assert.ok(l.avertissements.some((t) => /Adresse du siège social introuvable/.test(t)));
});

test('grille : n° de gestion absent → vide (ni l’identifiant voisin, ni le type de registre)', () => {
  const a = analyserExtraitRne(retirer(extrait(), (i) => i.str === GESTION));
  assert.equal(a.valeurs.numeroGestion, '');
  assert.equal(a.valeurs.identifiantUnique, IDENTIFIANT);
  assert.equal(a.valeurs.typeRegistre, 'شركة');
  assert.ok(a.lignes.includes('N° DE GESTION INTERNE :'));
});

test('identifiant absent de la grille : l’en-tête de page le donne encore, sans divergence', () => {
  const doc = retirer(extrait(), (i, page) => page === 1 && i.str === IDENTIFIANT && i.y < 600);
  const a = analyserExtraitRne(doc);
  assert.equal(a.valeurs.identifiantUnique, IDENTIFIANT);
  assert.deepEqual(a.divergents, []);
  assert.equal(lectureExtraitRne(doc).champs.rne.valeur, IDENTIFIANT);
});

test('identifiant différent d’un endroit à l’autre : ni matricule ni RNE proposés, avertissement', () => {
  const doc = extrait();
  doc[0].morceaux.find((i) => i.str === IDENTIFIANT && i.y < 600).str = '7654321B';
  const l = lectureExtraitRne(doc);
  assert.equal(l.champs.matriculeFiscal, undefined);
  assert.equal(l.champs.rne, undefined);
  assert.ok(l.avertissements.some((t) => /identifiant unique n'est pas le même/.test(t)));
});

test('identifiant absent partout ou mal formé : champs absents, avertissement', () => {
  const sans = lectureExtraitRne(retirer(extrait(), (i) => i.str === IDENTIFIANT));
  // sans l'identifiant, il reste 7 marqueurs : le document est toujours reconnu
  assert.ok(sans);
  assert.equal(sans.champs.matriculeFiscal, undefined);
  assert.ok(sans.avertissements.some((t) => /Identifiant unique introuvable/.test(t)));
  const doc = extrait();
  for (const p of doc) for (const i of p.morceaux) if (i.str === IDENTIFIANT) i.str = '123456A';
  const malForme = lectureExtraitRne(doc);
  assert.equal(malForme.champs.rne, undefined);
  assert.ok(malForme.avertissements.some((t) => /Identifiant unique illisible/.test(t)));
});

test('date d’édition absente partout : vide (pas le numéro d’extrait voisin)', () => {
  const a = analyserExtraitRne(retirer(extrait(), (i) => i.str === DATE));
  assert.equal(a.valeurs.dateEdition, '');
  assert.equal(a.valeurs.numeroExtrait, NUMERO);
});

// ── Décalages et débordements ──────────────────────────────────────────────────────────────────────────────────────
test('décalage vertical de la valeur : lue jusqu’à 2,5 pt, perdue à 3,5 pt', () => {
  for (const [dy, attendu] of [[1.5, DENOMINATION], [2.5, DENOMINATION], [-2.5, DENOMINATION], [3.5, '']]) {
    const doc = extrait();
    morceau(doc, 1, DENOMINATION).y += dy;
    assert.equal(analyserExtraitRne(doc).valeurs.denomination, attendu, `décalage de ${dy} pt`);
  }
});

test('valeur sur deux lignes : reprise si elle est alignée, sans aspirer la ligne arabe suivante', () => {
  const longue = () => {
    const doc = retirer(extrait(), (i, page) => page === 1 && Math.abs(i.y - 438.9) < 0.5 && i.x > 130);
    doc[0].morceaux.push(m('12 Avenue des Exemples, Résidence les Oliviers, Bloc B', 134, 438.9, 230));
    return doc;
  };
  const alignee = longue();
  alignee[0].morceaux.push(m('5000 Monastir Monastir', 134, 426.9, 95));
  assert.equal(analyserExtraitRne(alignee).valeurs.adresseSiege, '12 Avenue des Exemples, Résidence les Oliviers, Bloc B 5000 Monastir Monastir');
  const l = lectureExtraitRne(alignee);
  assert.equal(l.champs.adresse.valeur, '12 Avenue des Exemples, Résidence les Oliviers, Bloc B');
  assert.equal(l.champs.ville.valeur, '5000 Monastir');
  // une ligne qui n'est pas alignée sur le début de la valeur n'est pas reprise ; elle en est peut-être la fin : la
  // valeur est signalée « coupée », l'adresse n'est pas découpée, le champ est à relire
  const decalee = longue();
  decalee[0].morceaux.push(m('5000 Monastir Monastir', 180, 426.9, 95));
  const a = analyserExtraitRne(decalee);
  assert.equal(a.valeurs.adresseSiege, '12 Avenue des Exemples, Résidence les Oliviers, Bloc B');
  assert.deepEqual(a.coupees, ['adresseSiege']);
  const d = lectureExtraitRne(decalee);
  assert.deepEqual(d.champs.adresse, { valeur: '12 Avenue des Exemples, Résidence les Oliviers, Bloc B', source: 'pdf', aRelire: true, note: NOTE_ADRESSE_ENTIERE });
  assert.equal(d.champs.ville, undefined);
  assert.deepEqual(d.avertissements, ['Adresse du siège social : la valeur tient sur plusieurs lignes et a pu être coupée, relisez-la.']);
});

test('dénomination et nom commercial sur deux lignes : repris en entier si la 2e ligne est alignée', () => {
  const doc = extrait();
  Object.assign(morceau(doc, 1, DENOMINATION), { str: 'SOCIETE EXEMPLE DE DISTRIBUTION DE PRODUITS ET', largeur: 260 });
  doc[0].morceaux.push(
    m('DE BOISSONS EXEMPLE', 126, 509.5, 110),
    m('BOUTIQUE EXEMPLE DU CENTRE', 126.2, 487.2, 130), m('VILLE', 126.2, 477.5, 30),
  );
  const a = analyserExtraitRne(doc);
  assert.equal(a.valeurs.denomination, 'SOCIETE EXEMPLE DE DISTRIBUTION DE PRODUITS ET DE BOISSONS EXEMPLE');
  assert.equal(a.valeurs.nomCommercial, 'BOUTIQUE EXEMPLE DU CENTRE VILLE');
  assert.deepEqual(a.coupees, []);
  const l = lectureExtraitRne(doc);
  assert.deepEqual(l.champs.raisonSociale, { valeur: 'SOCIETE EXEMPLE DE DISTRIBUTION DE PRODUITS ET DE BOISSONS EXEMPLE', source: 'pdf', aRelire: false });
  assert.deepEqual(l.champs.nomCommercial, { valeur: 'BOUTIQUE EXEMPLE DU CENTRE VILLE', source: 'pdf', aRelire: false });
  assert.deepEqual(l.avertissements, []);
  // une valeur absente ne prend toujours pas la ligne du dessous
  const vide = extrait();
  vide[0].morceaux.push(m('VILLE', 126.2, 477.5, 30));
  assert.equal(analyserExtraitRne(vide).valeurs.nomCommercial, '');
});

test('valeur peut-être coupée (2e ligne non alignée) : 1re ligne seule, champ à relire, avertissement', () => {
  // retour à la ligne sous le libellé : la suite n'est pas reprise
  const doc = extrait();
  Object.assign(morceau(doc, 1, DENOMINATION), { str: 'SOCIETE EXEMPLE DE DISTRIBUTION DE PRODUITS ET', largeur: 260 });
  doc[0].morceaux.push(m('DE BOISSONS EXEMPLE', 20.2, 509.5, 110));
  assert.deepEqual(analyserExtraitRne(doc).coupees, ['denomination']);
  const l = lectureExtraitRne(doc);
  assert.deepEqual(l.champs.raisonSociale, { valeur: 'SOCIETE EXEMPLE DE DISTRIBUTION DE PRODUITS ET', source: 'pdf', aRelire: true });
  assert.deepEqual(l.avertissements, ['Dénomination sociale : la valeur tient sur plusieurs lignes et a pu être coupée, relisez-la.']);
  assert.equal(l.champs.rne.aRelire, false, 'seul le champ concerné est à relire');
  // même chose pour l'enseigne reprise comme nom commercial, et pour la forme juridique
  const autres = extrait();
  autres[0].morceaux.push(m('CHEZ EXEMPLE ET', 126.2, 471.3, 80), m('COMPAGNIE', 20.2, 462.0, 50), m('suite du libellé', 20.2, 365.0, 70));
  const c = lectureExtraitRne(autres);
  assert.equal(c.champs.nomCommercial.valeur, 'CHEZ EXEMPLE ET');
  assert.equal(c.champs.nomCommercial.aRelire, true);
  assert.equal(c.champs.formeJuridique.aRelire, true);
  assert.deepEqual(c.avertissements, [
    'Enseigne : la valeur tient sur plusieurs lignes et a pu être coupée, relisez-la.',
    'Forme juridique : la valeur tient sur plusieurs lignes et a pu être coupée, relisez-la.',
  ]);
  // adresse dont le code postal est sûr, mais suivie d'une ligne non reprise : découpée, rue et ville à relire, un
  // seul avertissement pour les deux champs
  const adresse = extrait();
  adresse[0].morceaux.push(m('Bureau Exemple', 20.2, 428.5, 70));
  const d = lectureExtraitRne(adresse);
  assert.deepEqual(d.champs.adresse, { valeur: '8 Rue des Jasmins', source: 'pdf', aRelire: true });
  assert.deepEqual(d.champs.ville, { valeur: '5000 Monastir', source: 'pdf', aRelire: true });
  assert.deepEqual(d.avertissements, ['Adresse du siège social : la valeur tient sur plusieurs lignes et a pu être coupée, relisez-la.']);
  // une ligne latine plus à gauche que le libellé (titre d'un autre bloc) n'est pas une suite : rien n'est signalé
  const titre = extrait();
  titre[0].morceaux.push(m('SECTION EXEMPLE', 13, 428.5, 90));
  assert.deepEqual(analyserExtraitRne(titre).coupees, []);
  assert.deepEqual(lectureExtraitRne(titre).champs, CHAMPS_ATTENDUS);
});

test('nom commercial présent : lu ; enseigne seule : reprise avec une note', () => {
  const avecNom = extrait();
  avecNom[0].morceaux.push(m('BOUTIQUE EXEMPLE', 126.2, 487.2, 90));
  const a = analyserExtraitRne(avecNom);
  assert.equal(a.valeurs.nomCommercial, 'BOUTIQUE EXEMPLE');
  assert.equal(a.valeurs.enseigne, '');
  assert.deepEqual(lectureExtraitRne(avecNom).champs.nomCommercial, { valeur: 'BOUTIQUE EXEMPLE', source: 'pdf', aRelire: false });
  const avecEnseigne = extrait();
  avecEnseigne[0].morceaux.push(m('CHEZ EXEMPLE', 126.2, 471.3, 70));
  const c = lectureExtraitRne(avecEnseigne).champs.nomCommercial;
  assert.equal(c.valeur, 'CHEZ EXEMPLE');
  assert.match(c.note, /Enseigne/);
});

// ── Cases à cocher : état du registre ──────────────────────────────────────────────────────────────────────────────
test('état du registre : SUSPENDU ou RADIÉ coché → avertissement ; rien de coché ou dessins non lus → avertissement', () => {
  const avec = (cases) => {
    const doc = extrait();
    doc[1].cases = cases;
    return doc;
  };
  assert.deepEqual(analyserExtraitRne(extrait()).etat, { actif: true, suspendu: false, radie: false });
  const suspendu = lectureExtraitRne(avec(casesEtat({ suspendu: true })));
  assert.deepEqual(suspendu.avertissements, ['Attention : la case « SUSPENDU » est cochée sur l\'extrait.']);
  assert.ok(suspendu.lignes.includes('ÉTAT DU REGISTRE : SUSPENDU'));
  const radie = lectureExtraitRne(avec(casesEtat({ radie: true })));
  assert.deepEqual(radie.avertissements, ['Attention : la case « REGISTRE RADIÉ » est cochée sur l\'extrait.']);
  assert.ok(radie.lignes.includes('ÉTAT DU REGISTRE : REGISTRE RADIÉ'));
  const aucune = lectureExtraitRne(avec(casesEtat({})));
  assert.equal(aucune.avertissements.length, 1);
  assert.match(aucune.avertissements[0], /Aucun état du registre/);
  assert.ok(aucune.lignes.includes('ÉTAT DU REGISTRE : aucune case cochée'));
  for (const doc of [avec(null), avec([])]) {
    const nonLu = lectureExtraitRne(doc);
    assert.equal(nonLu.avertissements.length, 1);
    assert.match(nonLu.avertissements[0], /État du registre non lu/);
    assert.deepEqual(nonLu.champs, CHAMPS_ATTENDUS, 'les champs ne dépendent pas des dessins');
  }
});

test('cases à cocher : lues dans la liste d’opérateurs (forme pdfjs 6 : [peinture, [chemin], minMax])', () => {
  const OPS = { save: 10, restore: 11, transform: 12, stroke: 20, fill: 22, endPath: 28, setStrokeRGBColor: 58, setFillRGBColor: 59, constructPath: 91 };
  const fnArray = [];
  const argsArray = [];
  const op = (nom, args = null) => { fnArray.push(OPS[nom]); argsArray.push(args); };
  const chemin = (peinture, boite) => op('constructPath', [OPS[peinture], [new Float32Array(0)], new Float32Array(boite)]);
  op('save');
  op('transform', [1, 0, 0, -1, 0, 842]); // repère retourné (y vers le bas), comme dans un PDF produit par un navigateur
  // case cochée : fond gris, bordure noire, deux rectangles pleins noirs
  op('setFillRGBColor', ['#eeeeee']); chemin('fill', [100, 280, 110, 290]);
  op('setStrokeRGBColor', ['#000000']); chemin('stroke', [100, 280, 110, 290]);
  op('setFillRGBColor', ['#000000']); chemin('fill', [102, 283, 106, 288]); chemin('fill', [104, 282, 109, 287]);
  // case vide : même dessin, mais un trait de la couleur du fond (invisible)
  op('setFillRGBColor', ['#eeeeee']); chemin('fill', [200, 280, 210, 290]);
  op('setStrokeRGBColor', ['#000000']); chemin('stroke', [200, 280, 210, 290]);
  op('setStrokeRGBColor', ['#eeeeee']); chemin('stroke', [202, 283, 208, 288]);
  // case sans dessin intérieur, couleurs données en composantes : cochée par un « X » de la couche texte
  op('setFillRGBColor', [238, 238, 238]); chemin('fill', [300, 280, 310, 290]);
  op('setStrokeRGBColor', [0, 0, 0]); chemin('stroke', [300, 280, 310, 290]);
  op('restore');
  // un grand cadre et un chemin sans boîte : ce ne sont pas des cases
  chemin('stroke', [10, 10, 500, 100]);
  op('constructPath', [OPS.endPath, [null], null]);
  const cases = lireCasesACocher(OPS, { fnArray, argsArray }, [m('X', 302, 554, 6)]);
  assert.deepEqual(cases, [
    { x0: 100, x1: 110, y0: 552, y1: 562, cochee: true },
    { x0: 200, x1: 210, y0: 552, y1: 562, cochee: false },
    { x0: 300, x1: 310, y0: 552, y1: 562, cochee: true },
  ]);
  assert.deepEqual(lireCasesACocher(OPS, { fnArray: [], argsArray: [] }), []);
});

// ── Tables ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test('table des formes juridiques : libellés français, libellés arabes de secours', () => {
  for (const [libelle, code] of [
    ['Société Unipersonnelle à Responsabilité Limitée (SUARL)', 'SUARL'],
    ['Société à Responsabilité Limitée (SARL)', 'SARL'],
    ['SOCIETE A RESPONSABILITE LIMITEE', 'SARL'],
    ['Société Anonyme (SA)', 'SA'],
    ['Société en Nom Collectif', 'SNC'],
    ['Société en Commandite Simple (SCS)', 'AUTRE'],
    ['Société en Commandite par Actions', 'AUTRE'],
    ['Personne physique', 'EI'],
    ['Entreprise individuelle', 'EI'],
    ['Auto-entrepreneur', 'AUTO_ENTREPRENEUR'],
    ['Association', 'ASSOCIATION'],
    ["Groupement d'Intérêt Economique (GIE)", 'AUTRE'],
    ['Société civile professionnelle', 'AUTRE'],
    // sigles pointés, hors parenthèses
    ['S.A.R.L', 'SARL'],
    ['S.U.A.R.L.', 'SUARL'],
    ['Société Exemple S.A.', 'SA'],
    // libellé inconnu : jamais « AUTRE » par défaut
    ['Forme inconnue du registre', ''],
    ['Fondation', ''],
  ]) assert.equal(formeJuridiqueVersCode(libelle), code, libelle);
  for (const [libelle, code] of [
    ['شركة الشخص الواحد ذات المسؤولية المحدودة', 'SUARL'],
    ['شركة ذات مسؤولية محدودة ذات شخص واحد', 'SUARL'],
    ['شركة ذات المسؤولية المحدودة', 'SARL'],
    ['شركة ذات مسؤولية محدودة', 'SARL'], // sans les articles
    ['شركة ذات مسئولية محدودة', 'SARL'], // autre graphie de la hamza
    ['شركة خفية الاسم', 'SA'],
    ['شركة خفية الإسم', 'SA'], // alif à hamza, comme dans les libellés de l'extrait
    ['شركة المفاوضة', 'SNC'],
    ['شركة مفاوضة', 'SNC'],
    ['المبادر الذاتي', 'AUTO_ENTREPRENEUR'],
    ['مبادر ذاتي', 'AUTO_ENTREPRENEUR'],
    ['شخص طبيعي', 'EI'],
    ['الشخص الطبيعي', 'EI'],
    ['جمعية', 'ASSOCIATION'],
    ['شركة المقارضة البسيطة', 'AUTRE'],
    ['شركة المقارضة بالأسهم', 'AUTRE'],
    ['تجمع المصالح الاقتصادية', 'AUTRE'],
    ['شركة مدنية', 'AUTRE'],
    ['شكل غير معروف', ''],
  ]) assert.equal(formeJuridiqueVersCode('', libelle), code, libelle);
  // le libellé français non reconnu laisse la main au libellé arabe
  assert.equal(formeJuridiqueVersCode('Forme inconnue du registre', 'شركة خفية الإسم'), 'SA');
  assert.equal(formeJuridiqueVersCode('', ''), '');
  assert.equal(formeJuridiqueVersCode(null, undefined), '');
});

test('forme juridique : libellé arabe en secours ; libellé inconnu → champ absent et avertissement, jamais « Autre » par défaut', () => {
  const arabeSeul = retirer(extrait(), (i) => i.str === FORME);
  assert.equal(analyserExtraitRne(arabeSeul).formeJuridiqueArabe, 'شركة ذات المسؤولية المحدودة');
  assert.deepEqual(lectureExtraitRne(arabeSeul).champs.formeJuridique, { valeur: 'SARL', source: 'pdf', aRelire: false });
  // variantes du libellé arabe : sans article, alif à hamza
  for (const [libelle, code] of [['شركة ذات مسؤولية محدودة', 'SARL'], ['شركة خفية الإسم', 'SA']]) {
    const variante = retirer(extrait(), (i) => i.str === FORME);
    morceau(variante, 1, 'شركة ذات المسؤولية المحدودة').str = libelle;
    assert.deepEqual(lectureExtraitRne(variante).champs.formeJuridique, { valeur: code, source: 'pdf', aRelire: false }, libelle);
  }
  // libellé français hors table, pas de libellé arabe : le champ n'est pas proposé, l'avertissement cite le libellé
  const inconnue = retirer(extrait(), (i) => Math.abs(i.y - 390.1) < 0.5);
  morceau(inconnue, 1, FORME).str = 'Fondation';
  const f = lectureExtraitRne(inconnue);
  assert.equal(f.champs.formeJuridique, undefined);
  assert.deepEqual(f.avertissements, ['Forme juridique non reconnue (« Fondation ») : à choisir à la main.']);
  // libellé arabe hors table, pas de libellé français
  const arabeInconnu = retirer(extrait(), (i) => i.str === FORME);
  morceau(arabeInconnu, 1, 'شركة ذات المسؤولية المحدودة').str = 'شكل غير معروف';
  const g = lectureExtraitRne(arabeInconnu);
  assert.equal(g.champs.formeJuridique, undefined);
  assert.deepEqual(g.avertissements, ["Forme juridique non reconnue sur l'extrait : à choisir à la main."]);
  // forme CONNUE hors de la liste de la fiche : « Autre » est alors une lecture, avec le libellé en note
  const commandite = extrait();
  morceau(commandite, 1, FORME).str = 'Société en Commandite Simple (SCS)';
  assert.deepEqual(lectureExtraitRne(commandite).champs.formeJuridique,
    { valeur: 'AUTRE', source: 'pdf', aRelire: false, note: "libellé de l'extrait : « Société en Commandite Simple (SCS) »" });
  const aucune = retirer(extrait(), (i) => i.str === FORME || Math.abs(i.y - 390.1) < 0.5);
  const l = lectureExtraitRne(aucune);
  assert.equal(l.champs.formeJuridique, undefined);
  assert.deepEqual(l.avertissements, ["Forme juridique introuvable sur l'extrait : à choisir à la main."]);
});

test('table des qualités : arabe → français, jamais d’arabe en sortie', () => {
  assert.equal(qualiteVersFrancais('وكيل'), 'Gérant');
  assert.equal(qualiteVersFrancais('GERANT'), 'Gérant');
  assert.equal(qualiteVersFrancais('رئيس مدير عام'), 'Président directeur général');
  assert.equal(qualiteVersFrancais('مدير عام'), 'Directeur général');
  assert.equal(qualiteVersFrancais('رئيس مجلس الإدارة'), "Président du conseil d'administration");
  // l'alif s'écrit avec ou sans hamza selon les documents
  assert.equal(qualiteVersFrancais('رئيس مجلس الادارة'), "Président du conseil d'administration");
  assert.equal(qualiteVersFrancais('أمين مال'), 'Trésorier');
  assert.equal(qualiteVersFrancais('امين المال'), 'Trésorier');
  assert.equal(qualiteVersFrancais('Gérante statutaire'), 'Gérant');
  assert.equal(qualiteVersFrancais('Mandataire'), 'Mandataire');
  assert.equal(qualiteVersFrancais('صفة غير معروفة'), '');
  assert.equal(qualiteVersFrancais(''), '');
  assert.equal(normaliser('  Dénomination   sociale: '), 'DENOMINATION SOCIALE:');
  assert.equal(normaliser('L’EXTRAIT'), "L'EXTRAIT");
});

test('représentant : nom proposé seulement en lettres latines ; plusieurs dirigeants → le représentant légal', () => {
  assert.deepEqual(analyserExtraitRne(extrait()).representants, [
    { qualiteLue: 'وكيل', nationaliteLue: 'تونسية', nomLu: 'فلان الفلاني', qualite: 'Gérant', nationalite: 'Tunisienne', nom: '', surPlusieursLignes: false },
  ]);
  const latin = retirer(extrait(), (i, page) => page === 2 && Math.abs(i.y - 615.0) < 0.5 && i.x > 400);
  latin[1].morceaux.push(m('PRENOM', 440, 615.0, 36), m('EXEMPLE', 479, 615.0, 40));
  const l = lectureExtraitRne(latin);
  assert.deepEqual(l.champs.representantNom, { valeur: 'PRENOM EXEMPLE', source: 'pdf', aRelire: false });
  assert.ok(l.lignes.includes('Qualité : Gérant — Nationalité : Tunisienne — Nom et prénom : PRENOM EXEMPLE'));
  // deux dirigeants : un administrateur d'abord, le président directeur général ensuite
  const deux = retirer(extrait(), (i, page) => page === 2 && Math.abs(i.y - 615.0) < 0.5);
  deux[1].morceaux.push(
    ar('متصرف', 95, 615.0, 24), ar('تونسية', 282, 615.0, 22), m('ADMINISTRATEUR EXEMPLE', 420, 615.0, 110),
    ar('رئيس مدير عام', 80, 600.0, 55), ar('تونسية', 282, 600.0, 22), m('DIRIGEANT EXEMPLE', 432, 600.0, 85),
  );
  const d = lectureExtraitRne(deux);
  assert.equal(d.champs.representantQualite.valeur, 'Président directeur général');
  assert.equal(d.champs.representantNom.valeur, 'DIRIGEANT EXEMPLE');
  assert.ok(d.avertissements.some((t) => /plusieurs dirigeants/.test(t)));
  // qualité arabe hors table : champ absent, avertissement
  const inconnue = retirer(extrait(), (i, page) => page === 2 && Math.abs(i.y - 615.0) < 0.5 && i.x < 200);
  inconnue[1].morceaux.push(ar('صفة غير معروفة', 80, 615.0, 50));
  const q = lectureExtraitRne(inconnue);
  assert.equal(q.champs.representantQualite, undefined);
  assert.ok(q.avertissements.some((t) => /Qualité du représentant non reconnue/.test(t)));
});

test('tableau de la direction : une cellule sur deux lignes ne fait pas un second dirigeant, mais le représentant est à relire', () => {
  const sansNom = () => retirer(extrait(), (i, page) => page === 2 && Math.abs(i.y - 615.0) < 0.5 && i.x > 400);
  const sansRangee = () => retirer(extrait(), (i, page) => page === 2 && Math.abs(i.y - 615.0) < 0.5);
  const COMPLET = 'PRENOM EXEMPLE DE LA FAMILLE EXEMPLE';
  // la fusion de deux lignes est une supposition : le nom et la qualité proposés sont à relire, sans avertissement
  const unSeul = (doc, qualite = 'Gérant', nom = COMPLET) => {
    const a = analyserExtraitRne(doc);
    assert.equal(a.representants.length, 1);
    assert.equal(a.representants[0].nom, nom);
    assert.equal(a.representants[0].surPlusieursLignes, true);
    const l = lectureExtraitRne(doc);
    assert.deepEqual(l.champs.representantNom, { valeur: nom, source: 'pdf', aRelire: true });
    assert.deepEqual(l.champs.representantQualite, { valeur: qualite, source: 'pdf', aRelire: true });
    assert.deepEqual(l.avertissements, []);
    assert.ok(l.lignes.includes(`Qualité : ${qualite} — Nationalité : Tunisienne — Nom et prénom : ${nom}`));
    // les autres champs ne sont pas touchés
    assert.deepEqual({ ...l.champs, representantNom: undefined, representantQualite: undefined }, { ...CHAMPS_ATTENDUS, representantNom: undefined, representantQualite: undefined });
  };
  // nom sur deux lignes, la 2e ligne ne porte que la suite du nom
  const nom = sansNom();
  nom[1].morceaux.push(m('PRENOM EXEMPLE DE LA', 430, 615.0, 110), m('FAMILLE EXEMPLE', 430, 604.0, 85));
  unSeul(nom);
  // cellules centrées en hauteur : 1re ligne du nom, puis qualité et nationalité, puis 2e ligne du nom
  const centre = sansNom();
  centre[1].morceaux.push(m('PRENOM EXEMPLE DE LA', 430, 621.0, 110), m('FAMILLE EXEMPLE', 430, 609.0, 85));
  unSeul(centre);
  // qualité sur deux lignes : lue en entier (« président du conseil d'administration », pas « président »)
  const qualite = retirer(sansNom(), (i, page) => page === 2 && Math.abs(i.y - 615.0) < 0.5 && i.x < 200);
  qualite[1].morceaux.push(ar('رئيس مجلس', 85, 615.0, 40), ar('الإدارة', 90, 604.0, 30), m(COMPLET, 420, 615.0, 130));
  unSeul(qualite, "Président du conseil d'administration");
  // deux rangées serrées dont la seconde n'a pas de nom : prises pour un seul dirigeant (le nom de la première, la
  // qualité des deux) — c'est peut-être faux, donc à relire
  const sansNomDessous = sansRangee();
  sansNomDessous[1].morceaux.push(
    ar('متصرف', 95, 615.0, 24), ar('تونسية', 282, 615.0, 22), m('ADMINISTRATEUR EXEMPLE', 420, 615.0, 110),
    ar('رئيس مدير عام', 80, 603.0, 55), ar('تونسية', 282, 603.0, 22),
  );
  unSeul(sansNomDessous, 'Président directeur général', 'ADMINISTRATEUR EXEMPLE');
  // une mention latine 15 pt sous le nom est collée au nom : à relire aussi
  const mention = sansNom();
  mention[1].morceaux.push(m('PRENOM EXEMPLE', 440, 615.0, 80), m('Mention fictive', 440, 600.0, 70));
  unSeul(mention, 'Gérant', 'PRENOM EXEMPLE Mention fictive');
  // une ligne complète, ou une ligne éloignée, reste un autre dirigeant : rien n'est fusionné, rien n'est à relire
  const loin = sansNom();
  loin[1].morceaux.push(m('DIRIGEANT EXEMPLE', 432, 615.0, 85), m('AUTRE EXEMPLE', 440, 590.5, 70));
  const l = lectureExtraitRne(loin);
  assert.deepEqual(analyserExtraitRne(loin).representants.map((r) => r.surPlusieursLignes), [false, false]);
  assert.deepEqual(l.champs.representantNom, { valeur: 'DIRIGEANT EXEMPLE', source: 'pdf', aRelire: false });
  assert.deepEqual(l.champs.representantQualite, { valeur: 'Gérant', source: 'pdf', aRelire: false });
  assert.deepEqual(l.avertissements, ["L'extrait liste plusieurs dirigeants : vérifiez le représentant proposé."]);
  // deux dirigeants, le nom du premier sur deux lignes : la fusion pèse sur le choix du représentant, à relire lui aussi
  const deux = sansRangee();
  deux[1].morceaux.push(
    ar('متصرف', 95, 615.0, 24), ar('تونسية', 282, 615.0, 22), m('ADMINISTRATEUR EXEMPLE DE LA', 420, 615.0, 130),
    m('FAMILLE EXEMPLE', 420, 604.0, 85),
    ar('رئيس مدير عام', 80, 589.0, 55), ar('تونسية', 282, 589.0, 22), m('DIRIGEANT EXEMPLE', 432, 589.0, 85),
  );
  assert.deepEqual(analyserExtraitRne(deux).representants.map((r) => [r.nom, r.surPlusieursLignes]), [['ADMINISTRATEUR EXEMPLE DE LA FAMILLE EXEMPLE', true], ['DIRIGEANT EXEMPLE', false]]);
  const d = lectureExtraitRne(deux);
  assert.deepEqual(d.champs.representantNom, { valeur: 'DIRIGEANT EXEMPLE', source: 'pdf', aRelire: true });
  assert.deepEqual(d.champs.representantQualite, { valeur: 'Président directeur général', source: 'pdf', aRelire: true });
  assert.deepEqual(d.avertissements, ["L'extrait liste plusieurs dirigeants : vérifiez le représentant proposé."]);
});

test('tableau de la direction : il s’arrête au titre suivant, même avec un accent ou une apostrophe', () => {
  for (const titre of ['INFORMATIONS RELATIVES A L’ÉTAT DU REGISTRE', "INFORMATIONS RELATIVES A L'ETAT DU REGISTRE", 'SITUATION DE L’ENTREPRISE']) {
    const doc = extrait();
    morceau(doc, 2, 'AUTRES INFORMATIONS Y COMPRIS SITUATION FISCALE').str = titre;
    const a = analyserExtraitRne(doc);
    assert.equal(a.representants.length, 1, titre);
    const l = lectureExtraitRne(doc);
    assert.deepEqual(l.champs, CHAMPS_ATTENDUS, titre);
    assert.deepEqual(l.avertissements, [], titre);
    assert.ok(l.lignes.includes('ÉTAT DU REGISTRE : ACTIF'), titre);
    assert.ok(l.lignes.includes(titre), titre);
  }
});

test('découpe de l’adresse : rue / code postal / ville / gouvernorat', () => {
  assert.deepEqual(decouperAdresse(ADRESSE), { rue: '8 Rue des Jasmins', codePostal: '5000', ville: 'Monastir', gouvernorat: 'Monastir' });
  assert.deepEqual(decouperAdresse('12 Avenue des Exemples 2080 Cité Exemple Ariana'), { rue: '12 Avenue des Exemples', codePostal: '2080', ville: 'Cité Exemple', gouvernorat: 'Ariana' });
  assert.deepEqual(decouperAdresse('3 Rue du Test -1000- Tunis'), { rue: '3 Rue du Test', codePostal: '1000', ville: 'Tunis', gouvernorat: 'Tunis' });
  // une rue peut porter un numéro à 4 chiffres : le code postal est le dernier
  assert.deepEqual(decouperAdresse('Rue 8600 Zone Exemple 2035 Tunis'), { rue: 'Rue 8600 Zone Exemple', codePostal: '2035', ville: 'Tunis', gouvernorat: 'Tunis' });
  assert.deepEqual(decouperAdresse('5 Rue des Tests 7000 Zarzouna Bizerte'), { rue: '5 Rue des Tests', codePostal: '7000', ville: 'Zarzouna', gouvernorat: 'Bizerte' });
  // pas de code postal suivi d'une ville : rien n'est découpé
  assert.deepEqual(decouperAdresse('Avenue des Exemples'), { rue: 'Avenue des Exemples', codePostal: '', ville: '', gouvernorat: '' });
  assert.deepEqual(decouperAdresse('4 Rue du Test 1000'), { rue: '4 Rue du Test 1000', codePostal: '', ville: '', gouvernorat: '' });
  assert.deepEqual(decouperAdresse(''), { rue: '', codePostal: '', ville: '', gouvernorat: '' });
  assert.deepEqual(decouperAdresse('Avenue 9 Avril 1938 1000 Tunis Tunis'), { rue: 'Avenue 9 Avril 1938', codePostal: '1000', ville: 'Tunis', gouvernorat: 'Tunis' });
  // rue au nom d'une date : le nombre qui suit le mois est un code postal quand il ne peut pas être une année
  assert.deepEqual(decouperAdresse('Rue du 2 Mars 4000 Sousse Sousse'), { rue: 'Rue du 2 Mars', codePostal: '4000', ville: 'Sousse', gouvernorat: 'Sousse' });
  assert.deepEqual(decouperAdresse('5 Rue des Tests, 2080, Cité Exemple, Ariana'), { rue: '5 Rue des Tests', codePostal: '2080', ville: 'Cité Exemple', gouvernorat: 'Ariana' });
  // quartier numéroté : un numéro de 1 ou 2 chiffres fait partie de la localité
  assert.deepEqual(decouperAdresse('5 Rue des Tests 2037 Cité Exemple 2 Ariana'), { rue: '5 Rue des Tests', codePostal: '2037', ville: 'Cité Exemple 2', gouvernorat: 'Ariana' });
  assert.deepEqual(decouperAdresse('12 Rue Exemple 2037 Quartier Exemple 2 Ariana'), { rue: '12 Rue Exemple', codePostal: '2037', ville: 'Quartier Exemple 2', gouvernorat: 'Ariana' });
  assert.deepEqual(decouperAdresse('12 Rue Exemple 2091 Quartier Exemple 12 Ariana'), { rue: '12 Rue Exemple', codePostal: '2091', ville: 'Quartier Exemple 12', gouvernorat: 'Ariana' });
  assert.deepEqual(decouperAdresse('12 Rue Exemple 2037 Quartier Exemple 2'), { rue: '12 Rue Exemple', codePostal: '2037', ville: 'Quartier Exemple 2', gouvernorat: '' });
  // tiret ou barre entre la rue, la ville et le gouvernorat : des séparateurs, jamais repris dans une valeur
  assert.deepEqual(decouperAdresse('12 Rue Exemple - 4000 Sousse - Sousse'), { rue: '12 Rue Exemple', codePostal: '4000', ville: 'Sousse', gouvernorat: 'Sousse' });
  assert.deepEqual(decouperAdresse('12 Rue Exemple 4000 Ville Exemple - Sousse'), { rue: '12 Rue Exemple', codePostal: '4000', ville: 'Ville Exemple', gouvernorat: 'Sousse' });
  assert.deepEqual(decouperAdresse('12 Rue Exemple 4000 Sousse / Sousse'), { rue: '12 Rue Exemple', codePostal: '4000', ville: 'Sousse', gouvernorat: 'Sousse' });
  assert.deepEqual(decouperAdresse('12 Rue Exemple / 4000 / Ville Exemple/Sousse'), { rue: '12 Rue Exemple', codePostal: '4000', ville: 'Ville Exemple', gouvernorat: 'Sousse' });
  assert.deepEqual(decouperAdresse('12 Rue Exemple 2037 Quartier Exemple 2 - Ariana'), { rue: '12 Rue Exemple', codePostal: '2037', ville: 'Quartier Exemple 2', gouvernorat: 'Ariana' });
  // une localité (ville, puis gouvernorat) tient en 60 caractères au plus
  assert.deepEqual(decouperAdresse(`12 Rue Exemple 4000 ${'Exemple'.padEnd(53, 'e')} Sousse`), { rue: '12 Rue Exemple', codePostal: '4000', ville: 'Exemple'.padEnd(53, 'e'), gouvernorat: 'Sousse' });
  // sur l'extrait : l'adresse et la ville sont proposées, sans rien à relire
  const doc = retirer(extrait(), (i, page) => page === 1 && Math.abs(i.y - 438.9) < 0.5 && i.x > 130);
  doc[0].morceaux.push(m('12 Rue Exemple - 2037 Quartier Exemple 2 - Ariana', 134, 438.9, 220));
  const l = lectureExtraitRne(doc);
  assert.deepEqual(l.champs, { ...CHAMPS_ATTENDUS, adresse: { valeur: '12 Rue Exemple', source: 'pdf', aRelire: false }, ville: { valeur: '2037 Quartier Exemple 2', source: 'pdf', aRelire: false } });
  assert.deepEqual(l.avertissements, []);
});

test('adresse sans code postal sûr : rien n’est découpé (numéro de voie, année, code postal en fin de ligne)', () => {
  for (const adresse of [
    'Rue 8600 Charguia 1 Tunis', // numéro de voie à 4 chiffres
    'Lot 1234 Zone Exemple Tunis',
    'Avenue 14 Janvier 2011 Sousse Sousse', // année d'un nom de rue
    'Avenue du 2 Mars 1934 Tunis',
    'Avenue 20 Mars 2000 Ville Exemple Tunis', // année ou code postal ? on ne sait pas : pas de découpe
    'Lot n° 1234, Zone Exemple, Tunis',
    'Rue 8601 Charguia 1 Tunis 2035', // code postal en fin de ligne : rien ne le suit
    '8600 Rue des Jasmins Tunis', // rien avant le nombre, et la rue le suit
    '2080 Ariana', // rien avant le nombre : pas de rue
    '12 bis 8600 Rue des Jasmins Tunis', // la rue suit le nombre : c'est un numéro
    'Immeuble 2000 Tunis',
    '12 Rue Exemple 2000 123 Tunis', // un nombre de 3 chiffres après le code postal : ce n'est pas un quartier numéroté
    '12 Rue Exemple 2000 Quartier 123 Tunis',
    'Résidence Exemple 2000 Bloc 3 Tunis', // la voie continue après le nombre
    '12 Rue Exemple 2083 Cité Exemple Résidence Exemple Ariana',
    '12 Rue Exemple 8000 Route de Tunis Nabeul',
    'Avenue 7 Novembre 2080 Ariana', // rue au nom d'une date : année ou code postal ? pas de découpe
    'Avenue 7 Novembre 2080 Quartier Exemple 2 - Ariana',
    '12 Rue Exemple 2037 Quartier Exemple 2 (Ariana)', // autre ponctuation : la localité n'est pas sûre
    `12 Rue Exemple 2037 ${'Quartier Exemple '.repeat(4)}Ariana`, // 9 mots : trop pour une localité
    `12 Rue Exemple 4000 ${'Exemple'.padEnd(54, 'e')} Sousse`, // 2 mots, mais 61 caractères : trop pour une localité
  ]) assert.deepEqual(decouperAdresse(adresse), { rue: adresse, codePostal: '', ville: '', gouvernorat: '' }, adresse);
  // une localité fabriquée (« a-a-a-… » : le tiret est lettre de mot ET séparateur) n'est pas découpée, et sans délai
  const debutTirets = performance.now();
  for (const n of [40, 100, 5000]) {
    const fabriquee = `12 Rue Exemple 5000 ${'a-'.repeat(n)}a!`;
    assert.deepEqual(decouperAdresse(fabriquee), { rue: fabriquee, codePostal: '', ville: '', gouvernorat: '' });
  }
  assert.ok(performance.now() - debutTirets < 1000, 'localité fabriquée : refusée sur sa longueur');
  // sur l'extrait : l'adresse est la ligne entière, à relire, avec une note ; la ville reste absente, sans avertissement
  for (const adresse of ['Avenue 14 Janvier 2011 Sousse Sousse', 'Zone industrielle Exemple']) {
    const doc = retirer(extrait(), (i, page) => page === 1 && Math.abs(i.y - 438.9) < 0.5 && i.x > 130);
    doc[0].morceaux.push(m(adresse, 134, 438.9, 180));
    const l = lectureExtraitRne(doc);
    assert.deepEqual(l.champs.adresse, { valeur: adresse, source: 'pdf', aRelire: true, note: NOTE_ADRESSE_ENTIERE }, adresse);
    assert.equal(l.champs.ville, undefined);
    assert.deepEqual(l.avertissements, []);
    assert.deepEqual({ ...l.champs, adresse: CHAMPS_ATTENDUS.adresse, ville: CHAMPS_ATTENDUS.ville }, CHAMPS_ATTENDUS, 'les autres champs sont intacts');
  }
  assert.match(NOTE_ADRESSE_ENTIERE, /^code postal non reconnu/);
});

// ── Mise en page ───────────────────────────────────────────────────────────────────────────────────────────────────
test('lignes, jointure latine, arabe en formes de présentation et en ordre visuel', () => {
  const lignes = regrouperEnLignes([m('valeur', 126, 518.0, 30), m('Libellé:', 20, 519.5, 40), m('dessous', 20, 503.6, 30), m('dessus', 400, 536.0, 30)]);
  assert.deepEqual(lignes.map((L) => L.items.map((i) => i.str)), [['dessus'], ['Libellé:', 'valeur'], ['dessous']]);
  assert.equal(joindre([m('Tunis', 60, 0, 25), m('1000', 20, 0, 20), m(' ', 40, 0, 3), m('Ville', 85.5, 0, 22)]), '1000 TunisVille');
  // « وكيل » : quatre glyphes de présentation, de gauche à droite sur la page
  assert.equal(reconstruireArabe([m('\u{FEDE}', 97, 0, 4), m('\u{FEF4}', 101, 0, 4), m('\u{FEDB}', 105, 0, 4), m('\u{FEED}', 109, 0, 5)]), 'وكيل');
  assert.equal(analyserExtraitRne(extrait()).representants[0].qualiteLue, 'وكيل');
});

// ── Code et lien de vérification ───────────────────────────────────────────────────────────────────────────────────
test('code de vérification : 14 caractères ancrés sur le libellé arabe ; lien officiel constant', () => {
  const court = extrait();
  for (const p of court) for (const i of p.morceaux) if (i.str === `${CODE} :`) i.str = 'ABCDEF12GHIJK :';
  const l = lectureExtraitRne(court);
  assert.deepEqual(l.verification, { code: null, lien: LIEN_VERIFICATION_RNE });
  assert.ok(l.avertissements.some((t) => /Code de vérification introuvable/.test(t)));
  // code dessiné caractère par caractère, espacé : recollé
  const espace = retirer(extrait(), (i) => i.str === `${CODE} :`);
  for (const p of espace) p.morceaux.push(...[...CODE].map((c, k) => m(c, 221.1 + k * 7.5, 797.9, 5)), m(':', 327, 797.9, 3));
  assert.equal(lectureExtraitRne(espace).verification.code, CODE);
  // le lien imprimé sur le document n'est jamais repris : un faux document ne peut pas mener ailleurs
  const faux = extrait();
  for (const p of faux) for (const i of p.morceaux) if (i.str.startsWith('registre-entreprises.tn/rne-public')) i.str = 'exemple.test/registre-entreprises.tn/rne-public/#/qr-code/validation :';
  assert.equal(lectureExtraitRne(faux).verification.lien, 'https://www.registre-entreprises.tn/rne-public/#/qr-code/validation');
});

// ── Document non reconnu, PDF sans texte ───────────────────────────────────────────────────────────────────────────
test('document non reconnu ou sans couche texte → null', () => {
  const page = (morceaux) => [{ largeur: 595, hauteur: 842, morceaux, cases: [] }];
  // un autre document
  assert.equal(lectureExtraitRne(page([m('FACTURE N° 2026-001', 50, 800, 120), m('Client : SOCIETE EXEMPLE', 50, 780, 150), m('Total TTC : 1 250,000 DT', 50, 760, 150)])), null);
  // deux marqueurs seulement (domaine + TUNTRUST)
  assert.equal(lectureExtraitRne(page([m('Voir www.registre-entreprises.tn pour le détail', 50, 800, 250), m('Cachet TUNTRUST', 50, 780, 90)])), null);
  // trois marqueurs, mais ni le titre ni le nom arabe du registre
  const sansFort = page([m('IDENTIFIANT UNIQUE', 50, 800, 100), m(IDENTIFIANT, 160, 800, 50), m('NUMÉRO EXTRAIT', 50, 780, 80), m(NUMERO, 140, 780, 70), m('Cachet TUNTRUST', 50, 760, 90)]);
  assert.equal(reconnaitre(sansFort).marqueurs.length, 3);
  assert.equal(lectureExtraitRne(sansFort), null);
  // un document qui cite le lien de validation : l'adresse du site et son lien ne comptent que pour UN marqueur
  const facture = page([m('FACTURE N° 2026-001', 50, 800, 120), m('registre-entreprises.tn/rne-public/#/qr-code/validation', 50, 780, 250), m('Signature TUNTRUST', 50, 760, 90)]);
  assert.deepEqual(reconnaitre(facture).marqueurs, ['domaine', 'lien de validation', 'cachet TUNTRUST']);
  assert.equal(reconnaitre(facture).estExtraitRne, false);
  assert.equal(lectureExtraitRne(facture), null);
  const lien = page([ar('مضمون من السجل الوطني للمؤسسات', 166, 800, 250), m('registre-entreprises.tn/rne-public/#/qr-code/validation', 50, 780, 250)]);
  assert.equal(reconnaitre(lien).marqueurs.length, 3);
  assert.equal(reconnaitre(lien).estExtraitRne, false, 'deux marqueurs indépendants seulement');
  // le domaine ne suffit plus : il faut le titre « EXTRAIT RNE » ou le nom arabe du registre
  const domaine = page([m('Voir www.registre-entreprises.tn', 50, 800, 150), m('IDENTIFIANT UNIQUE', 50, 780, 100), m(IDENTIFIANT, 160, 780, 50), m('Cachet TUNTRUST', 50, 760, 90), ...glyphes('رقم التثبت من السجل', 440, 740, 5.3)]);
  assert.equal(reconnaitre(domaine).marqueurs.length, 4);
  assert.equal(reconnaitre(domaine).estExtraitRne, false);
  // un autre papier du registre (attestation, récépissé) : ses marqueurs sont ceux d'un extrait, mais il n'en porte
  // aucun libellé → null, et non un extrait « où rien n'a été lu »
  const attestation = page([ar('مضمون من السجل الوطني للمؤسسات', 166, 700, 250), m('ATTESTATION FICTIVE DE DEPOT', 200, 650, 180), m('Signature TUNTRUST', 50, 300, 90), m('www.registre-entreprises.tn', 365, 35.6, 110)]);
  assert.equal(reconnaitre(attestation).estExtraitRne, true);
  assert.equal(lectureExtraitRne(attestation), null);
  // PDF scanné : aucune couche texte, ou quelques caractères perdus
  assert.equal(lectureExtraitRne(page([])), null);
  assert.equal(lectureExtraitRne([]), null);
  assert.equal(lectureExtraitRne(page([m('EXTRAIT RNE', 50, 800, 60)])), null);
  assert.equal(reconnaitre(page([])).nbCaracteres, 0);
});

// ── Point d'entrée : document pdf.js simulé ────────────────────────────────────────────────────────────────────────
const OPS = {
  save: 10, restore: 11, transform: 12, stroke: 20, fill: 22, setTextRenderingMode: 38, showText: 44, setStrokeRGBColor: 58, setFillRGBColor: 59,
  paintImageMaskXObject: 83, paintImageXObject: 85, constructPath: 91,
};
const VUE = [0, 0, 595, 842];
// Dessins d'une page, dans l'ordre où ils sont peints : 'texte', 'texteInvisible' (mode de rendu 3), 'image' (page
// entière), 'logo' (petite image), ou une boîte d'image [x, y, largeur, hauteur]. Puis les cases à cocher.
function operateurs(cases, dessins = ['logo', 'texte']) {
  const fnArray = [];
  const argsArray = [];
  const op = (nom, args = null) => { fnArray.push(OPS[nom]); argsArray.push(args); };
  for (const d of dessins) {
    if (d === 'texte') for (let k = 0; k < 5; k++) op('showText', [[]]);
    else if (d === 'texteInvisible') {
      op('save'); op('setTextRenderingMode', [3]);
      for (let k = 0; k < 5; k++) op('showText', [[]]);
      op('restore');
    } else {
      // une image se peint dans le carré unité, placé par la matrice courante
      const [x, y, l, h] = d === 'image' ? [0, 0, 595, 842] : d === 'logo' ? [13, 716, 96, 110] : d;
      op('save'); op('transform', [l, 0, 0, h, x, y]); op('paintImageXObject', ['img_p0_1', 2, 2]); op('restore');
    }
  }
  for (const c of cases) {
    const boite = [c.x0, c.y0, c.x1, c.y1];
    op('setFillRGBColor', ['#eeeeee']); op('constructPath', [OPS.fill, [null], boite]);
    op('setStrokeRGBColor', ['#000000']); op('constructPath', [OPS.stroke, [null], boite]);
    if (c.cochee) { op('setFillRGBColor', ['#000000']); op('constructPath', [OPS.fill, [null], [c.x0 + 2, c.y0 + 2, c.x1 - 3, c.y1 - 3]]); }
    else { op('setStrokeRGBColor', ['#eeeeee']); op('constructPath', [OPS.stroke, [null], [c.x0 + 2, c.y0 + 2, c.x1 - 2, c.y1 - 2]]); }
  }
  return { fnArray, argsArray };
}
function pdfSimule(pages, { dessinsEnPanne = false } = {}) {
  const appels = { texte: 0, dessins: 0 };
  const pdf = {
    numPages: pages.length,
    getPage: async (n) => ({
      view: VUE,
      getTextContent: async () => {
        appels.texte++;
        return {
          items: [
            { type: 'beginMarkedContent' },
            ...pages[n - 1].morceaux.map((i) => ({ str: i.str, dir: 'ltr', transform: [10, 0, 0, 10, i.x, i.y], width: i.largeur, height: 10, fontName: 'f1', hasEOL: false })),
            { str: '', dir: 'ltr', transform: [10, 0, 0, 10, 0, 0], width: 0, height: 0, fontName: 'f1', hasEOL: true },
          ],
        };
      },
      getOperatorList: async () => {
        appels.dessins++;
        if (dessinsEnPanne) throw new Error('liste d’opérateurs indisponible');
        return operateurs(pages[n - 1].cases ?? [], pages[n - 1].dessins);
      },
    }),
  };
  return { pdf, appels };
}
const lire = (pages, options) => lireTextePdf({ OPS }, pdfSimule(pages, options).pdf);
const TOUT_A_RELIRE = Object.fromEntries(Object.entries(CHAMPS_ATTENDUS).map(([cle, c]) => [cle, { ...c, aRelire: true }]));
const AVERTISSEMENT_NUMERISE = 'Ce PDF est peut-être un document numérisé : relisez chaque champ.';

test('lireTextePdf : morceaux et cases tirés du document ouvert ; null sans rien dessiner si non reconnu', async () => {
  const { pdf, appels } = pdfSimule(extrait());
  const l = await lireTextePdf({ OPS }, pdf);
  assert.deepEqual(l, lectureExtraitRne(extrait()));
  assert.deepEqual(l.champs, CHAMPS_ATTENDUS);
  assert.deepEqual(l.avertissements, []);
  assert.deepEqual(appels, { texte: 2, dessins: 2 });

  const suspendu = extrait();
  suspendu[1].cases = casesEtat({ suspendu: true });
  assert.deepEqual((await lire(suspendu)).avertissements, ['Attention : la case « SUSPENDU » est cochée sur l\'extrait.']);

  const autre = pdfSimule([{ morceaux: [m('FACTURE N° 2026-001 — Client : SOCIETE EXEMPLE — Total TTC', 50, 800, 300)] }]);
  assert.equal(await lireTextePdf({ OPS }, autre.pdf), null);
  assert.deepEqual(autre.appels, { texte: 1, dessins: 0 });
  const scan = pdfSimule([{ morceaux: [] }, { morceaux: [] }]);
  assert.equal(await lireTextePdf({ OPS }, scan.pdf), null);
  assert.equal(scan.appels.dessins, 0);
});

// ── Couche texte d'un scanner (page numérisée dont le scanner a reconnu le texte) ──────────────────────────────────
test('couche texte sans arabe (scanner qui n’a reconnu que les lettres latines) → null', () => {
  const doc = extrait();
  const LATIN = ['lJI', 'ujl', 'Jlc', 'aSj'];
  let k = 0;
  for (const p of doc) for (const i of p.morceaux) if (ARABE.test(i.str)) i.str = LATIN[k++ % LATIN.length];
  const r = reconnaitre(doc);
  assert.deepEqual(r.marqueurs, ['titre', 'domaine', 'lien de validation', 'identifiant unique', 'numéro extrait', 'cachet TUNTRUST']);
  assert.equal(r.estExtraitRne, false, 'l’extrait officiel est bilingue : sans marqueur arabe, ce n’est pas sa couche texte');
  assert.equal(lectureExtraitRne(doc), null);
});

test('origine du texte d’une page : natif, scanner (texte invisible ou caché sous l’image), incertain', () => {
  const origine = (dessins, vue = VUE) => origineDuTexte(OPS, operateurs([], dessins), vue);
  assert.equal(origine(['logo', 'texte']), 'natif');
  assert.equal(origine(['texte']), 'natif');
  assert.equal(origine([]), 'natif');
  // la page numérisée type : l'image de la page, et le texte reconnu en mode invisible
  assert.equal(origine(['image', 'texteInvisible']), 'scanner');
  assert.equal(origine(['texteInvisible', 'image']), 'scanner');
  assert.equal(origine(['texteInvisible']), 'scanner');
  // texte visible, mais peint AVANT l'image qui couvre la page : il est caché dessous
  assert.equal(origine(['texte', 'image']), 'scanner');
  // image de page découpée en bandes : c'est la surface cumulée qui compte
  const bandes = [0, 1, 2, 3].map((k) => [0, k * 210.5, 595, 210.5]);
  assert.equal(origine([...bandes, 'texteInvisible']), 'scanner');
  assert.equal(origine([...bandes.slice(0, 3), 'texte']), 'natif', 'trois quarts de la page : pas une image de page entière');
  // image de page entière SOUS un texte visible (fond, filigrane… ou scan) : on ne sait pas
  assert.equal(origine(['image', 'texte']), 'incertain');
  assert.equal(origine([...bandes, 'logo', 'texte']), 'incertain');
  // une image qui déborde de la page ne compte que pour sa partie dans la page ; page sans surface : natif
  assert.equal(origine([[500, 0, 2000, 842], 'texte']), 'natif');
  assert.equal(origine(['image', 'texte'], [0, 0, 0, 0]), 'natif');
  // le mode de rendu est rétabli par « restore » : le texte qui suit un passage invisible est visible
  assert.equal(origine(['texteInvisible', 'texte', 'texte']), 'natif');
  // masque d'image (page numérisée en noir et blanc), peint par-dessus un texte visible
  const masque = { fnArray: [OPS.showText, OPS.transform, OPS.paintImageMaskXObject], argsArray: [[[]], [595, 0, 0, 842, 0, 0], [{}]] };
  assert.equal(origineDuTexte(OPS, masque, VUE), 'scanner');
});

test('lireTextePdf : le texte d’une page numérisée est écarté ; origine incertaine → tous les champs à relire', async () => {
  // extrait numérisé dont le scanner a reconnu aussi l'arabe : les marqueurs y sont, mais ce n'est pas le texte du PDF
  const numerise = extrait();
  for (const p of numerise) p.dessins = ['image', 'texteInvisible'];
  const simule = pdfSimule(numerise);
  assert.equal(await lireTextePdf({ OPS }, simule.pdf), null);
  assert.deepEqual(simule.appels, { texte: 2, dessins: 1 }, 'sans la page 1, ce n’est plus un extrait : on s’arrête');
  const sousImage = extrait();
  for (const p of sousImage) p.dessins = ['texte', 'image'];
  assert.equal(await lire(sousImage), null);
  // une page numérisée ajoutée à la suite d'un extrait officiel : seul son texte est écarté
  const suivi = [...extrait(), { largeur: 595, hauteur: 842, morceaux: [m('COPIE NUMERISEE D’UN AUTRE DOCUMENT', 50, 700, 200), m('IDENTIFIANT UNIQUE', 50, 600, 100), m('7654321B', 160, 600, 50)], cases: [], dessins: ['image', 'texteInvisible'] }];
  const l = await lire(suivi);
  assert.deepEqual(l.champs, CHAMPS_ATTENDUS);
  assert.deepEqual(l.avertissements, []);
  assert.ok(!l.lignes.some((t) => /COPIE NUMERISEE|7654321B/.test(t)));
  // image de page entière sous un texte visible : lu, mais chaque champ est à relire
  const incertain = extrait();
  incertain[0].dessins = ['image', 'texte'];
  const i = await lire(incertain);
  assert.deepEqual(i.champs, TOUT_A_RELIRE);
  assert.deepEqual(i.avertissements, [AVERTISSEMENT_NUMERISE]);
  // dessins illisibles : l'origine du texte n'est pas établie (à relire), l'état du registre n'est pas lu
  const panne = await lire(extrait(), { dessinsEnPanne: true });
  assert.deepEqual(panne.champs, TOUT_A_RELIRE);
  assert.deepEqual(panne.avertissements, [AVERTISSEMENT_NUMERISE, "État du registre non lu : vérifiez sur l'extrait que la case « ACTIF » est cochée."]);
  // la même marque, posée par l'appelant sur une page (fonction pure)
  const douteux = extrait();
  douteux[1].texteDouteux = true;
  assert.deepEqual(lectureExtraitRne(douteux).champs, TOUT_A_RELIRE);
  assert.deepEqual(lectureExtraitRne(douteux).avertissements, [AVERTISSEMENT_NUMERISE]);
});

// ── Modèle d'extrait inconnu ───────────────────────────────────────────────────────────────────────────────────────
test('modèle d’extrait autre que « société » : avertissement, et tous les champs à relire', () => {
  for (const [titre, type, avertissement] of [
    ['EXTRAIT RNE (PERSONNE PHYSIQUE)', 'PERSONNE PHYSIQUE', 'Extrait de type « PERSONNE PHYSIQUE » : seul le modèle « société » est connu, relisez chaque champ.'],
    ['EXTRAIT RNE (ASSOCIATION)', 'ASSOCIATION', 'Extrait de type « ASSOCIATION » : seul le modèle « société » est connu, relisez chaque champ.'],
    ['EXTRAIT RNE', '', "Type d'extrait non lu dans son titre : seul le modèle « société » est connu, relisez chaque champ."],
  ]) {
    const doc = extrait();
    morceau(doc, 1, 'EXTRAIT RNE (SOCIÉTÉ)').str = titre;
    const r = reconnaitre(doc);
    assert.equal(r.estExtraitRne, true, titre);
    assert.equal(r.type, type);
    const l = lectureExtraitRne(doc);
    assert.deepEqual(l.champs, TOUT_A_RELIRE, titre);
    assert.deepEqual(l.avertissements, [avertissement]);
  }
  // titre absent : l'extrait reste reconnu par le nom arabe du registre, mais son modèle n'est pas connu
  const sansTitre = retirer(extrait(), (i) => i.str === 'EXTRAIT RNE (SOCIÉTÉ)');
  assert.deepEqual(lectureExtraitRne(sansTitre).champs, TOUT_A_RELIRE);
});

// ── Fichier fabriqué pour être énorme : plafonds, et aucun calcul quadratique ──────────────────────────────────────
// Ancien regroupement (chaque morceau comparé à toutes les lignes) : la référence du nouveau.
function regrouperReference(morceaux, tolerance = 2.6) {
  const tri = morceaux.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lignes = [];
  for (const i of tri) {
    let meilleure = null;
    for (const L of lignes) {
      const ecart = Math.abs(L.y - i.y);
      if (ecart <= tolerance && (!meilleure || ecart < Math.abs(meilleure.y - i.y))) meilleure = L;
    }
    if (!meilleure) { meilleure = { y: i.y, items: [] }; lignes.push(meilleure); }
    meilleure.items.push(i);
  }
  for (const L of lignes) L.items.sort((a, b) => a.x - b.x);
  return lignes.sort((a, b) => b.y - a.y);
}

test('regroupement en lignes : même résultat que la comparaison à toutes les lignes, sans son coût', () => {
  let graine = 7;
  const hasard = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  for (let essai = 0; essai < 200; essai++) {
    // y resserrés : beaucoup de morceaux tombent à la limite de la tolérance
    const morceaux = Array.from({ length: 80 }, (_, k) => m(`m${k}`, Math.round(hasard() * 500), Math.round(hasard() * 400) / 10, 10));
    assert.deepEqual(regrouperEnLignes(morceaux), regrouperReference(morceaux));
  }
  for (const p of extrait()) assert.deepEqual(regrouperEnLignes(p.morceaux), regrouperReference(p.morceaux));
  // 100 000 morceaux sur autant de lignes : une dizaine de secondes avec l'ancien regroupement
  const debut = performance.now();
  const lignes = regrouperEnLignes(Array.from({ length: 100_000 }, (_, k) => m('x', 10, k * 3, 5)));
  assert.equal(lignes.length, 100_000);
  assert.ok(performance.now() - debut < 2000, 'regroupement linéaire');
});

test('document hors gabarit (trop de morceaux, de pages, de libellés) → null', async () => {
  const pageVide = () => ({ largeur: 595, hauteur: 842, morceaux: [], cases: [] });
  // une page de plus de MORCEAUX_MAX morceaux
  const gros = extrait();
  for (let k = 0; k <= MORCEAUX_MAX; k++) gros[1].morceaux.push(m('x', 10 + (k % 100) * 5, 100 + Math.floor(k / 100), 3));
  assert.equal(reconnaitre(gros).estExtraitRne, false);
  assert.equal(lectureExtraitRne(gros), null);
  const simule = pdfSimule([gros[1], gros[0]]);
  assert.equal(await lireTextePdf({ OPS }, simule.pdf), null);
  assert.deepEqual(simule.appels, { texte: 1, dessins: 0 }, 'la lecture s’arrête à la page trop chargée');
  // juste sous le plafond : lu normalement
  const limite = extrait();
  while (limite[1].morceaux.length < MORCEAUX_MAX) limite[1].morceaux.push(m(' ', 10, 100, 3));
  assert.deepEqual(lectureExtraitRne(limite).champs, CHAMPS_ATTENDUS);
  // plus de PAGES_MAX pages : la fonction pure refuse ; lireTextePdf ne lit que les PAGES_MAX premières
  const long = [...extrait(), ...Array.from({ length: PAGES_MAX - 1 }, pageVide)];
  assert.equal(long.length, PAGES_MAX + 1);
  assert.equal(lectureExtraitRne(long), null);
  const simuleLong = pdfSimule(long);
  assert.deepEqual((await lireTextePdf({ OPS }, simuleLong.pdf)).champs, CHAMPS_ATTENDUS);
  assert.equal(simuleLong.appels.texte, PAGES_MAX);
  // des centaines de libellés : ce n'est pas un extrait
  const libelles = extrait();
  for (let k = 0; k < 250; k++) libelles[1].morceaux.push(m('Enseigne:', 20.2, 500 - k, 41.3));
  assert.equal(lectureExtraitRne(libelles), null);
});

test('page hors gabarit par son nombre de caractères (un seul morceau démesuré suffit) → null, sans délai', async () => {
  const caracteres = (p) => p.morceaux.reduce((n, i) => n + i.str.length, 0);
  assert.equal(CARACTERES_MAX, 20_000);
  // UN morceau de 200 000 caractères, collé devant le lien de vérification : le plafond de morceaux ne le voit pas
  const enorme = extrait();
  enorme[1].morceaux.push(m(`${':'.repeat(200_000)}x registre-entreprises.tn/rne-public`, 20, 300, 500));
  assert.ok(enorme[1].morceaux.length < MORCEAUX_MAX);
  let debut = performance.now();
  assert.equal(reconnaitre(enorme).estExtraitRne, false);
  assert.equal(lectureExtraitRne(enorme), null);
  const simule = pdfSimule([enorme[1], enorme[0]]);
  assert.equal(await lireTextePdf({ OPS }, simule.pdf), null);
  assert.deepEqual(simule.appels, { texte: 1, dessins: 0 }, 'la lecture s’arrête à la page trop chargée');
  assert.ok(performance.now() - debut < 1000, 'un morceau de 200 000 caractères : refusé sans être analysé');
  // l'adresse du siège suivie de 100 000 virgules : même refus
  const virgules = `8 Rue des Jasmins 5000 Monastir${', '.repeat(100_000)}1`;
  const adresse = retirer(extrait(), (i, page) => page === 1 && Math.abs(i.y - 438.9) < 0.5 && i.x > 130);
  adresse[0].morceaux.push(m(virgules, 134, 438.9, 100));
  debut = performance.now();
  assert.equal(lectureExtraitRne(adresse), null);
  assert.equal(await lire(adresse), null);
  assert.ok(performance.now() - debut < 1000);
  // juste au plafond : lu normalement ; un caractère de plus : null
  const limite = extrait();
  limite[1].morceaux.push(m('x'.repeat(CARACTERES_MAX - caracteres(limite[1])), 300, 150, 100));
  assert.equal(caracteres(limite[1]), CARACTERES_MAX);
  assert.deepEqual(lectureExtraitRne(limite).champs, CHAMPS_ATTENDUS);
  assert.deepEqual((await lire(limite)).champs, CHAMPS_ATTENDUS);
  limite[1].morceaux.push(m(' ', 10, 100, 3));
  assert.equal(lectureExtraitRne(limite), null);
  assert.equal(await lire(limite), null);
  // pire cas SOUS le plafond : sur 10 pages, des milliers de deux-points collés devant un lien de vérification
  const charge = extrait();
  while (charge.length < PAGES_MAX) charge.push({ largeur: 595, hauteur: 842, morceaux: [], cases: [] });
  for (const p of charge) {
    const reste = CARACTERES_MAX - caracteres(p) - 40;
    p.morceaux.push(m(':'.repeat(reste), 20, 300, 100), m('x registre-entreprises.tn/rne-public', 120.5, 300, 100));
  }
  debut = performance.now();
  assert.deepEqual(lectureExtraitRne(charge).champs, CHAMPS_ATTENDUS);
  assert.ok(performance.now() - debut < 500, 'aucune expression ancrée sur la fin ne relit la suite de deux-points');
});

test('rognage en boucle : même résultat qu’une expression ancrée sur la fin, sans son coût', () => {
  const SEPARATEUR = /[\s,;:/-]/;
  assert.equal(rognerBouts(' - 8 Rue des Jasmins, ;:/', SEPARATEUR), '8 Rue des Jasmins');
  assert.equal(rognerBouts('8 Rue, des - Jasmins', SEPARATEUR), '8 Rue, des - Jasmins', 'rien n’est retiré au milieu');
  assert.equal(rognerBouts(' : lien :: ', /[:\s]/, false), ' : lien', 'la fin seulement');
  assert.equal(rognerBouts(',,,', /,/), '');
  assert.equal(rognerBouts(',,,', /,/, false), '');
  assert.equal(rognerBouts('', /,/), '');
  for (const s of ['', ':', ' a : b :\t:', '::a', 'a', ' \n ', 'lien : ']) assert.equal(rognerBouts(s, /[:\s]/, false), s.replace(/[:\s]+$/, ''), JSON.stringify(s));
  // 100 000 séparateurs au MILIEU du texte : une quinzaine de secondes avec l'expression ancrée sur la fin
  const virgules = `8 Rue des Jasmins 5000 Monastir${', '.repeat(100_000)}1`;
  const debut = performance.now();
  assert.equal(rognerBouts(virgules, SEPARATEUR), virgules);
  assert.deepEqual(decouperAdresse(virgules), { rue: virgules, codePostal: '', ville: '', gouvernorat: '' });
  assert.ok(performance.now() - debut < 1000);
});

test('cases à cocher : page saturée de dessins → aucune case, sans calcul quadratique', () => {
  const carres = (n) => {
    const fnArray = [];
    const argsArray = [];
    for (let k = 0; k < n; k++) {
      const x = 10 + (k % 50) * 11;
      const y = 10 + Math.floor(k / 50) * 11;
      fnArray.push(OPS.constructPath);
      argsArray.push([OPS.stroke, [null], [x, y, x + 10, y + 10]]);
    }
    return { fnArray, argsArray };
  };
  assert.equal(lireCasesACocher(OPS, carres(150)).length, 150);
  assert.deepEqual(lireCasesACocher(OPS, carres(201)), [], 'plus de 200 cases : ce n’est pas une page d’extrait');
  // 50 000 petits carrés : 12 secondes quand chaque case relisait toute la liste ; elle ne regarde que ses voisins
  let debut = performance.now();
  assert.deepEqual(lireCasesACocher(OPS, carres(50_000)), []);
  assert.ok(performance.now() - debut < 1000);
  // 50 000 dessins qui ne sont pas des cases (grands cadres) n'empêchent pas de lire celles de l'extrait
  const cadres = { fnArray: [], argsArray: [] };
  for (let k = 0; k < 50_000; k++) { cadres.fnArray.push(OPS.constructPath); cadres.argsArray.push([OPS.stroke, [null], [10, 10, 500, 100 + (k % 700)]]); }
  const etat = operateurs(extrait()[1].cases);
  debut = performance.now();
  assert.deepEqual(lireCasesACocher(OPS, { fnArray: [...cadres.fnArray, ...etat.fnArray], argsArray: [...cadres.argsArray, ...etat.argsArray] }), casesEtat());
  assert.ok(performance.now() - debut < 1000);
});
