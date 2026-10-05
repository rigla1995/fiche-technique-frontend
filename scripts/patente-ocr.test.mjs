// Lot 3, étape 7 — couche « ocr » de la lecture de la patente : fonctions pures (pixels, extraction, matricule, cycle de
// vie du worker) et chaîne.
//   node --test scripts/patente-ocr.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
// Données SYNTHÉTIQUES seulement : mots et cadres fabriqués à la main, société fictive, matricule « 1234567R/A/M/000 »
// (R est la lettre-clé que donnent les chiffres 1234567). Aucune valeur d'un document réel ne doit entrer ici.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MATRICULE_LU, texteChamp } from '../src/components/admin/patente/types.ts';
import { PHOTO_COUCHEE, lireDocument } from '../src/components/admin/patente/ocr/chaine.ts';
import {
  cadreBande, construireRangees, decouperAdresse, estArabe, estPointilles, extraireCarteAutoEntrepreneur, extraireCarteFiscale,
  groupePrincipal, ligneLue, motsDePage, motsValeur, nettoyerValeur, photoCouchee, reconnaitreDocument, texteValeur,
} from '../src/components/admin/patente/ocr/extraction.ts';
import {
  ACCORD_MIN, ALPHABET_CLE, CHIFFRES, CODES_CATEGORIE, LECTURES_MIN, cleAttendue, cleCoherente, corrigerChiffres, matriculeLu,
  remettreALEndroit, voterMatricule,
} from '../src/components/admin/patente/ocr/matricule.ts';
import {
  binariser, couperEnJetons, decouperGlyphes, etirer, garderGlyphes, gris, inverser, nettoyerBande, retirerFilets, sauvola,
  seuilOtsu, versRgba,
} from '../src/components/admin/patente/ocr/pixels.ts';
import { DELAI_LECTURE, DelaiDepasse, avecTravailleur, noterWorker } from '../src/components/admin/patente/ocr/travailleur.ts';

// ---------- fabriques ----------
const mot = (t, x0, y0, x1, y1, c = 95, li) => (li === undefined ? { t, c, b: { x0, y0, x1, y1 } } : { t, c, b: { x0, y0, x1, y1 }, li });
const ARABE = String.fromCodePoint(0x0627, 0x0644, 0x0627, 0x0633, 0x0645); // un vrai mot en écriture arabe
// Caractères typographiques, écrits par leur code pour ne dépendre d'aucun éditeur.
const APOSTROPHE = String.fromCodePoint(0x2019), GUILLEMET_OUVRANT = String.fromCodePoint(0xAB), GUILLEMET_FERMANT = String.fromCodePoint(0xBB);
const O_E = String.fromCodePoint(0x152);
const image = (width, height, valeur) => ({ data: new Uint8ClampedArray(width * height).fill(valeur), width, height });
const peindre = (img, x0, y0, x1, y1, valeur) => {
  for (let y = Math.max(0, y0); y <= Math.min(img.height - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(img.width - 1, x1); x++) img.data[y * img.width + x] = valeur;
  }
};

// Matricules fictifs. Lettre-clé de 1234567 : 7·1 + 6·2 + 5·3 + 4·4 + 3·5 + 2·6 + 1·7 = 84 ; 84 modulo 23 = 15 ; la
// lettre de rang 15 est R.
const R = '1234567R/A/M/000'; // lettre-clé cohérente avec les 7 chiffres
const F = '1234567F/A/M/000'; // lettre-clé incohérente (le filet du tableau coupe la lettre)
const R6 = '1234567R/A/M/006'; // lettre-clé cohérente, autre numéro d'établissement

// Carte d'identification fiscale fictive, sur une page de 1600 × 2000 px. La rangée du matricule est passée à part.
const MATRICULE_SANS_CLE = [mot('006', 270, 670, 330, 694, 55), mot('M', 585, 670, 609, 694), mot('A', 790, 670, 814, 694, 46), mot('1234567', 980, 670, 1084, 694, 54)];
const rangeeMatricule = (identifiant) => [mot('000', 270, 670, 330, 694), mot('M', 585, 670, 609, 694), mot('A', 790, 670, 814, 694), mot(identifiant, 980, 670, 1100, 694)];
const MATRICULE_JUSTE = rangeeMatricule('1234567R');
const carteFiscale = (matricule = MATRICULE_SANS_CLE) => [
  mot('République', 180, 96, 326, 126), mot('Tunisienne', 334, 98, 472, 122),
  mot('Carte', 300, 200, 420, 232), mot("d'Identification", 440, 200, 760, 232), mot('Fiscale', 780, 200, 920, 232),
  mot('RÉGIME', 600, 400, 720, 428), mot('RÉEL', 730, 400, 800, 428),
  mot('N°', 200, 600, 228, 620), mot('établissement', 236, 600, 380, 620), mot('secondaire', 388, 600, 500, 620),
  mot('Code', 560, 600, 612, 620), mot('Catégorie', 620, 600, 722, 620), mot('Code', 820, 600, 872, 620), mot('TVA', 880, 600, 928, 620),
  mot('Matricule', 1020, 600, 1124, 620), mot('Fiscal', 1132, 600, 1194, 620),
  ...matricule,
  mot('Nom', 150, 745, 204, 765), mot('et', 213, 747, 231, 765), mot('prénom', 240, 745, 320, 771), mot('………………', 340, 760, 900, 765, 20),
  // Une rangée, trois lignes pour tesseract : libellé (14), valeur (15), libellé arabe lu en lettres latines (16).
  mot('ou', 150, 792, 176, 808, 96, 14), mot('raison', 184, 786, 248, 808, 96, 14), mot('sociale', 256, 786, 330, 808, 92, 14), mot('……………', 370, 805, 490, 808, 29, 14),
  mot('—SOCIETE', 553, 788, 700, 810, 79, 15), mot('EXEMPLE', 716, 788, 860, 811, 62, 15), mot('………—', 900, 806, 950, 809, 3, 15),
  mot('geleaYl', 1000, 782, 1220, 814, 0, 16), mot(ARABE, 1300, 782, 1500, 814, 40, 16),
  mot('Adresse', 150, 860, 236, 882, 61), mot('=', 1100, 879, 1150, 882, 0),
  mot('‘12', 284, 880, 326, 909, 89), mot('RUE', 346, 880, 400, 909), mot('DES', 410, 880, 460, 909), mot('JASMINS,', 470, 880, 600, 912),
  mot('Hammam', 612, 880, 720, 909), mot('Sousse,', 730, 880, 820, 912), mot('Hammam', 832, 880, 940, 909), mot('Sousse,', 950, 880, 1040, 912),
  mot('Sousse,', 1052, 880, 1142, 912), mot('4011', 1154, 876, 1206, 912, 41),
  mot('Activité', 150, 971, 236, 993), mot('principal', 243, 971, 336, 1000), mot('………', 348, 990, 366, 993, 34),
  mot('Restauration.de', 383, 969, 620, 993, 64), mot('type', 630, 961, 690, 1004, 30), mot('rapide', 700, 961, 780, 1004, 30),
  mot('(01/02/2026)...', 790, 970, 1010, 999, 34),
];
// Patente d'une personne physique : la rangée « raison sociale » n'a pas de valeur. Le libellé arabe lu en lettres
// latines (« geleaYl », confiance 0) reste À SA PLACE, à 62 % de la largeur ; le nom est sur la rangée « Nom et prénom ».
const NOM_PHYSIQUE = [mot('PRENOM', 553, 745, 690, 767), mot('EXEMPLE', 704, 745, 850, 767)];
const cartePhysique = (ajouts = NOM_PHYSIQUE) => carteFiscale().filter((m) => !['—SOCIETE', 'EXEMPLE'].includes(m.t)).concat(ajouts);

// Carte auto-entrepreneur fictive, sur une page de 1600 × 2000 px : colonne latine à gauche, arabe à droite.
const carteAutoEntrepreneur = ({ identifiant = '12345G7R', cite = 'Exemple,', nom = 'EXEMPLE' } = {}) => [
  mot('Carte', 1000, 300, 1100, 330), mot('AutoEntrepreneur', 1110, 300, 1400, 334),
  mot('Prénom:', 90, 500, 250, 534), mot('PRENOM', 280, 500, 460, 530), mot('ans0', 1200, 505, 1300, 530, 24),
  mot('Nom:', 90, 600, 190, 632), mot(nom, 220, 598, 400, 630),
  mot('Identifiant', 90, 700, 290, 732), mot('Unique:', 300, 700, 440, 738), mot(identifiant, 720, 694, 880, 740, 90), mot('DIIGIl', 1100, 700, 1200, 738, 23),
  mot('Activité:', 90, 800, 240, 834), mot('Commerce', 270, 798, 440, 832), mot('général', 452, 800, 600, 838),
  mot('Adresse', 90, 900, 250, 932), mot('Activité:', 260, 900, 410, 934), mot('Sfax', 440, 900, 520, 930), mot('Sfax', 532, 900, 612, 930),
  mot('dilyieili', 1000, 895, 1200, 935, 16),
  mot('Cité', 442, 960, 520, 990), mot(cite, 532, 960, 700, 994, 38),
  mot('Bloc', 442, 1020, 520, 1050), mot('2,', 532, 1020, 570, 1054),
  mot('Appartement', 442, 1080, 700, 1114), mot('5,', 712, 1080, 750, 1114),
  mot('Route', 442, 1140, 560, 1170), mot('de', 572, 1140, 612, 1170), mot('Gabès,', 624, 1140, 760, 1176), mot('Sfax', 772, 1140, 860, 1170),
  mot('Date', 90, 1250, 180, 1282), mot('Edition:', 192, 1250, 330, 1282), mot('01/02/2026', 680, 1244, 880, 1290),
];

// Photo couchée d'un quart de tour : chaque cadre tourne avec la page (hauteur d'origine `hauteur`), les mots restent lus.
const coucher = (mots, hauteur) => mots.map((m) => ({ ...m, b: { x0: hauteur - m.b.y1, y0: m.b.x0, x1: hauteur - m.b.y0, y1: m.b.x1 } }));

// Une rangée faite d'un libellé et de mots posés à la suite (22 px de haut, 20 px par caractère, 20 px entre deux mots).
const rangeeDe = (...textes) => {
  let x = 0;
  const mots = textes.map((t) => {
    const m = mot(t, x, 0, x + 20 * t.length, 22);
    x += 20 * t.length + 20;
    return m;
  });
  return { rangee: construireRangees(mots).rangees[0], apresLibelle: mots[0].b.x1 };
};
const valeurDe = (...textes) => {
  const { rangee, apresLibelle } = rangeeDe('Libellé', ...textes);
  return texteValeur(rangee, apresLibelle, 5000);
};

// Bande du matricule fictive : un filet horizontal, treize « glyphes » (pavés noirs) imprimés à cheval dessus, en quatre
// valeurs (3 + 1 + 1 + 8), et un pavé d'une autre rangée, au-dessus du filet, qui ne doit pas être gardé.
function bandeFictive(width, height, facteur = 1, filetVertical = false) {
  const img = image(width, height, 255);
  const e = (v) => Math.round(v * facteur);
  const filet = Math.round(0.62 * height);
  peindre(img, 0, filet, width - 1, filet + Math.max(2, e(2)) - 1, 0);
  if (filetVertical) peindre(img, 5, 0, 6, height - 1, 0);
  const departs = [80, 92, 104, 400, 640, ...Array.from({ length: 8 }, (_, i) => 850 + 12 * i)];
  for (const x of departs) peindre(img, e(x), filet - e(11), e(x) + e(8) - 1, filet - e(11) + e(16) - 1, 0);
  peindre(img, e(300), e(4), e(340) - 1, e(14) - 1, 0);
  return { img, filet };
}

// ---------- pixels ----------
test('gris : luminance, canal max, canal rouge ; la transparence est aplatie sur fond blanc', () => {
  const rgba = { data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0, 0, 128]), width: 4, height: 1 };
  assert.deepEqual([...gris(rgba).data], [76, 29, 255, 127]);
  assert.deepEqual([...gris(rgba, 'max').data], [255, 255, 255, 127]); // l'encre colorée (tampon bleu) devient claire
  assert.deepEqual([...gris(rgba, 'rouge').data], [255, 0, 255, 127]);
  assert.deepEqual([...inverser(gris(rgba, 'rouge')).data], [0, 255, 0, 128]);
  assert.deepEqual([...versRgba({ data: new Uint8Array([0, 200]), width: 2, height: 1 })], [0, 0, 0, 255, 200, 200, 200, 255]);
});

test('étirement du contraste : centiles 1 % et 99 %, un point aberrant ne compte pas', () => {
  const img = image(20, 10, 100);
  peindre(img, 0, 5, 19, 9, 150);
  img.data[0] = 0; // 1 pixel sur 200 : sous le centile 1 %
  const etire = etirer(img);
  assert.equal(etire.data[1], 0);
  assert.equal(etire.data[199], 255);
  assert.equal(etire.data[0], 0);
  assert.equal(etire.width, 20);
  // Image plate : pas de division par zéro.
  assert.deepEqual([...etirer(image(3, 1, 90)).data], [0, 0, 0]);
});

test("Otsu : le seuil tombe entre l'encre et le papier", () => {
  const img = image(10, 10, 220);
  peindre(img, 0, 0, 9, 5, 30);
  const seuil = seuilOtsu(img);
  assert.ok(seuil >= 30 && seuil < 220, `seuil ${seuil}`);
  const bin = binariser(img, seuil);
  assert.equal(bin.data[0], 0);
  assert.equal(bin.data[99], 255);
  assert.deepEqual([...new Set(bin.data)].sort(), [0, 255]);
});

test("Sauvola : tient face à une ombre, là où un seuil global échoue", () => {
  // Moitié gauche dans l'ombre (papier 120, encre 30), moitié droite éclairée (papier 230, encre 140).
  const img = image(60, 20, 230);
  peindre(img, 0, 0, 29, 19, 120);
  peindre(img, 10, 9, 11, 10, 30);
  peindre(img, 48, 9, 49, 10, 140);
  const p = (b, x, y) => b.data[y * 60 + x];
  const local = sauvola(img, 9, 0.2);
  assert.deepEqual([p(local, 10, 9), p(local, 48, 9), p(local, 3, 3), p(local, 55, 3)], [0, 0, 255, 255]);
  const global = binariser(img, seuilOtsu(img));
  assert.equal(p(global, 3, 3), 0, "seuil global : le papier dans l'ombre passe au noir");
});

test('filets retirés, glyphes à cheval sur le filet gardés, coupe en quatre valeurs', () => {
  const { img, filet } = bandeFictive(1100, 120, 1, true);
  const sansFilets = retirerFilets(img);
  assert.ok(Math.abs(sansFilets.filetBas - (filet + 0.5)) <= 1, `filet ${sansFilets.filetBas}`);
  assert.equal(sansFilets.image.data[filet * 1100 + 500], 255, 'le filet horizontal est effacé');
  assert.equal(sansFilets.image.data[50 * 1100 + 5], 255, 'le filet vertical est effacé');
  assert.equal(sansFilets.image.data[filet * 1100 + 82], 0, 'le jambage qui traverse le filet est gardé');
  const { glyphes, hauteurGlyphe, image: propre } = garderGlyphes(sansFilets.image, sansFilets.filetBas, sansFilets.epaisseur + 2);
  assert.equal(glyphes.length, 13, "le pavé d'une autre rangée, qui ne touche pas le filet, est écarté");
  assert.equal(hauteurGlyphe, 16);
  assert.equal(propre.data[8 * 1100 + 320], 255);
  const jetons = couperEnJetons(glyphes, 4);
  assert.deepEqual(jetons.map((j) => j.length), [3, 1, 1, 8]);
  const decoupe = decouperGlyphes(propre, jetons[0], 25);
  assert.deepEqual([decoupe.width, decoupe.height], [104 + 8 - 80 + 50, 16 + 50]);
  assert.equal(decoupe.data[0], 255, 'marge blanche');
  assert.equal(decoupe.data[25 * decoupe.width + 25], 0);
  // Sans filet connu, tous les « caractères » sont gardés.
  assert.equal(garderGlyphes(sansFilets.image).glyphes.length, 13);
  // Les deux binarisations donnent les mêmes glyphes sur une image nette.
  for (const binarisation of ['otsu', 'sauvola']) assert.equal(nettoyerBande(bandeFictive(1100, 120).img, binarisation).glyphes.length, 13, binarisation);
});

// ---------- matricule ----------
test("matricule : remise à l'endroit de la rangée imprimée", () => {
  assert.equal(remettreALEndroit('000 M A 1234567R'), R);
  assert.equal(remettreALEndroit('—000— M —A 1234567 R ……'), R);
  assert.equal(remettreALEndroit('RÉGIME RÉEL 000 M A 1234567R'), R);
  assert.equal(remettreALEndroit('Code TVA Matricule Fiscal'), null);
  assert.equal(remettreALEndroit('000 M A 12345678'), null, 'un chiffre à la place de la lettre-clé : pas la forme attendue');
  // Sans lettre-clé : la remise à l'endroit rend la lecture, la forme STRICTE la refuse.
  const sansCle = remettreALEndroit('006 M A 1234567');
  assert.equal(sansCle, '1234567/A/M/006');
  assert.equal(MATRICULE_LU.test(sansCle), false);
  assert.equal(matriculeLu(sansCle), null);
  assert.equal(matriculeLu(R), R);
  assert.equal(matriculeLu('1234567R'), '1234567R');
  assert.equal(matriculeLu(null), null);
});

test('matricule : corrections sûres, seulement là où la position impose un chiffre', () => {
  assert.equal(corrigerChiffres('ODQIl|!ZSGTB'), '000111125678');
  assert.equal(corrigerChiffres('1234567'), '1234567');
  assert.equal(corrigerChiffres('J'), 'J', 'aucune correction devinée');
  assert.equal(remettreALEndroit('OOO M A 12345G7R'), R);
  assert.equal(remettreALEndroit('000 M A I2E4567R'), null, 'E ne se corrige pas en chiffre');
  // La lettre-clé n'est jamais corrigée : un S à cette place reste un S (et pas un 5).
  assert.equal(remettreALEndroit('000 M A 1234567S'), '1234567S/A/M/000');
  assert.ok(!ALPHABET_CLE.includes('I') && !ALPHABET_CLE.includes('O') && !ALPHABET_CLE.includes('U'));
  assert.equal(ALPHABET_CLE.length, 23);
});

test('matricule : la lettre-clé se calcule à partir des 7 chiffres (poids 7 à 1, modulo 23)', () => {
  assert.equal(cleAttendue('1234567'), 'R'); // 84 modulo 23 = 15
  assert.equal(cleAttendue('0000000'), 'A'); // reste 0 : première lettre
  assert.equal(cleAttendue('0000001'), 'B'); // le dernier chiffre pèse 1
  assert.equal(cleAttendue('1000000'), 'H'); // le premier chiffre pèse 7
  assert.equal(cleAttendue('0100000'), 'G'); // le deuxième pèse 6
  assert.equal(cleAttendue('9999999'), 'Z'); // 252 modulo 23 = 22 : dernière lettre
  assert.equal(cleAttendue('0000023'), 'H'); // 2·2 + 3·1 = 7 : c'est la somme PONDÉRÉE qui compte
  // Ce n'est pas une lettre-clé : rien à attendre.
  for (const entree of ['', '123456', '12345678', '12E4567', '1234567R']) assert.equal(cleAttendue(entree), '', entree);
  // Une lecture est cohérente si sa lettre est celle du calcul, sous la forme courte comme sous la forme complète.
  assert.ok(cleCoherente('1234567R') && cleCoherente(R) && cleCoherente(R6));
  assert.ok(!cleCoherente('1234567A') && !cleCoherente(F) && !cleCoherente('1234567') && !cleCoherente(''));
  // I, O et U ne sont jamais des lettres-clés : aucune suite de chiffres ne les donne.
  for (const lettre of 'IOU') assert.ok(!cleCoherente(`1234567${lettre}`), lettre);
});

test("matricule : l'identifiant se décide sur les lectures à lettre-clé cohérente ; seuils 3 lectures et 60 % par segment", () => {
  assert.equal(LECTURES_MIN, 3);
  assert.equal(ACCORD_MIN, 0.6);
  // Accord suffisant → rempli. La lecture à lettre-clé incohérente reste un candidat, sans voix pour l'identifiant.
  let vote = voterMatricule([R, R, R, F, R, R, '1234567/A/M/006', null]);
  assert.deepEqual([vote.matricule, vote.identifiant], [R, '1234567R']);
  assert.deepEqual([vote.completes, vote.votantes, vote.total, vote.accord], [6, 5, 8, 1]);
  assert.deepEqual(vote.candidats, [{ valeur: R, voix: 5, cleCoherente: true }, { valeur: F, voix: 1, cleCoherente: false }]);

  // Bornes exactes du nombre de lectures : 3 suffisent, 2 non.
  assert.equal(voterMatricule([R, R, R]).matricule, R);
  vote = voterMatricule([R, R, null, '45A/A/M/000']);
  assert.deepEqual([vote.matricule, vote.identifiant], [null, null], 'moins de 3 lectures : absent, même unanimes');
  assert.deepEqual(vote.candidats, [{ valeur: R, voix: 2, cleCoherente: true }]);
  // Bornes exactes de l'accord : 60 % suffisent (3 sur 5), 58 % non (14 sur 24), 62,5 % oui (15 sur 24).
  vote = voterMatricule([R, R, R, R6, R6]);
  assert.deepEqual([vote.matricule, vote.accord], [R, 0.6]);
  assert.equal(voterMatricule([...Array(14).fill(R), ...Array(10).fill(R6)]).matricule, null);
  assert.equal(voterMatricule([...Array(15).fill(R), ...Array(9).fill(R6)]).matricule, R);
  vote = voterMatricule([R, R6, R, R6, R, R6]);
  assert.deepEqual([vote.matricule, vote.accord], [null, 0.5]);
  assert.deepEqual(vote.candidats.map((c) => c.valeur).sort(), [R, R6]);

  // Lettre-clé cohérente MINORITAIRE, mais lue au moins 3 fois → remplie (l'erreur du filet est systématique).
  vote = voterMatricule([...Array(20).fill(F), ...Array(4).fill(R)]);
  assert.deepEqual([vote.matricule, vote.completes, vote.votantes, vote.accord], [R, 24, 4, 1]);
  assert.deepEqual(vote.candidats[0], { valeur: F, voix: 20, cleCoherente: false });
  assert.equal(voterMatricule([R, R, R, F, F, F, F]).matricule, R, 'les lectures incohérentes ne pèsent pas dans les 60 %');
  // Lettre-clé incohérente majoritaire, la cohérente lue moins de 3 fois → non rempli.
  vote = voterMatricule([...Array(22).fill(F), R, R]);
  assert.deepEqual([vote.matricule, vote.identifiant, vote.votantes], [null, null, 2]);
  // Aucune lecture cohérente, même unanime → non rempli, lectures gardées comme candidats.
  vote = voterMatricule(Array(24).fill(F));
  assert.deepEqual([vote.matricule, vote.identifiant, vote.completes, vote.votantes, vote.accord], [null, null, 24, 0, 0]);
  assert.deepEqual(vote.candidats, [{ valeur: F, voix: 24, cleCoherente: false }]);

  // Deux identifiants différents, chacun avec SA lettre-clé cohérente : ils se départagent au vote, à 60 % des
  // lectures cohérentes (3 sur 5 suffisent, 2 sur 4 non — et alors rien n'est posé, pas même l'identifiant).
  const autre = `1234576${cleAttendue('1234576')}/A/M/000`;
  assert.equal(voterMatricule([R, R, autre]).matricule, R);
  vote = voterMatricule([R, R, R, autre, autre]);
  assert.deepEqual([vote.matricule, vote.identifiant, vote.accord], [R, '1234567R', 0.6]);
  vote = voterMatricule([R, R, autre, autre]);
  assert.deepEqual([vote.matricule, vote.identifiant], [null, null]);
  // Le vote se fait segment par segment : deux erreurs sur des segments différents ne s'additionnent pas.
  vote = voterMatricule([R, R, R, R6, '1234567R/P/M/000']);
  assert.deepEqual([vote.matricule, vote.accord], [R, 0.8]);
  // Les lectures incomplètes (clé absente, chiffres perdus) ne votent pas.
  vote = voterMatricule(['1234567/A/M/006', '45A/A/M/000', '1234567RB/A/M/000', null, undefined]);
  assert.deepEqual([vote.matricule, vote.identifiant, vote.completes, vote.total, vote.candidats.length], [null, null, 0, 5, 0]);
});

test('matricule : la fin (/TVA/catégorie/établissement) se décide sur TOUTES les lectures complètes ; fin indécise → identifiant seul', () => {
  const F6 = '1234567F/A/M/006'; // lettre-clé incohérente, autre numéro d'établissement
  // La fin n'a pas de clé : les lectures à lettre-clé cohérente ne la lisent pas mieux que les autres. Ici 5 des 6
  // lectures cohérentes lisent /006, mais 9 des 15 lectures complètes lisent /000 (60 %) : c'est /000 qui est retenu.
  let vote = voterMatricule([...Array(5).fill(R6), R, ...Array(8).fill(F), F6]);
  assert.deepEqual([vote.matricule, vote.identifiant, vote.completes, vote.votantes, vote.accord], [R, '1234567R', 15, 6, 0.6]);
  // Une lecture de moins pour /000 (8 sur 14, 57 %) : fin indécise. L'identifiant seul est rendu, jamais une fin devinée.
  vote = voterMatricule([...Array(5).fill(R6), R, ...Array(7).fill(F), F6]);
  assert.deepEqual([vote.matricule, vote.identifiant, vote.votantes], [null, '1234567R', 6]);
  // Les lectures cohérentes sont unanimes sur la fin, pas l'ensemble des lectures complètes (3 sur 7) : indécise aussi.
  vote = voterMatricule([R, R, R, ...Array(4).fill(F6)]);
  assert.deepEqual([vote.matricule, vote.identifiant, vote.accord], [null, '1234567R', 4 / 7]);
  // Lettre-clé cohérente partout, numéro d'établissement à égalité, ou à 58 % : identifiant seul.
  vote = voterMatricule([R, R6, R, R6, R, R6]);
  assert.deepEqual([vote.matricule, vote.identifiant], [null, '1234567R']);
  vote = voterMatricule([...Array(14).fill(R), ...Array(10).fill(R6)]);
  assert.deepEqual([vote.matricule, vote.identifiant], [null, '1234567R']);
  // Chaque segment de la fin a son seuil : code TVA indécis, ou catégorie indécise → identifiant seul.
  for (const autreFin of ['1234567F/P/M/000', '1234567F/A/P/000']) {
    vote = voterMatricule([R, R, R, autreFin, autreFin, autreFin]);
    assert.deepEqual([vote.matricule, vote.identifiant, vote.accord], [null, '1234567R', 0.5], autreFin);
  }
  // L'identifiant ne vient JAMAIS des lectures à lettre-clé incohérente, même si elles décident de la fin.
  vote = voterMatricule([R6, R6, R6, ...Array(21).fill(F)]);
  assert.deepEqual([vote.matricule, vote.identifiant, vote.votantes], [R, '1234567R', 3]);
  assert.ok(MATRICULE_LU.test(vote.identifiant), "l'identifiant seul a la forme stricte d'une lecture");
});

// ---------- extraction géométrique ----------
test('rangées : les lignes de tesseract qui se recouvrent sont fusionnées (libellé, valeur, arabe)', () => {
  const { rangees, hauteurMediane } = construireRangees(carteFiscale());
  assert.equal(rangees.length, 10);
  assert.ok(hauteurMediane > 15 && hauteurMediane < 35, `hauteur médiane ${hauteurMediane}`);
  const raison = rangees.find((r) => /raison/.test(r.texte));
  assert.equal(raison.mots.length, 9);
  assert.deepEqual(raison.mots.map((m) => m.b.x0), [...raison.mots.map((m) => m.b.x0)].sort((a, b) => a - b), 'mots de gauche à droite');
  // Le libellé « Adresse » et la valeur imprimée juste dessous restent deux rangées.
  assert.equal(rangees.find((r) => /^Adresse/.test(r.texte)).mots.length, 2);
  assert.deepEqual(construireRangees([]), { rangees: [], hauteurMediane: 10 });
});

test('libellé → valeur : pointillés retirés, arabe mal lu écarté', () => {
  const { rangees } = construireRangees(carteFiscale());
  const raison = rangees.find((r) => /raison/.test(r.texte));
  const droite = 1600 * 0.8;
  const mots = motsValeur(raison, 330, droite);
  assert.deepEqual(mots.map((m) => m.t), ['SOCIETE', 'EXEMPLE', 'geleaYl'], "pointillés et écriture arabe retirés ; l'arabe lu en latin reste");
  assert.deepEqual(groupePrincipal(mots).map((m) => m.t), ['SOCIETE', 'EXEMPLE'], 'le grand trou coupe la valeur');
  assert.deepEqual(groupePrincipal(mots, 500), [], 'aucun groupe ne commence avant 500 px');
  assert.deepEqual(groupePrincipal(mots.slice(2), 960), [], 'un mot seul trop à droite : pas une valeur');
  assert.deepEqual(groupePrincipal([]), []);
  assert.equal(texteValeur(raison, 330, droite), 'SOCIETE EXEMPLE');
  assert.equal(nettoyerValeur('—SOCIETE.EXEMPLE ………… -'), 'SOCIETE EXEMPLE');
  assert.equal(nettoyerValeur('12 Av. DE LA PAIX,'), '12 Av. DE LA PAIX');
  assert.ok(estPointilles('………—') && estPointilles('=') && !estPointilles('—SOCIETE'));
  assert.ok(estArabe(ARABE) && !estArabe('Société'));
  assert.equal(texteChamp(ARABE), '', 'une valeur non imprimable (Windows-1252) ne devient jamais un champ');
  // Un mot court, peu sûr, en minuscules est du bruit.
  const bruitee = construireRangees([mot('Libellé', 0, 0, 80, 20), mot('VALEUR', 100, 0, 200, 20), mot('al', 210, 0, 230, 20, 12)]).rangees[0];
  assert.equal(texteValeur(bruitee, 80, 1000), 'VALEUR');
});

test("valeur : apostrophe typographique, guillemets, Œ, + ; un mot refusé ne coupe plus la valeur en deux", () => {
  // Apostrophe typographique entre deux lettres : rendue droite (le mot entier était refusé, la valeur coupée).
  assert.equal(valeurDe('STE', `L${APOSTROPHE}ETOILE`, 'DU', 'SUD'), "STE L'ETOILE DU SUD");
  assert.equal(valeurDe('PALAIS', `D${APOSTROPHE}OR`, 'TUNIS'), "PALAIS D'OR TUNIS");
  assert.equal(nettoyerValeur(`STE L${APOSTROPHE}ETOILE ${APOSTROPHE}`), "STE L'ETOILE", "en bord de mot, l'apostrophe est un reste de pointillés");
  // Guillemets retirés en bord de mot.
  assert.equal(valeurDe('CAFE', `${GUILLEMET_OUVRANT}LE`, `PALMIER${GUILLEMET_FERMANT}`), 'CAFE LE PALMIER');
  assert.equal(valeurDe('CAFE', '"LE', 'PALMIER"'), 'CAFE LE PALMIER');
  // Œ s'imprime (Windows-1252) : il est gardé tel quel.
  assert.equal(valeurDe(`B${O_E}UF`, '&', 'CIE'), `B${O_E}UF & CIE`);
  assert.equal(texteChamp(`B${O_E}UF & CIE`), `B${O_E}UF & CIE`);
  // Trait d'union typographique (insécable ici) : ramené au trait d'union, comme le fait le serveur.
  assert.equal(valeurDe(`SAINT${String.fromCodePoint(0x2011)}EXEMPLE`, 'SARL'), 'SAINT-EXEMPLE SARL');
  // « + » à l'intérieur d'un mot est gardé ; collé au bord, c'est un reste de pointillés.
  assert.equal(valeurDe('A+B', 'SERVICES'), 'A+B SERVICES');
  assert.equal(valeurDe('+SOCIETE', 'EXEMPLE+'), 'SOCIETE EXEMPLE');
  // Un mot hors alphabet au milieu d'une valeur est retiré, mais les deux côtés restent (avant : un seul côté).
  assert.equal(valeurDe('CAFE', '#1', 'TUNIS'), 'CAFE TUNIS');
  const { rangee, apresLibelle } = rangeeDe('Libellé', 'CAFE', '#1', 'TUNIS');
  assert.deepEqual(motsValeur(rangee, apresLibelle, 5000).map((m) => m.t), ['CAFE', 'TUNIS']);
  // Adresse : la rue garde son « L' ».
  const adresse = valeurDe('12', 'RUE', 'DE', `L${APOSTROPHE}INDEPENDANCE,`, 'Tunis,', '1000');
  assert.equal(adresse, "12 RUE DE L'INDEPENDANCE, Tunis, 1000");
  assert.equal(decouperAdresse(adresse).rue, "12 RUE DE L'INDEPENDANCE");
  // Texte affiché : mêmes règles, le mot n'est plus retiré sans trace.
  assert.equal(ligneLue(rangeeDe('Enseigne', 'CAFE', `${GUILLEMET_OUVRANT}LE`, `PALMIER${GUILLEMET_FERMANT}`, `L${APOSTROPHE}ETOILE`).rangee), "Enseigne CAFE LE PALMIER L'ETOILE");
  // Carte auto-entrepreneur : le nom garde son apostrophe.
  assert.equal(extraireCarteAutoEntrepreneur(construireRangees(carteAutoEntrepreneur({ nom: `M${APOSTROPHE}EXEMPLE` })).rangees, 1600).nom, "M'EXEMPLE");
});

test("découpage de l'adresse : rue | localité | délégation | gouvernorat | code postal", () => {
  assert.deepEqual(decouperAdresse('12 RUE DES JASMINS, Hammam Sousse, Hammam Sousse, Sousse, 4011'), {
    complete: '12 RUE DES JASMINS, Hammam Sousse, Hammam Sousse, Sousse, 4011',
    rue: '12 RUE DES JASMINS', codePostal: '4011', gouvernorat: 'Sousse', ville: 'Hammam Sousse',
  });
  // Localité et délégation différentes : la délégation est retenue.
  assert.equal(decouperAdresse('5 RUE EXEMPLE, Cité Fictive, Sakiet Ezzit, Sfax, 3021').ville, 'Sakiet Ezzit');
  // Sans code postal.
  assert.deepEqual(decouperAdresse('5 RUE EXEMPLE, Sakiet Ezzit, Sfax'), { complete: '5 RUE EXEMPLE, Sakiet Ezzit, Sfax', rue: '5 RUE EXEMPLE', gouvernorat: 'Sfax', ville: 'Sakiet Ezzit' });
  assert.deepEqual(decouperAdresse('5 RUE EXEMPLE'), { complete: '5 RUE EXEMPLE', rue: '5 RUE EXEMPLE' });
  assert.deepEqual(decouperAdresse('5 RUE EXEMPLE, Sfax'), { complete: '5 RUE EXEMPLE, Sfax', rue: '5 RUE EXEMPLE', ville: 'Sfax' });
  // Rue qui contient une virgule : avec le code postal, la fin est fixe et tout ce qui précède est la rue.
  assert.deepEqual(decouperAdresse('12, RUE DES JASMINS, Hammam Sousse, Hammam Sousse, Sousse, 4011'), {
    complete: '12, RUE DES JASMINS, Hammam Sousse, Hammam Sousse, Sousse, 4011',
    rue: '12, RUE DES JASMINS', codePostal: '4011', gouvernorat: 'Sousse', ville: 'Hammam Sousse',
  });
  const longue = decouperAdresse('12 RUE DES JASMINS BLOC, B APPT 3, Cité Fictive, Sakiet Ezzit, Sfax, 3021');
  assert.deepEqual([longue.rue, longue.ville, longue.gouvernorat], ['12 RUE DES JASMINS BLOC, B APPT 3', 'Sakiet Ezzit', 'Sfax']);
});

test('type du document par mots-clés', () => {
  assert.equal(reconnaitreDocument("République Tunisienne Carte d'Identification Fiscale"), 'carte_fiscale');
  assert.equal(reconnaitreDocument('Carte AutoEntrepreneur Prénom: PRENOM'), 'carte_auto_entrepreneur');
  assert.equal(reconnaitreDocument('Carte Auto-Entrepreneur'), 'carte_auto_entrepreneur');
  assert.equal(reconnaitreDocument('Facture n° 42'), 'inconnu');
  assert.equal(reconnaitreDocument(''), 'inconnu');
});

test('photo couchée : la plupart des mots sûrs ont un cadre nettement plus haut que large', () => {
  assert.equal(photoCouchee(carteFiscale()), false);
  assert.equal(photoCouchee(carteAutoEntrepreneur()), false);
  assert.equal(photoCouchee(coucher(carteFiscale(), 2000)), true);
  assert.equal(photoCouchee(coucher(carteAutoEntrepreneur(), 2000)), true);
  assert.equal(photoCouchee([]), false);
  const haut = (i) => mot('MOT', 40 * i, 0, 40 * i + 20, 60), large = (i) => mot('MOT', 0, 40 * i, 60, 40 * i + 20);
  // Il faut au moins 5 mots sûrs, et une MAJORITÉ de cadres hauts.
  assert.equal(photoCouchee([0, 1, 2, 3].map(haut)), false, '4 mots sûrs : trop peu pour conclure');
  assert.equal(photoCouchee([0, 1, 2, 3, 4].map(haut)), true);
  assert.equal(photoCouchee([...[0, 1, 2].map(haut), ...[0, 1, 2].map(large)]), false, 'la moitié seulement');
  assert.equal(photoCouchee([...[0, 1, 2, 3].map(haut), ...[0, 1, 2].map(large)]), true);
  // « Nettement » : un cadre à peine plus haut que large (lettres hautes, mot court) ne compte pas.
  assert.equal(photoCouchee([0, 1, 2, 3, 4].map((i) => mot('MOT', 40 * i, 0, 40 * i + 20, 28))), false);
  // Les mots peu sûrs ou très courts ne comptent pas.
  assert.equal(photoCouchee([0, 1, 2, 3, 4].map((i) => ({ ...haut(i), c: 59 }))), false);
  assert.equal(photoCouchee([0, 1, 2, 3, 4].map((i) => ({ ...haut(i), t: 'Il' }))), false);
});

test("carte d'identification fiscale : champs, rangée du matricule, cadre de la bande", () => {
  const { rangees, hauteurMediane } = construireRangees(carteFiscale());
  const lu = extraireCarteFiscale(rangees, 1600);
  assert.equal(lu.raisonSociale, 'SOCIETE EXEMPLE');
  assert.deepEqual(lu.adresse, {
    complete: '12 RUE DES JASMINS, Hammam Sousse, Hammam Sousse, Sousse, 4011',
    rue: '12 RUE DES JASMINS', codePostal: '4011', gouvernorat: 'Sousse', ville: 'Hammam Sousse',
  });
  assert.equal(lu.activite, 'Restauration de type rapide');
  assert.equal(lu.regime, 'RÉGIME RÉEL');
  assert.deepEqual(lu.tableau, { entete: 3, nom: 5 });
  assert.equal(lu.matriculePage, undefined, 'lecture à plat sans lettre-clé : refusée');
  assert.equal(extraireCarteFiscale(construireRangees(carteFiscale(MATRICULE_JUSTE)).rangees, 1600).matriculePage, R);
  // Bande : sous l'en-tête du tableau, au-dessus de « Nom et prénom », hauteur plafonnée.
  const zone = cadreBande(rangees, hauteurMediane, 1600, 1, { largeur: 1600, hauteur: 2000 });
  const x0 = 200 - 2 * hauteurMediane, x1 = 1194 + 3 * hauteurMediane;
  assert.deepEqual(zone, { left: Math.round(x0), top: 622, width: Math.round(x1 - x0), height: Math.round(Math.min(121, 5.5 * hauteurMediane)) });
  // La page lue est agrandie deux fois par rapport à la source : le cadre revient en pixels de la source.
  const moitie = cadreBande(rangees, hauteurMediane, 1600, 2, { largeur: 800, hauteur: 1000 });
  assert.deepEqual([moitie.top, moitie.left], [311, Math.round(x0 / 2)]);
  assert.equal(cadreBande(construireRangees(carteAutoEntrepreneur()).rangees, 30, 1600, 1, { largeur: 1600, hauteur: 2000 }), null);
});

test("carte d'identification fiscale : rangée sans valeur — le bruit n'est pas proposé, le nom de la personne physique est pris", () => {
  const raisonSociale = (mots) => extraireCarteFiscale(construireRangees(mots).rangees, 1600).raisonSociale;
  // Personne physique : le libellé arabe lu en lettres latines est à sa vraie place (62 % de la largeur, 7 lettres,
  // confiance 0). Il n'est pas une valeur : elle commencerait avant 60 %. Le nom est pris sur « Nom et prénom ».
  assert.equal(raisonSociale(cartePhysique()), 'PRENOM EXEMPLE');
  // Même refus s'il est lu avec une bonne confiance : c'est la POSITION qui l'écarte.
  const sur = cartePhysique().map((m) => (m.t === 'geleaYl' ? { ...m, c: 90 } : m));
  assert.equal(raisonSociale(sur), 'PRENOM EXEMPLE');
  // Photo inclinée puis redressée : le bruit se fragmente en petits mots, entre 74 et 80 % de la largeur.
  const fragmente = cartePhysique().filter((m) => m.t !== 'geleaYl').concat([mot('ge', 1190, 786, 1215, 810, 0, 16), mot('leaY', 1222, 786, 1262, 810, 0, 16)]);
  assert.equal(raisonSociale(fragmente), 'PRENOM EXEMPLE');
  // Pointillés lus en lettres, à la place d'une valeur (35 % de la largeur) : 3 lettres sans aucun mot sûr, ou moins
  // de 3 lettres → pas une valeur. C'est le CONTENU qui les écarte.
  assert.equal(raisonSociale(cartePhysique([...NOM_PHYSIQUE, mot('gel', 560, 788, 620, 810, 0, 15)])), 'PRENOM EXEMPLE');
  assert.equal(raisonSociale(cartePhysique([...NOM_PHYSIQUE, mot('JL', 560, 788, 600, 810, 0, 15)])), 'PRENOM EXEMPLE');
  assert.equal(raisonSociale(cartePhysique([...NOM_PHYSIQUE, mot('7', 560, 788, 580, 810, 90, 15)])), 'PRENOM EXEMPLE');
  // Le même bruit sur la rangée « Nom et prénom », sans aucun nom : rien n'est proposé.
  assert.equal(raisonSociale(cartePhysique([mot('gel', 560, 745, 620, 767, 0)])), undefined);
  assert.equal(raisonSociale(cartePhysique([])), undefined);
  // Une vraie valeur peut tomber très bas en confiance : 6 lettres au moins suffisent, sans mot sûr.
  const peuSure = carteFiscale().map((m) => (['—SOCIETE', 'EXEMPLE'].includes(m.t) ? { ...m, c: 28 } : m));
  assert.equal(raisonSociale(peuSure), 'SOCIETE EXEMPLE');
  // Une valeur courte est gardée si un mot est sûr.
  assert.equal(raisonSociale(cartePhysique([mot('ABC', 560, 788, 620, 810, 90, 15)])), 'ABC');
});

test("carte d'identification fiscale : rangée du libellé « Adresse » — bruit court écarté, début de rue gardé même peu sûr", () => {
  const adresse = (ajouts) => extraireCarteFiscale(construireRangees(carteFiscale().concat(ajouts)).rangees, 1600).adresse.rue;
  // Des pointillés lus en lettres ou en chiffres : moins de 6 lettres ou chiffres et aucun mot sûr → pas la rue.
  assert.equal(adresse([mot('9', 560, 860, 580, 882, 14)]), '12 RUE DES JASMINS');
  assert.equal(adresse([mot('ae9ae', 560, 860, 660, 882, 4)]), '12 RUE DES JASMINS');
  assert.equal(adresse([mot('BLOC', 300, 860, 380, 882, 30), mot('1', 400, 860, 420, 882, 30)]), '12 RUE DES JASMINS', '5 lettres ou chiffres, peu sûrs');
  assert.equal(adresse([mot('aeae', 560, 860, 640, 882, 90)]), '12 RUE DES JASMINS', 'moins de 6 caractères sans chiffre : du bruit, même sûr');
  // Le même morceau court est gardé dès qu'un mot est sûr (confiance 40 ; 39 ne suffit pas).
  assert.equal(adresse([mot('BLOC', 300, 860, 380, 882, 30), mot('1', 400, 860, 420, 882, 40)]), 'BLOC 1, 12 RUE DES JASMINS');
  assert.equal(adresse([mot('BLOC', 300, 860, 380, 882, 39), mot('1', 400, 860, 420, 882, 39)]), '12 RUE DES JASMINS');
  // À partir de 6 lettres ou chiffres, le morceau est gardé même sans mot sûr : c'est le début de la rue.
  assert.equal(adresse([mot('BLOC', 300, 860, 380, 882, 30), mot('12', 400, 860, 440, 882, 30)]), 'BLOC 12, 12 RUE DES JASMINS');
  assert.equal(adresse([mot('IMMEUBLE', 300, 860, 460, 882, 30), mot('EXEMPLE,', 480, 860, 640, 882, 30)]), 'IMMEUBLE EXEMPLE, 12 RUE DES JASMINS');
  assert.equal(adresse([mot('IMMEUBLE', 300, 860, 460, 882, 90), mot('EXEMPLE,', 480, 860, 640, 882, 90)]), 'IMMEUBLE EXEMPLE, 12 RUE DES JASMINS');
});

// Carte fictive dont l'adresse est passée à part : `libelle` = mots de la rangée du libellé (y 860), `dessous` = mots de
// la rangée imprimée sous le libellé (y 900).
const carteAdresse = (libelle, dessous = []) => carteFiscale().filter((m) => m.b.y0 < 850 || m.b.y0 > 950).concat(libelle, dessous);
const rangeeAdresse = (y, textes, c = 95, x = 284) => textes.map((t) => {
  const m = mot(t, x, y, x + 18 * t.length, y + 22, c);
  x += 18 * t.length + 14;
  return m;
});
const LIBELLE_ADRESSE = mot('Adresse', 150, 860, 236, 882, 61);
const lireAdresse = (libelle, dessous) => extraireCarteFiscale(construireRangees(carteAdresse(libelle, dessous)).rangees, 1600).adresse;

test("carte d'identification fiscale : le mot « Adresse » n'entre jamais dans la rue ; pas de repli quand le libellé est lu", () => {
  // Adresse entière sur la rangée du libellé, tous les mots peu sûrs (confiance 35) : elle est lue APRÈS le libellé.
  const entiere = ['12', 'RUE', 'EXEMPLE,', 'Sfax,', 'Sfax,', 'Sfax,', '3000'];
  for (const confiance of [35, 45]) {
    const lu = lireAdresse([LIBELLE_ADRESSE, ...rangeeAdresse(860, entiere, confiance)]);
    assert.deepEqual([lu.rue, lu.ville, lu.codePostal], ['12 RUE EXEMPLE', 'Sfax', '3000'], `confiance ${confiance}`);
  }
  // Début de la rue sur la rangée du libellé (confiance 30), suite dessous : rien n'est perdu.
  const suite = rangeeAdresse(900, ['12', 'RUE', 'FICTIVE,', 'Sfax,', 'Sfax,', 'Sfax,', '3000']);
  assert.equal(lireAdresse([LIBELLE_ADRESSE, ...rangeeAdresse(860, ['IMMEUBLE', 'EXEMPLE'], 30)], suite).rue, 'IMMEUBLE EXEMPLE, 12 RUE FICTIVE');
  // Libellé lu, mais rien d'utile après lui ni dessous : pas d'adresse. Le repli ne relit pas la rangée du libellé
  // depuis le bord gauche (il aurait proposé « Adresse 9 » pour la rue).
  assert.equal(lireAdresse([LIBELLE_ADRESSE, ...rangeeAdresse(860, ['9,', '4011'], 30)]), undefined);
  assert.equal(lireAdresse([LIBELLE_ADRESSE]), undefined);
  // Libellé précédé de trois restes de bord de page : il n'est plus dans les trois premiers mots, le repli joue — et
  // la valeur commence après le mot « Adresse ».
  const bord = [mot('|', 20, 860, 26, 882, 10), mot('!', 50, 860, 56, 882, 10), mot('|', 80, 860, 86, 882, 10)];
  const lu = lireAdresse([...bord, LIBELLE_ADRESSE, ...rangeeAdresse(860, entiere)]);
  assert.deepEqual([lu.rue, lu.ville, lu.codePostal], ['12 RUE EXEMPLE', 'Sfax', '3000']);
});

test("carte d'identification fiscale : libellé « Adresse » illisible — le repli exige un code postal ET une virgule", () => {
  const ILLISIBLE = mot('Aaresse', 150, 860, 236, 882, 31); // ne commence pas par « Adr » : libellé non trouvé
  const repli = (textes) => lireAdresse([ILLISIBLE], rangeeAdresse(900, textes));
  // Rangée bien lue : virgules et code postal à 4 chiffres.
  let lu = repli(['12', 'RUE', 'EXEMPLE,', 'Sfax,', 'Sfax,', 'Sfax,', '3000']);
  assert.deepEqual([lu.rue, lu.ville, lu.codePostal], ['12 RUE EXEMPLE', 'Sfax', '3000']);
  // Une seule virgule suffit, avec le code postal.
  lu = repli(['12', 'RUE', 'EXEMPLE,', '3000']);
  assert.deepEqual([lu.rue, lu.codePostal], ['12 RUE EXEMPLE', '3000']);
  // Virgules lues en points-virgules et en tirets : rue, ville et code postal seraient collés dans le champ Adresse.
  // Sans aucune virgule, la rangée n'est plus proposée.
  assert.equal(repli(['12', 'RUE', 'EXEMPLE;', 'Sfax-', 'Sfax;', 'Sfax-', '3000']), undefined);
  assert.equal(repli(['12', 'RUE', 'EXEMPLE', '3000']), undefined);
  // Des virgules sans code postal lu : pas proposée non plus (la ville serait fausse).
  assert.equal(repli(['12', 'RUE', 'EXEMPLE,', 'Sfax,', 'Sfax,', 'Sfax,', '30O0']), undefined);
  // Entre deux rangées possibles, celle qui porte le plus de virgules.
  lu = lireAdresse([ILLISIBLE], [...rangeeAdresse(900, ['LOT', '7,', '3000']), ...rangeeAdresse(935, ['12', 'RUE', 'EXEMPLE,', 'Sfax,', 'Sfax,', '3000'])]);
  assert.equal(lu.rue, '12 RUE EXEMPLE');
});

test('carte auto-entrepreneur : identité, identifiant corrigé par position, adresse sur plusieurs rangées', () => {
  const lire = (options) => extraireCarteAutoEntrepreneur(construireRangees(carteAutoEntrepreneur(options)).rangees, 1600);
  assert.deepEqual(lire(), {
    prenom: 'PRENOM', nom: 'EXEMPLE', identifiant: '1234567R', activite: 'Commerce général',
    adresse: 'Sfax Sfax Cité Exemple, Bloc 2, Appartement 5, Route de Gabès, Sfax', ville: 'Sfax',
  });
  // Un chiffre à la place de la lettre-clé : rien n'est proposé (la clé ne se corrige pas).
  const sansCle = lire({ identifiant: '12345678' });
  assert.deepEqual([sansCle.identifiant, sansCle.identifiantIncoherent], [undefined, undefined]);
  // Lettre-clé qui n'est pas celle des 7 chiffres (A lu B à basse résolution) : jamais proposée, seulement citée.
  for (const [lecture, cite] of [['1234567B', '1234567B'], ['12345G7A', '1234567A'], ['1234567O', '1234567O']]) {
    const incoherent = lire({ identifiant: lecture });
    assert.deepEqual([incoherent.identifiant, incoherent.identifiantIncoherent], [undefined, cite], lecture);
  }
});

test('texte affiché : lettres latines seulement, pointillés retirés ; mots de tesseract mis à plat', () => {
  const { rangees } = construireRangees(carteFiscale());
  assert.equal(ligneLue(rangees.find((r) => /raison/.test(r.texte))), 'ou raison sociale SOCIETE EXEMPLE geleaYl');
  assert.equal(ligneLue(rangees.find((r) => /^Nom/.test(r.texte))), 'Nom et prénom');
  assert.equal(ligneLue({ mots: [mot('………', 0, 0, 10, 5), mot(ARABE, 20, 0, 60, 5)], texte: '', y0: 0, y1: 5, cy: 2 }), '');
  // Marque de sens d'écriture, césure invisible, espace de largeur nulle : retirées du mot (il serait refusé en entier).
  const marque = String.fromCodePoint(0x200E), cesure = String.fromCodePoint(0xAD), nulle = String.fromCodePoint(0x200B);
  const page = { blocks: [{ paragraphs: [
    { lines: [{ words: [{ text: `Carte${marque}`, confidence: 93.4, bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }] }] },
    { lines: [{ words: [{ text: `Fis${cesure}ca${nulle}le`, confidence: 75.6, bbox: { x0: 5, y0: 6, x1: 7, y1: 8 } }] }] },
  ] }] };
  assert.deepEqual(motsDePage(page), [
    { t: 'Carte', c: 93, b: { x0: 1, y0: 2, x1: 3, y1: 4 }, li: 1 },
    { t: 'Fiscale', c: 76, b: { x0: 5, y0: 6, x1: 7, y1: 8 }, li: 2 },
  ]);
  assert.deepEqual(motsDePage({ blocks: null }), []);
});

// ---------- chaîne (image et reconnaissance factices) ----------
// Source factice : une page blanche, et pour toute autre zone la bande fictive à l'échelle demandée. `journal.hauts`
// note le haut de chaque bande demandée ; `tampon` pose un pavé d'encre BLEUE à cheval sur le filet, entre deux valeurs.
function sourceFactice(largeur, hauteur, journal = {}, { tampon = false } = {}) {
  return {
    largeur, hauteur,
    extraire(zone, l, h) {
      if (zone.width === largeur && zone.height === hauteur) return { data: versRgba(image(l, h, 255)), width: l, height: h };
      (journal.hauts ??= []).push(zone.top);
      const facteur = l / zone.width;
      const { img, filet } = bandeFictive(l, h, facteur);
      const data = versRgba(img);
      if (tampon) {
        for (let y = filet - Math.round(8 * facteur); y <= filet + Math.round(8 * facteur); y++) {
          for (let x = Math.round(500 * facteur); x < Math.round(560 * facteur); x++) {
            const p = 4 * (y * l + x);
            if (data[p] === 255) { data[p] = 30; data[p + 1] = 40; data[p + 2] = 220; } // l'encre bleue ne couvre pas le noir
          }
        }
      }
      return { data, width: l, height: h };
    },
    tourner(radians) {
      journal.rotation = radians;
      return sourceFactice(largeur, hauteur, journal, { tampon });
    },
  };
}

// Reconnaissance factice : les pages sont rendues dans l'ordre ; chaque lecture de bande demande cinq jetons
// (établissement, catégorie, TVA, identifiant, lettre-clé). `cles` et `etablissements` changent d'une lecture à l'autre ;
// `jeton` remplace toute la suite des jetons.
function moteurFactice({ pages, cles = [], etablissements = [], angle = 0, jeton }) {
  const journal = { jetons: [], pages: 0 };
  return {
    journal,
    angle: async () => angle,
    page: async () => pages[Math.min(journal.pages++, pages.length - 1)],
    jeton: async (img, mode, alphabet) => {
      const n = journal.jetons.length, rang = n % 5, lecture = Math.floor(n / 5);
      journal.jetons.push({ rang, mode, alphabet, taille: `${img.width}×${img.height}` });
      return jeton ? jeton(n) : [etablissements[lecture] ?? '000', 'M', 'A', '1234567', cles[lecture] ?? 'R'][rang];
    },
  };
}

const tousARelire = (champs) => Object.values(champs).every((c) => c.source === 'ocr' && c.aRelire === true);
// Textes lus par l'admin (avertissements, notes) : vocabulaire convenu, aucun terme de fabrication.
const JARGON = /\bOCR\b|2D-DOC|code 2D|\bcouches?\b|TLV|\bpasses?\b|\bvot(e|es|é|ée|és|er)\b|page entière|filet/i;
const sansJargon = (lu) => {
  for (const texte of [...lu.avertissements, ...Object.values(lu.champs).map((c) => c.note ?? '')]) assert.doesNotMatch(texte, JARGON);
  return true;
};
const NOTE_MATRICULE = 'Lettre-clé cohérente avec les 7 chiffres ; relisez la fin (/A/M/000).';
const CONSEIL = "Déposez plutôt l'original, à plat, sans ombre, plus de 1500 px de large.";

test("chaîne, carte d'identification fiscale : lectures cohérentes → matricule rempli, tous les champs à relire", async () => {
  const cles = Array.from({ length: 24 }, (_, i) => (i % 6 === 5 ? 'F' : 'R')); // 20 lectures R, 4 lectures F
  const moteur = moteurFactice({ pages: [carteFiscale()], cles });
  const suivis = [];
  const journal = {};
  const lu = await lireDocument(sourceFactice(1600, 2000, journal), moteur, (etape, avancement) => suivis.push([etape, avancement]));
  assert.equal(lu.document, 'carte_fiscale');
  assert.deepEqual(Object.keys(lu.champs).sort(), ['adresse', 'matriculeFiscal', 'raisonSociale', 'ville']);
  assert.equal(lu.champs.raisonSociale.valeur, 'SOCIETE EXEMPLE');
  assert.equal(lu.champs.adresse.valeur, '12 RUE DES JASMINS');
  assert.equal(lu.champs.ville.valeur, '4011 Hammam Sousse');
  assert.equal(lu.champs.matriculeFiscal.valeur, R);
  assert.ok(MATRICULE_LU.test(lu.champs.matriculeFiscal.valeur));
  // Note du champ, affichée en clair : une phrase courte, sans pourcentage ni décompte.
  assert.equal(lu.champs.matriculeFiscal.note, NOTE_MATRICULE);
  assert.ok(tousARelire(lu.champs) && sansJargon(lu));
  assert.deepEqual(lu.avertissements, []);
  // Texte affiché : la lecture retenue remplace la rangée fausse de la page.
  assert.ok(lu.lignes.includes('000 M A 1234567R'));
  assert.ok(!lu.lignes.some((l) => l.includes('006')));
  assert.ok(lu.lignes.includes("Carte d'Identification Fiscale"));
  // 24 lectures de 5 jetons ; la lettre-clé est lue caractère seul, avec un alphabet de lettres.
  assert.equal(moteur.journal.jetons.length, 120);
  assert.ok(moteur.journal.jetons.filter((j) => j.rang === 4).every((j) => j.mode === 'caractere' && j.alphabet === ALPHABET_CLE));
  assert.ok(moteur.journal.jetons.filter((j) => j.rang === 3).every((j) => j.mode === 'ligne' && j.alphabet === CHIFFRES));
  // Cadrages : un calibrage, puis trois décalages verticaux (−3, 0, +3 px) pour chaque échelle et chaque binarisation.
  assert.deepEqual(journal.hauts, [622, ...Array.from({ length: 8 }, () => [619, 622, 625]).flat()]);
  // Suivi : même libellé, avancement croissant de 0 à 1.
  assert.ok(suivis.every(([etape]) => etape === 'Reconnaissance des caractères…'));
  const avancements = suivis.map(([, a]) => a);
  assert.deepEqual(avancements, [...avancements].sort((a, b) => a - b));
  assert.equal(avancements.at(-1), 1);
  assert.ok(avancements[0] >= 0 && avancements.length > 24);
});

test("chaîne, carte d'identification fiscale : lettre-clé cohérente minoritaire (au moins 3 lectures) → matricule rempli", async () => {
  const cles = Array.from({ length: 24 }, (_, i) => (i % 6 === 5 ? 'R' : 'F')); // 20 lectures F, 4 lectures R
  const lu = await lireDocument(sourceFactice(1600, 2000), moteurFactice({ pages: [carteFiscale()], cles }));
  assert.equal(lu.champs.matriculeFiscal.valeur, R);
  assert.equal(lu.champs.matriculeFiscal.note, NOTE_MATRICULE);
  assert.deepEqual(lu.avertissements, []);
  assert.ok(lu.lignes.includes('000 M A 1234567R'));
});

test("chaîne, carte d'identification fiscale : lettre-clé incohérente → champ absent, lectures citées", async () => {
  const lire = (cles, matricule, etablissements) => lireDocument(sourceFactice(1600, 2000), moteurFactice({ pages: [carteFiscale(matricule)], cles, etablissements }));
  // Lettre-clé fausse à toutes les lectures, même unanimes : rien n'est rempli.
  let lu = await lire(Array(24).fill('F'));
  assert.equal(lu.champs.matriculeFiscal, undefined);
  assert.equal(lu.champs.raisonSociale.valeur, 'SOCIETE EXEMPLE');
  assert.deepEqual(lu.avertissements, [
    'Matricule fiscal non rempli : la lettre-clé lue ne correspond pas aux 7 chiffres. Lectures : 1234567F/A/M/000 (24 lectures). Relisez-le sur le document.',
  ]);
  assert.ok(!lu.lignes.some((l) => /1234567/.test(l)), 'la rangée du matricule, non fiable, est retirée du texte affiché');
  assert.ok(tousARelire(lu.champs) && sansJargon(lu));
  // La rangée lue avec le reste de la page est citée comme une lecture de plus (elle ne vote jamais).
  lu = await lire(Array(24).fill('F'), rangeeMatricule('1234567K'));
  assert.deepEqual(lu.avertissements, [
    'Matricule fiscal non rempli : la lettre-clé lue ne correspond pas aux 7 chiffres. Lectures : 1234567F/A/M/000 (24 lectures), 1234567K/A/M/000 (1 lecture). Relisez-le sur le document.',
  ]);
  // Lettre-clé cohérente lue 2 fois seulement, contre 22 : non rempli ; seules les lectures cohérentes sont citées.
  lu = await lire(Array.from({ length: 24 }, (_, i) => (i < 2 ? 'R' : 'F')));
  assert.equal(lu.champs.matriculeFiscal, undefined);
  assert.deepEqual(lu.avertissements, ['Matricule fiscal indécis, non rempli. Lectures : 1234567R/A/M/000 (2 lectures). Relisez-le sur le document.']);
  lu = await lire(Array(24).fill('F'), MATRICULE_JUSTE);
  assert.deepEqual(lu.avertissements, ['Matricule fiscal indécis, non rempli. Lectures : 1234567R/A/M/000 (1 lecture). Relisez-le sur le document.']);
  assert.ok(sansJargon(lu));
});

test("chaîne, carte d'identification fiscale : fin du matricule indécise → identifiant seul, note « à compléter »", async () => {
  const lire = (cles, etablissements) => lireDocument(sourceFactice(1600, 2000), moteurFactice({ pages: [carteFiscale(MATRICULE_JUSTE)], cles, etablissements }));
  // Lettre-clé cohérente partout, mais numéro d'établissement lu de deux façons à égalité : la fin n'est pas posée.
  let lu = await lire([], Array.from({ length: 24 }, (_, i) => (i % 2 ? '006' : '000')));
  assert.deepEqual(lu.champs.matriculeFiscal, {
    valeur: '1234567R', source: 'ocr', aRelire: true, note: "Fin du matricule (/A/M/000) non lue : complétez-la d'après la carte.",
  });
  assert.ok(MATRICULE_LU.test(lu.champs.matriculeFiscal.valeur));
  assert.deepEqual(lu.avertissements, []);
  // Texte affiché : l'identifiant retenu, sans la fin ; la rangée lue avec le reste de la page reste retirée.
  assert.ok(lu.lignes.includes('1234567R'));
  assert.ok(!lu.lignes.some((l) => /000|006/.test(l)));
  assert.ok(tousARelire(lu.champs) && sansJargon(lu));
  // Les 6 lectures à lettre-clé cohérente lisent presque toutes /006, mais 18 lectures complètes sur 24 lisent /000 :
  // la fin suit l'ensemble des lectures, le matricule complet est rempli avec sa note habituelle.
  const coherentes = [0, 4, 8, 12, 16, 20];
  lu = await lire(
    Array.from({ length: 24 }, (_, i) => (coherentes.includes(i) ? 'R' : 'F')),
    Array.from({ length: 24 }, (_, i) => ((coherentes.includes(i) && i > 0) || i === 1 ? '006' : '000')),
  );
  assert.equal(lu.champs.matriculeFiscal.valeur, R);
  assert.equal(lu.champs.matriculeFiscal.note, NOTE_MATRICULE);
  assert.deepEqual(lu.avertissements, []);
  assert.ok(lu.lignes.includes('000 M A 1234567R'));
});

test("chaîne, carte d'identification fiscale : bande introuvable, peu de champs, code hors liste, tampon bleu", async () => {
  // En-tête du tableau non lu : pas de bande, aucun jeton, matricule à saisir à la main.
  const sansEntete = carteFiscale().filter((m) => !(m.b.y0 === 600 && m.b.y1 === 620));
  let moteur = moteurFactice({ pages: [sansEntete] });
  let lu = await lireDocument(sourceFactice(1600, 2000), moteur);
  assert.equal(lu.champs.matriculeFiscal, undefined);
  assert.deepEqual(Object.keys(lu.champs).sort(), ['adresse', 'raisonSociale', 'ville']);
  assert.deepEqual(lu.avertissements, ['Matricule fiscal illisible : saisissez-le à la main, en relisant la lettre-clé.']);
  assert.equal(moteur.journal.jetons.length, 0);
  assert.ok(sansJargon(lu));
  // Seul le titre est lu : carte reconnue, mais presque rien dedans.
  const titre = [mot('Carte', 300, 200, 420, 232), mot("d'Identification", 440, 200, 760, 232), mot('Fiscale', 780, 200, 920, 232)];
  lu = await lireDocument(sourceFactice(1600, 2000), moteurFactice({ pages: [titre] }));
  assert.deepEqual([lu.document, lu.champs], ['carte_fiscale', {}]);
  assert.deepEqual(lu.avertissements, ['Matricule fiscal illisible : saisissez-le à la main, en relisant la lettre-clé.', `Peu de champs lus. ${CONSEIL}`]);
  // Lettre de catégorie hors des codes usuels (X) : relue avec l'alphabet restreint — six jetons par lecture.
  moteur = moteurFactice({ pages: [carteFiscale()], jeton: (n) => ['000', 'X', 'M', 'A', '1234567', 'R'][n % 6] });
  lu = await lireDocument(sourceFactice(1600, 2000), moteur);
  assert.equal(lu.champs.matriculeFiscal.valeur, R);
  assert.equal(moteur.journal.jetons.length, 144);
  assert.deepEqual(moteur.journal.jetons.slice(0, 3).map((j) => j.alphabet), [CHIFFRES, ALPHABET_CLE, CODES_CATEGORIE]);
  // Tampon à l'encre bleue à cheval sur le filet : le canal « max » l'efface, les jetons lus sont les mêmes.
  const sans = moteurFactice({ pages: [carteFiscale()] }), avec = moteurFactice({ pages: [carteFiscale()] });
  await lireDocument(sourceFactice(1600, 2000), sans);
  lu = await lireDocument(sourceFactice(1600, 2000, {}, { tampon: true }), avec);
  assert.equal(lu.champs.matriculeFiscal.valeur, R);
  assert.equal(avec.journal.jetons.length, 120);
  assert.deepEqual(avec.journal.jetons.map((j) => j.taille), sans.journal.jetons.map((j) => j.taille));
});

test("chaîne, photo couchée d'un quart de tour : « inconnu », aucun champ, le texte lu et la marche à suivre", async () => {
  assert.equal(PHOTO_COUCHEE, 'La photo semble couchée : redressez-la, puis recommencez.');
  for (const [nom, carte] of [['carte fiscale', carteFiscale(MATRICULE_JUSTE)], ['carte auto-entrepreneur', carteAutoEntrepreneur()]]) {
    // La page couchée est plus large que haute ; tesseract lit quand même le texte vertical, titre compris.
    const moteur = moteurFactice({ pages: [coucher(carte, 2000)] });
    const suivis = [];
    const lu = await lireDocument(sourceFactice(2000, 1600), moteur, (_etape, avancement) => suivis.push(avancement));
    assert.equal(lu.document, 'inconnu', nom);
    assert.deepEqual(lu.champs, {}, nom);
    assert.deepEqual(lu.avertissements, [PHOTO_COUCHEE], nom);
    assert.ok(lu.lignes.length > 0 && lu.lignes.join(' ').includes('Carte'), 'les lignes lues sont rendues telles quelles');
    assert.deepEqual([moteur.journal.pages, moteur.journal.jetons.length], [1, 0], 'la lecture s\'arrête avant toute extraction');
    assert.equal(suivis.at(-1), 1);
  }
  // Pas de rotation automatique : la source n'est pas tournée.
  const journal = {};
  await lireDocument(sourceFactice(2000, 1600, journal), moteurFactice({ pages: [coucher(carteFiscale(), 2000)] }));
  assert.equal(journal.rotation, undefined);
});

test('chaîne, carte auto-entrepreneur : deux passes, désaccord signalé, image inclinée et petite', async () => {
  const journal = {};
  const moteur = moteurFactice({ pages: [carteAutoEntrepreneur(), carteAutoEntrepreneur({ cite: 'Exernple,' })], angle: 0.1 });
  const lu = await lireDocument(sourceFactice(800, 1000, journal), moteur);
  assert.equal(journal.rotation, 0.1, 'la source est redressée');
  assert.equal(lu.document, 'carte_auto_entrepreneur');
  assert.deepEqual(Object.fromEntries(Object.entries(lu.champs).map(([k, c]) => [k, c.valeur])), {
    raisonSociale: 'PRENOM EXEMPLE', representantNom: 'PRENOM EXEMPLE', formeJuridique: 'AUTO_ENTREPRENEUR',
    matriculeFiscal: '1234567R', rne: '1234567R',
    adresse: 'Sfax Sfax Cité Exemple, Bloc 2, Appartement 5, Route de Gabès, Sfax', ville: 'Sfax',
  });
  assert.ok(tousARelire(lu.champs) && sansJargon(lu));
  assert.equal(lu.champs.matriculeFiscal.note, 'Lettre-clé cohérente avec les 7 chiffres.');
  assert.equal(lu.champs.rne.note, 'Lettre-clé cohérente avec les 7 chiffres.');
  assert.equal(lu.champs.adresse.note, 'Deuxième lecture : « Exernple, ».');
  assert.deepEqual(lu.avertissements, [
    'Adresse : deux lectures différentes (« Exemple, » / « Exernple, »). À relire.',
    `Image inclinée (6°) et petite (800 px de large) : lecture moins sûre. ${CONSEIL}`,
  ]);
  assert.ok(lu.lignes.includes('Carte AutoEntrepreneur'));
  assert.equal(moteur.journal.jetons.length, 0, 'pas de passe « bande » sur cette carte');
});

test('chaîne, carte auto-entrepreneur : identifiant contrôlé par sa lettre-clé', async () => {
  const lire = (...identifiants) => lireDocument(sourceFactice(1600, 2000), moteurFactice({ pages: identifiants.map((identifiant) => carteAutoEntrepreneur({ identifiant })) }));
  const remplis = (lu) => [lu.champs.matriculeFiscal?.valeur, lu.champs.rne?.valeur];
  // Lettre-clé incohérente aux deux passes : champs non remplis, la lecture est citée.
  let lu = await lire('1234567B', '1234567B');
  assert.deepEqual(remplis(lu), [undefined, undefined]);
  assert.equal(lu.champs.raisonSociale.valeur, 'PRENOM EXEMPLE');
  assert.deepEqual(lu.avertissements, ['Identifiant non rempli : la lettre-clé lue ne correspond pas aux 7 chiffres. Lecture : 1234567B. Relisez-le sur la carte.']);
  assert.ok(sansJargon(lu));
  lu = await lire('1234567B', '1234567A');
  assert.deepEqual(lu.avertissements, ['Identifiant non rempli : la lettre-clé lue ne correspond pas aux 7 chiffres. Lectures : 1234567B, 1234567A. Relisez-le sur la carte.']);
  // Une passe lit la bonne lettre, l'autre une lettre incohérente (A lu B) : la lecture cohérente est prise, sans alerte.
  for (const passes of [['1234567R', '1234567B'], ['1234567B', '1234567R']]) {
    lu = await lire(...passes);
    assert.deepEqual(remplis(lu), ['1234567R', '1234567R'], passes.join(' / '));
    assert.deepEqual(lu.avertissements, []);
  }
  // Une seule passe l'a lu : elle comble le vide.
  lu = await lire('?', '1234567R');
  assert.deepEqual(remplis(lu), ['1234567R', '1234567R']);
  // Deux identifiants différents, chacun cohérent : indécis, non rempli.
  const autre = `1234576${cleAttendue('1234576')}`;
  lu = await lire('1234567R', autre);
  assert.deepEqual(remplis(lu), [undefined, undefined]);
  assert.deepEqual(lu.avertissements, [`Identifiant indécis, non rempli. Lectures : 1234567R, ${autre}. Relisez-le sur la carte.`]);
  // Aucune des deux passes ne le lit.
  lu = await lire('?', '?');
  assert.deepEqual(remplis(lu), [undefined, undefined]);
  assert.deepEqual(lu.avertissements, ['Identifiant unique illisible : saisissez-le à la main, en relisant la lettre-clé.']);
  assert.ok(tousARelire(lu.champs) && sansJargon(lu));
});

test("chaîne, document illisible : pas d'exception, « inconnu », lignes lues et un avertissement", async () => {
  const pages = [[mot('Facture', 100, 100, 220, 130), mot('n°', 230, 100, 260, 130), mot('42', 270, 100, 300, 130), mot(ARABE, 900, 100, 1100, 130)]];
  const lu = await lireDocument(sourceFactice(600, 800), moteurFactice({ pages }));
  assert.equal(lu.document, 'inconnu');
  assert.deepEqual(lu.champs, {});
  assert.deepEqual(lu.lignes, ['Facture n° 42']);
  assert.equal(lu.avertissements.length, 1);
  assert.match(lu.avertissements[0], /^Document non reconnu.*à l'envers.*à plat, sans ombre, plus de 1500 px de large\.$/);
  assert.ok(sansJargon(lu));
  // Page blanche : rien n'est lu, rien ne casse.
  const vide = await lireDocument(sourceFactice(600, 800), moteurFactice({ pages: [[]] }));
  assert.deepEqual([vide.document, vide.lignes.length, vide.avertissements.length], ['inconnu', 0, 1]);
  // Extrait du RNE déposé en image : on demande le PDF.
  const rne = await lireDocument(sourceFactice(1600, 2000), moteurFactice({ pages: [[mot('Registre', 100, 100, 240, 130), mot('National', 250, 100, 390, 130), mot('des', 400, 100, 450, 130), mot('Entreprises', 460, 100, 640, 130)]] }));
  assert.deepEqual([rne.document, rne.avertissements.length], ['inconnu', 1]);
  assert.match(rne.avertissements[0], /PDF/);
});

// ---------- cycle de vie du worker ----------
const attendre = (ms) => new Promise((resoudre) => { setTimeout(resoudre, ms); });
const arretable = () => ({ arrets: 0, terminate() { this.arrets++; return Promise.resolve(); } });

test('worker : le Worker ouvert pendant la création est noté, le constructeur est remis en place', () => {
  class WorkerFactice { constructor(adresse) { this.adresse = adresse; } terminate() {} }
  const portee = { Worker: WorkerFactice };
  let pendant;
  const { rendu, ouvert } = noterWorker(portee, () => {
    pendant = portee.Worker;
    return { travailleur: new portee.Worker('/ocr/worker.min.js') };
  });
  assert.notEqual(pendant, WorkerFactice, "le constructeur est remplacé le temps de l'appel");
  assert.equal(portee.Worker, WorkerFactice, 'puis remis en place');
  assert.equal(ouvert, rendu.travailleur, 'le Worker noté est celui que le code appelant a reçu');
  assert.ok(ouvert instanceof WorkerFactice);
  assert.equal(ouvert.adresse, '/ocr/worker.min.js');
  // Remis en place même si la création lève une exception.
  assert.throws(() => noterWorker(portee, () => { throw new Error('panne'); }), /panne/);
  assert.equal(portee.Worker, WorkerFactice);
  // Aucun Worker ouvert, pas de constructeur, constructeur figé : la création a lieu quand même.
  assert.deepEqual(noterWorker(portee, () => 7), { rendu: 7, ouvert: null });
  assert.deepEqual(noterWorker({}, () => 7), { rendu: 7, ouvert: null });
  const figee = Object.freeze({ Worker: WorkerFactice });
  assert.deepEqual(noterWorker(figee, () => 7), { rendu: 7, ouvert: null });
});

test('worker : toujours arrêté — lecture réussie, lecture en erreur, panne de chargement', async () => {
  assert.equal(DELAI_LECTURE, 90_000);
  // Lecture réussie.
  let travailleur = arretable(), ouvert = arretable();
  assert.equal(await avecTravailleur(() => ({ pret: Promise.resolve(travailleur), ouvert }), async (t) => (t === travailleur ? 'lu' : 'autre'), 1000), 'lu');
  assert.deepEqual([travailleur.arrets, ouvert.arrets], [1, 1]);
  // Lecture en erreur : l'erreur remonte telle quelle.
  travailleur = arretable();
  await assert.rejects(avecTravailleur(() => ({ pret: Promise.resolve(travailleur), ouvert: null }), async () => { throw new Error('reconnaissance en panne'); }, 1000), /reconnaissance en panne/);
  assert.equal(travailleur.arrets, 1);
  // Panne de chargement : tesseract.js ne rend pas son worker, c'est le Worker noté qui est arrêté.
  ouvert = arretable();
  let lectures = 0;
  await assert.rejects(avecTravailleur(() => ({ pret: Promise.reject(new Error('modèle introuvable')), ouvert }), async () => { lectures++; }, 1000), /modèle introuvable/);
  assert.deepEqual([ouvert.arrets, lectures], [1, 0]);
  // L'ouverture elle-même lève une exception.
  await assert.rejects(avecTravailleur(() => { throw new Error('pas de worker'); }, async () => 'lu', 1000), /pas de worker/);
  // Un arrêt qui échoue ne masque pas le résultat.
  const recalcitrant = { terminate() { throw new Error('déjà arrêté'); } };
  assert.equal(await avecTravailleur(() => ({ pret: Promise.resolve(recalcitrant), ouvert: null }), async () => 'lu', 1000), 'lu');
});

test('worker : délai dépassé → la lecture échoue proprement, le worker est arrêté même s\'il arrive trop tard', async () => {
  // Chargement qui n'aboutit jamais.
  let ouvert = arretable();
  let erreur = await avecTravailleur(() => ({ pret: new Promise(() => {}), ouvert }), async () => 'lu', 20).catch((e) => e);
  assert.ok(erreur instanceof DelaiDepasse);
  assert.equal(erreur.name, 'DelaiDepasse');
  assert.equal(ouvert.arrets, 1);
  // Lecture qui ne se termine jamais : le worker est arrêté.
  const travailleur = arretable();
  erreur = await avecTravailleur(() => ({ pret: Promise.resolve(travailleur), ouvert: null }), () => new Promise(() => {}), 20).catch((e) => e);
  assert.ok(erreur instanceof DelaiDepasse);
  assert.equal(travailleur.arrets, 1);
  // Worker prêt APRÈS le délai : il est arrêté à son arrivée, et aucune lecture ne démarre.
  const tardif = arretable();
  ouvert = arretable();
  let lectures = 0;
  erreur = await avecTravailleur(() => ({ pret: attendre(60).then(() => tardif), ouvert }), async () => { lectures++; }, 20).catch((e) => e);
  assert.ok(erreur instanceof DelaiDepasse);
  assert.deepEqual([tardif.arrets, ouvert.arrets], [0, 1]);
  await attendre(80);
  assert.deepEqual([tardif.arrets, lectures], [1, 0]);
});
