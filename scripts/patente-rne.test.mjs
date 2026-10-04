// Lot 3, étape 7 — couche « pdf » de la lecture de la patente : extrait RNE lu PAR POSITIONS, sans IA.
//   node --test scripts/patente-rne.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
// Données SYNTHÉTIQUES seulement : une société fictive posée aux positions (en points) de la mise en page d'un
// extrait. Aucune valeur d'un document réel ne doit entrer ici.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyserExtraitRne, joindre, lectureExtraitRne, reconnaitre, reconstruireArabe, regrouperEnLignes,
  LIEN_VERIFICATION_RNE, NOTE_MATRICULE_RACINE,
} from '../src/components/admin/patente/rne/analyseur.ts';
import { decouperAdresse, formeJuridiqueVersCode, normaliser, qualiteVersFrancais } from '../src/components/admin/patente/rne/tables.ts';
import { lireCasesACocher } from '../src/components/admin/patente/rne/dessins.ts';
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

test('dénomination écrite en arabe seulement : jamais proposée', () => {
  const doc = extrait();
  morceau(doc, 1, DENOMINATION).str = 'شركة المثال';
  const l = lectureExtraitRne(doc);
  assert.equal(l.champs.raisonSociale, undefined);
  assert.ok(l.lignes.every((t) => !ARABE.test(t)));
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
  // une ligne qui n'est pas alignée sur le début de la valeur n'est pas une suite
  const decalee = longue();
  decalee[0].morceaux.push(m('5000 Monastir Monastir', 180, 426.9, 95));
  assert.equal(analyserExtraitRne(decalee).valeurs.adresseSiege, '12 Avenue des Exemples, Résidence les Oliviers, Bloc B');
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
    ['Forme inconnue du registre', 'AUTRE'],
  ]) assert.equal(formeJuridiqueVersCode(libelle), code, libelle);
  for (const [libelle, code] of [
    ['شركة الشخص الواحد ذات المسؤولية المحدودة', 'SUARL'],
    ['شركة ذات المسؤولية المحدودة', 'SARL'],
    ['شركة خفية الاسم', 'SA'],
    ['شركة المفاوضة', 'SNC'],
    ['جمعية', 'ASSOCIATION'],
  ]) assert.equal(formeJuridiqueVersCode('', libelle), code, libelle);
  assert.equal(formeJuridiqueVersCode('', ''), '');
  assert.equal(formeJuridiqueVersCode(null, undefined), '');
});

test('forme juridique : libellé français absent → libellé arabe ; libellé inconnu → AUTRE avec le libellé en note', () => {
  const arabeSeul = retirer(extrait(), (i) => i.str === FORME);
  assert.equal(analyserExtraitRne(arabeSeul).formeJuridiqueArabe, 'شركة ذات المسؤولية المحدودة');
  assert.deepEqual(lectureExtraitRne(arabeSeul).champs.formeJuridique, { valeur: 'SARL', source: 'pdf', aRelire: false });
  const inconnue = retirer(extrait(), (i) => Math.abs(i.y - 390.1) < 0.5);
  morceau(inconnue, 1, FORME).str = 'Fondation';
  const c = lectureExtraitRne(inconnue).champs.formeJuridique;
  assert.equal(c.valeur, 'AUTRE');
  assert.match(c.note, /Fondation/);
  const aucune = retirer(extrait(), (i) => i.str === FORME || Math.abs(i.y - 390.1) < 0.5);
  const l = lectureExtraitRne(aucune);
  assert.equal(l.champs.formeJuridique, undefined);
  assert.ok(l.avertissements.some((t) => /Forme juridique introuvable/.test(t)));
});

test('table des qualités : arabe → français, jamais d’arabe en sortie', () => {
  assert.equal(qualiteVersFrancais('وكيل'), 'Gérant');
  assert.equal(qualiteVersFrancais('GERANT'), 'Gérant');
  assert.equal(qualiteVersFrancais('رئيس مدير عام'), 'Président directeur général');
  assert.equal(qualiteVersFrancais('مدير عام'), 'Directeur général');
  assert.equal(qualiteVersFrancais('رئيس مجلس الإدارة'), "Président du conseil d'administration");
  assert.equal(qualiteVersFrancais('Gérante statutaire'), 'Gérant');
  assert.equal(qualiteVersFrancais('Mandataire'), 'Mandataire');
  assert.equal(qualiteVersFrancais('صفة غير معروفة'), '');
  assert.equal(qualiteVersFrancais(''), '');
  assert.equal(normaliser('  Dénomination   sociale: '), 'DENOMINATION SOCIALE:');
  assert.equal(normaliser('L’EXTRAIT'), "L'EXTRAIT");
});

test('représentant : nom proposé seulement en lettres latines ; plusieurs dirigeants → le représentant légal', () => {
  assert.deepEqual(analyserExtraitRne(extrait()).representants, [
    { qualiteLue: 'وكيل', nationaliteLue: 'تونسية', nomLu: 'فلان الفلاني', qualite: 'Gérant', nationalite: 'Tunisienne', nom: '' },
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
  const sansCodePostal = retirer(extrait(), (i, page) => page === 1 && Math.abs(i.y - 438.9) < 0.5 && i.x > 130);
  sansCodePostal[0].morceaux.push(m('Zone industrielle Exemple', 134, 438.9, 120));
  const l = lectureExtraitRne(sansCodePostal);
  assert.equal(l.champs.adresse.valeur, 'Zone industrielle Exemple');
  assert.equal(l.champs.ville, undefined);
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
  // trois marqueurs, mais ni le titre ni le domaine du registre
  const sansFort = page([m('IDENTIFIANT UNIQUE', 50, 800, 100), m(IDENTIFIANT, 160, 800, 50), m('NUMÉRO EXTRAIT', 50, 780, 80), m(NUMERO, 140, 780, 70), m('Cachet TUNTRUST', 50, 760, 90)]);
  assert.equal(reconnaitre(sansFort).marqueurs.length, 3);
  assert.equal(lectureExtraitRne(sansFort), null);
  // PDF scanné : aucune couche texte, ou quelques caractères perdus
  assert.equal(lectureExtraitRne(page([])), null);
  assert.equal(lectureExtraitRne([]), null);
  assert.equal(lectureExtraitRne(page([m('EXTRAIT RNE', 50, 800, 60)])), null);
  assert.equal(reconnaitre(page([])).nbCaracteres, 0);
});

// ── Point d'entrée : document pdf.js simulé ────────────────────────────────────────────────────────────────────────
const OPS = { save: 10, restore: 11, transform: 12, stroke: 20, fill: 22, setStrokeRGBColor: 58, setFillRGBColor: 59, constructPath: 91 };
function operateurs(cases) {
  const fnArray = [];
  const argsArray = [];
  const op = (nom, args) => { fnArray.push(OPS[nom]); argsArray.push(args); };
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
      view: [0, 0, 595, 842],
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
        return operateurs(pages[n - 1].cases ?? []);
      },
    }),
  };
  return { pdf, appels };
}

test('lireTextePdf : morceaux et cases tirés du document ouvert ; null sans rien dessiner si non reconnu', async () => {
  const { pdf, appels } = pdfSimule(extrait());
  const l = await lireTextePdf({ OPS }, pdf);
  assert.deepEqual(l, lectureExtraitRne(extrait()));
  assert.deepEqual(l.champs, CHAMPS_ATTENDUS);
  assert.deepEqual(l.avertissements, []);
  assert.deepEqual(appels, { texte: 2, dessins: 2 });

  const suspendu = extrait();
  suspendu[1].cases = casesEtat({ suspendu: true });
  assert.deepEqual((await lireTextePdf({ OPS }, pdfSimule(suspendu).pdf)).avertissements, ['Attention : la case « SUSPENDU » est cochée sur l\'extrait.']);

  const panne = await lireTextePdf({ OPS }, pdfSimule(extrait(), { dessinsEnPanne: true }).pdf);
  assert.deepEqual(panne.champs, CHAMPS_ATTENDUS);
  assert.match(panne.avertissements[0], /État du registre non lu/);

  const autre = pdfSimule([{ morceaux: [m('FACTURE N° 2026-001 — Client : SOCIETE EXEMPLE — Total TTC', 50, 800, 300)] }]);
  assert.equal(await lireTextePdf({ OPS }, autre.pdf), null);
  assert.deepEqual(autre.appels, { texte: 1, dessins: 0 });
  const scan = pdfSimule([{ morceaux: [] }, { morceaux: [] }]);
  assert.equal(await lireTextePdf({ OPS }, scan.pdf), null);
  assert.equal(scan.appels.dessins, 0);
});
