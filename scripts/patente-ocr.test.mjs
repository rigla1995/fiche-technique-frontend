// Lot 3, étape 7 — couche « ocr » de la lecture de la patente : fonctions pures (pixels, extraction, matricule) et chaîne.
//   node --test scripts/patente-ocr.test.mjs        (Node ≥ 23.6 : exécute le TypeScript tel quel)
// Données SYNTHÉTIQUES seulement : mots et cadres fabriqués à la main, société fictive, matricule « 1234567A/A/M/000 ».
// Aucune valeur d'un document réel ne doit entrer ici.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MATRICULE_LU, texteChamp } from '../src/components/admin/patente/types.ts';
import { lireDocument } from '../src/components/admin/patente/ocr/chaine.ts';
import {
  cadreBande, construireRangees, decouperAdresse, estArabe, estPointilles, extraireCarteAutoEntrepreneur, extraireCarteFiscale,
  groupePrincipal, ligneLue, motsDePage, motsValeur, nettoyerValeur, reconnaitreDocument, texteValeur,
} from '../src/components/admin/patente/ocr/extraction.ts';
import {
  ACCORD_MIN, ALPHABET_CLE, CHIFFRES, LECTURES_MIN, corrigerChiffres, matriculeLu, remettreALEndroit, voterMatricule,
} from '../src/components/admin/patente/ocr/matricule.ts';
import {
  binariser, couperEnJetons, decouperGlyphes, etirer, garderGlyphes, gris, inverser, nettoyerBande, retirerFilets, sauvola,
  seuilOtsu, versRgba,
} from '../src/components/admin/patente/ocr/pixels.ts';

// ---------- fabriques ----------
const mot = (t, x0, y0, x1, y1, c = 95, li) => (li === undefined ? { t, c, b: { x0, y0, x1, y1 } } : { t, c, b: { x0, y0, x1, y1 }, li });
const ARABE = String.fromCodePoint(0x0627, 0x0644, 0x0627, 0x0633, 0x0645); // un vrai mot en écriture arabe
const image = (width, height, valeur) => ({ data: new Uint8ClampedArray(width * height).fill(valeur), width, height });
const peindre = (img, x0, y0, x1, y1, valeur) => {
  for (let y = Math.max(0, y0); y <= Math.min(img.height - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(img.width - 1, x1); x++) img.data[y * img.width + x] = valeur;
  }
};

// Carte d'identification fiscale fictive, sur une page de 1600 × 2000 px. La rangée du matricule est passée à part.
const MATRICULE_SANS_CLE = [mot('006', 270, 670, 330, 694, 55), mot('M', 585, 670, 609, 694), mot('A', 790, 670, 814, 694, 46), mot('1234567', 980, 670, 1084, 694, 54)];
const MATRICULE_JUSTE = [mot('000', 270, 670, 330, 694), mot('M', 585, 670, 609, 694), mot('A', 790, 670, 814, 694), mot('1234567A', 980, 670, 1100, 694)];
const carteFiscale = (rangeeMatricule = MATRICULE_SANS_CLE) => [
  mot('République', 180, 96, 326, 126), mot('Tunisienne', 334, 98, 472, 122),
  mot('Carte', 300, 200, 420, 232), mot("d'Identification", 440, 200, 760, 232), mot('Fiscale', 780, 200, 920, 232),
  mot('RÉGIME', 600, 400, 720, 428), mot('RÉEL', 730, 400, 800, 428),
  mot('N°', 200, 600, 228, 620), mot('établissement', 236, 600, 380, 620), mot('secondaire', 388, 600, 500, 620),
  mot('Code', 560, 600, 612, 620), mot('Catégorie', 620, 600, 722, 620), mot('Code', 820, 600, 872, 620), mot('TVA', 880, 600, 928, 620),
  mot('Matricule', 1020, 600, 1124, 620), mot('Fiscal', 1132, 600, 1194, 620),
  ...rangeeMatricule,
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

// Carte auto-entrepreneur fictive, sur une page de 1600 × 2000 px : colonne latine à gauche, arabe à droite.
const carteAutoEntrepreneur = ({ identifiant = '12345G7A', cite = 'Exemple,' } = {}) => [
  mot('Carte', 1000, 300, 1100, 330), mot('AutoEntrepreneur', 1110, 300, 1400, 334),
  mot('Prénom:', 90, 500, 250, 534), mot('PRENOM', 280, 500, 460, 530), mot('ans0', 1200, 505, 1300, 530, 24),
  mot('Nom:', 90, 600, 190, 632), mot('EXEMPLE', 220, 598, 400, 630),
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
  assert.equal(remettreALEndroit('000 M A 1234567A'), '1234567A/A/M/000');
  assert.equal(remettreALEndroit('—000— M —A 1234567 A ……'), '1234567A/A/M/000');
  assert.equal(remettreALEndroit('RÉGIME RÉEL 000 M A 1234567A'), '1234567A/A/M/000');
  assert.equal(remettreALEndroit('Code TVA Matricule Fiscal'), null);
  assert.equal(remettreALEndroit('000 M A 12345678'), null, 'un chiffre à la place de la lettre-clé : pas la forme attendue');
  // Sans lettre-clé : la remise à l'endroit rend la lecture, la forme STRICTE la refuse.
  const sansCle = remettreALEndroit('006 M A 1234567');
  assert.equal(sansCle, '1234567/A/M/006');
  assert.equal(MATRICULE_LU.test(sansCle), false);
  assert.equal(matriculeLu(sansCle), null);
  assert.equal(matriculeLu('1234567A/A/M/000'), '1234567A/A/M/000');
  assert.equal(matriculeLu('1234567A'), '1234567A');
  assert.equal(matriculeLu(null), null);
});

test('matricule : corrections sûres, seulement là où la position impose un chiffre', () => {
  assert.equal(corrigerChiffres('ODQIl|!ZSGTB'), '000111125678');
  assert.equal(corrigerChiffres('1234567'), '1234567');
  assert.equal(corrigerChiffres('J'), 'J', 'aucune correction devinée');
  assert.equal(remettreALEndroit('OOO M A 12345G7A'), '1234567A/A/M/000');
  assert.equal(remettreALEndroit('000 M A I2E4567A'), null, 'E ne se corrige pas en chiffre');
  // La lettre-clé n'est jamais corrigée : un S à cette place reste un S (et pas un 5).
  assert.equal(remettreALEndroit('000 M A 1234567S'), '1234567S/A/M/000');
  assert.ok(!ALPHABET_CLE.includes('I') && !ALPHABET_CLE.includes('O') && !ALPHABET_CLE.includes('U'));
});

test('matricule : vote par segment, seuils (3 lectures complètes, 60 % par segment)', () => {
  assert.equal(LECTURES_MIN, 3);
  assert.equal(ACCORD_MIN, 0.6);
  const A = '1234567A/A/M/000', F = '1234567F/A/M/000';
  // Accord suffisant → rempli.
  let vote = voterMatricule([A, A, A, F, A, A, '1234567/A/M/006', null]);
  assert.equal(vote.matricule, A);
  assert.deepEqual([vote.completes, vote.total, vote.cleDisputee], [6, 8, true]);
  assert.ok(Math.abs(vote.accord - 5 / 6) < 1e-9);
  assert.deepEqual(vote.candidats, [{ valeur: A, voix: 5 }, { valeur: F, voix: 1 }]);
  // Lettre-clé indécise → absent, candidats rendus.
  vote = voterMatricule([A, F, A, F, A, F]);
  assert.equal(vote.matricule, null);
  assert.equal(vote.accord, 0.5);
  assert.deepEqual(vote.candidats.map((c) => c.valeur).sort(), [A, F]);
  // Moins de 3 lectures complètes → absent, même unanimes.
  vote = voterMatricule([A, A, null, '45A/A/M/000']);
  assert.equal(vote.matricule, null);
  assert.deepEqual(vote.candidats, [{ valeur: A, voix: 2 }]);
  // Le vote se fait segment par segment : deux erreurs sur des segments différents ne s'additionnent pas.
  vote = voterMatricule([A, A, A, '1234567A/A/M/006', F]);
  assert.equal(vote.matricule, A);
  assert.equal(vote.accord, 0.8);
  // Les lectures incomplètes (clé absente, chiffres perdus) ne votent pas.
  vote = voterMatricule(['1234567/A/M/006', '45A/A/M/000', '1234567AB/A/M/000', null, undefined]);
  assert.deepEqual([vote.matricule, vote.completes, vote.total, vote.candidats.length], [null, 0, 5, 0]);
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
});

test('type du document par mots-clés', () => {
  assert.equal(reconnaitreDocument("République Tunisienne Carte d'Identification Fiscale"), 'carte_fiscale');
  assert.equal(reconnaitreDocument('Carte AutoEntrepreneur Prénom: PRENOM'), 'carte_auto_entrepreneur');
  assert.equal(reconnaitreDocument('Carte Auto-Entrepreneur'), 'carte_auto_entrepreneur');
  assert.equal(reconnaitreDocument('Facture n° 42'), 'inconnu');
  assert.equal(reconnaitreDocument(''), 'inconnu');
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
  assert.equal(extraireCarteFiscale(construireRangees(carteFiscale(MATRICULE_JUSTE)).rangees, 1600).matriculePage, '1234567A/A/M/000');
  // Bande : sous l'en-tête du tableau, au-dessus de « Nom et prénom », hauteur plafonnée.
  const zone = cadreBande(rangees, hauteurMediane, 1600, 1, { largeur: 1600, hauteur: 2000 });
  const x0 = 200 - 2 * hauteurMediane, x1 = 1194 + 3 * hauteurMediane;
  assert.deepEqual(zone, { left: Math.round(x0), top: 622, width: Math.round(x1 - x0), height: Math.round(Math.min(121, 5.5 * hauteurMediane)) });
  // La page lue est agrandie deux fois par rapport à la source : le cadre revient en pixels de la source.
  const moitie = cadreBande(rangees, hauteurMediane, 1600, 2, { largeur: 800, hauteur: 1000 });
  assert.deepEqual([moitie.top, moitie.left], [311, Math.round(x0 / 2)]);
  assert.equal(cadreBande(construireRangees(carteAutoEntrepreneur()).rangees, 30, 1600, 1, { largeur: 1600, hauteur: 2000 }), null);
  // Personne physique : pas de raison sociale, le nom est sur la rangée « Nom et prénom ». Le libellé arabe lu en
  // lettres latines est à sa place réelle, au-delà de 80 % de la largeur (en deçà, sur une rangée sans valeur, il
  // serait le seul groupe de mots et serait proposé : limite connue, tous les champs sont « à relire »).
  const physique = carteFiscale().filter((m) => !['—SOCIETE', 'EXEMPLE', 'geleaYl'].includes(m.t))
    .concat([mot('geleaYl', 1300, 782, 1520, 814, 0, 16), mot('PRENOM', 553, 745, 690, 767), mot('EXEMPLE', 704, 745, 850, 767)]);
  assert.equal(extraireCarteFiscale(construireRangees(physique).rangees, 1600).raisonSociale, 'PRENOM EXEMPLE');
});

test('carte auto-entrepreneur : identité, identifiant corrigé par position, adresse sur plusieurs rangées', () => {
  const lu = extraireCarteAutoEntrepreneur(construireRangees(carteAutoEntrepreneur()).rangees, 1600);
  assert.deepEqual(lu, {
    prenom: 'PRENOM', nom: 'EXEMPLE', identifiant: '1234567A', activite: 'Commerce général',
    adresse: 'Sfax Sfax Cité Exemple, Bloc 2, Appartement 5, Route de Gabès, Sfax', ville: 'Sfax',
  });
  // Un chiffre à la place de la lettre-clé : rien n'est proposé (la clé ne se corrige pas).
  const sansCle = extraireCarteAutoEntrepreneur(construireRangees(carteAutoEntrepreneur({ identifiant: '12345678' })).rangees, 1600);
  assert.equal(sansCle.identifiant, undefined);
});

test('texte affiché : lettres latines seulement, pointillés retirés ; mots de tesseract mis à plat', () => {
  const { rangees } = construireRangees(carteFiscale());
  assert.equal(ligneLue(rangees.find((r) => /raison/.test(r.texte))), 'ou raison sociale SOCIETE EXEMPLE geleaYl');
  assert.equal(ligneLue(rangees.find((r) => /^Nom/.test(r.texte))), 'Nom et prénom');
  assert.equal(ligneLue({ mots: [mot('………', 0, 0, 10, 5), mot(ARABE, 20, 0, 60, 5)], texte: '', y0: 0, y1: 5, cy: 2 }), '');
  const marque = String.fromCodePoint(0x200E);
  const page = { blocks: [{ paragraphs: [
    { lines: [{ words: [{ text: `Carte${marque}`, confidence: 93.4, bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }] }] },
    { lines: [{ words: [{ text: 'Fiscale', confidence: 75.6, bbox: { x0: 5, y0: 6, x1: 7, y1: 8 } }] }] },
  ] }] };
  assert.deepEqual(motsDePage(page), [
    { t: 'Carte', c: 93, b: { x0: 1, y0: 2, x1: 3, y1: 4 }, li: 1 },
    { t: 'Fiscale', c: 76, b: { x0: 5, y0: 6, x1: 7, y1: 8 }, li: 2 },
  ]);
  assert.deepEqual(motsDePage({ blocks: null }), []);
});

// ---------- chaîne (image et reconnaissance factices) ----------
// Source factice : une page blanche, et pour toute autre zone la bande fictive à l'échelle demandée.
function sourceFactice(largeur, hauteur, journal = {}) {
  return {
    largeur, hauteur,
    extraire(zone, l, h) {
      const pleine = zone.width === largeur && zone.height === hauteur;
      const grise = pleine ? image(l, h, 255) : bandeFictive(l, h, l / zone.width).img;
      return { data: versRgba(grise), width: l, height: h };
    },
    tourner(radians) {
      journal.rotation = radians;
      return sourceFactice(largeur, hauteur, journal);
    },
  };
}

// Reconnaissance factice : les pages sont rendues dans l'ordre ; chaque lecture de bande demande cinq jetons
// (établissement, catégorie, TVA, identifiant, lettre-clé), la lettre-clé changeant d'une lecture à l'autre.
function moteurFactice({ pages, cles = [], angle = 0, journal = { jetons: [] } }) {
  let page = 0, jeton = 0;
  return {
    journal,
    angle: async () => angle,
    page: async () => pages[Math.min(page++, pages.length - 1)],
    jeton: async (_image, mode, alphabet) => {
      const rang = jeton % 5, lecture = Math.floor(jeton / 5);
      jeton++;
      journal.jetons.push({ rang, mode, alphabet });
      return ['000', 'M', 'A', '1234567', cles[lecture] ?? 'A'][rang];
    },
  };
}

const tousARelire = (champs) => Object.values(champs).every((c) => c.source === 'ocr' && c.aRelire === true);

test("chaîne, carte d'identification fiscale : accord suffisant → matricule rempli, tous les champs à relire", async () => {
  const cles = Array.from({ length: 24 }, (_, i) => (i % 6 === 5 ? 'F' : 'A')); // 20 lectures A, 4 lectures F
  const moteur = moteurFactice({ pages: [carteFiscale()], cles });
  const suivis = [];
  const lu = await lireDocument(sourceFactice(1600, 2000), moteur, (etape, avancement) => suivis.push([etape, avancement]));
  assert.equal(lu.document, 'carte_fiscale');
  assert.deepEqual(Object.keys(lu.champs).sort(), ['adresse', 'matriculeFiscal', 'raisonSociale', 'ville']);
  assert.equal(lu.champs.raisonSociale.valeur, 'SOCIETE EXEMPLE');
  assert.equal(lu.champs.adresse.valeur, '12 RUE DES JASMINS');
  assert.equal(lu.champs.ville.valeur, '4011 Hammam Sousse');
  assert.equal(lu.champs.matriculeFiscal.valeur, '1234567A/A/M/000');
  assert.ok(MATRICULE_LU.test(lu.champs.matriculeFiscal.valeur));
  assert.match(lu.champs.matriculeFiscal.note, /24 lectures.*83 %.*1234567F\/A\/M\/000.*lettre-clé/);
  assert.ok(tousARelire(lu.champs));
  assert.deepEqual(lu.avertissements, []);
  // Texte affiché : la lecture votée remplace la rangée fausse de la passe « page entière ».
  assert.ok(lu.lignes.includes('000 M A 1234567A'));
  assert.ok(!lu.lignes.some((l) => l.includes('006')));
  assert.ok(lu.lignes.includes("Carte d'Identification Fiscale"));
  // 24 lectures de 5 jetons ; la lettre-clé est lue caractère seul, avec un alphabet de lettres.
  assert.equal(moteur.journal.jetons.length, 120);
  assert.ok(moteur.journal.jetons.filter((j) => j.rang === 4).every((j) => j.mode === 'caractere' && j.alphabet === ALPHABET_CLE));
  assert.ok(moteur.journal.jetons.filter((j) => j.rang === 3).every((j) => j.mode === 'ligne' && j.alphabet === CHIFFRES));
  // Suivi : même libellé, avancement croissant de 0 à 1.
  assert.ok(suivis.every(([etape]) => etape === 'Reconnaissance des caractères…'));
  const avancements = suivis.map(([, a]) => a);
  assert.deepEqual(avancements, [...avancements].sort((a, b) => a - b));
  assert.equal(avancements.at(-1), 1);
  assert.ok(avancements[0] >= 0 && avancements.length > 24);
});

test("chaîne, carte d'identification fiscale : lettre-clé indécise → champ absent, candidats donnés", async () => {
  const cles = Array.from({ length: 24 }, (_, i) => (i % 2 ? 'F' : 'A'));
  const lu = await lireDocument(sourceFactice(1600, 2000), moteurFactice({ pages: [carteFiscale(MATRICULE_JUSTE)], cles }));
  assert.equal(lu.champs.matriculeFiscal, undefined);
  assert.equal(lu.champs.raisonSociale.valeur, 'SOCIETE EXEMPLE');
  assert.equal(lu.avertissements.length, 1);
  assert.match(lu.avertissements[0], /indécis.*1234567A\/A\/M\/000 \(12 lectures\).*1234567F\/A\/M\/000 \(12 lectures\).*lettre-clé/);
  assert.ok(!lu.lignes.some((l) => /1234567/.test(l)), 'la rangée du matricule, non fiable, est retirée du texte affiché');
  assert.ok(tousARelire(lu.champs));
});

test('chaîne, carte auto-entrepreneur : deux passes, désaccord signalé, image inclinée et petite', async () => {
  const journal = {};
  const moteur = moteurFactice({ pages: [carteAutoEntrepreneur(), carteAutoEntrepreneur({ cite: 'Exernple,' })], angle: 0.1 });
  const lu = await lireDocument(sourceFactice(800, 1000, journal), moteur);
  assert.equal(journal.rotation, 0.1, 'la source est redressée');
  assert.equal(lu.document, 'carte_auto_entrepreneur');
  assert.deepEqual(Object.fromEntries(Object.entries(lu.champs).map(([k, c]) => [k, c.valeur])), {
    raisonSociale: 'PRENOM EXEMPLE', representantNom: 'PRENOM EXEMPLE', formeJuridique: 'AUTO_ENTREPRENEUR',
    matriculeFiscal: '1234567A', rne: '1234567A',
    adresse: 'Sfax Sfax Cité Exemple, Bloc 2, Appartement 5, Route de Gabès, Sfax', ville: 'Sfax',
  });
  assert.ok(tousARelire(lu.champs));
  assert.match(lu.champs.matriculeFiscal.note, /lettre-clé/);
  assert.match(lu.champs.adresse.note, /Exernple/);
  assert.deepEqual(lu.avertissements, [
    'Adresse : deux lectures différentes (« Exemple, » / « Exernple, »). À relire.',
    "Image inclinée (6°) et petite (800 px de large) : lecture moins sûre. Déposez plutôt l'original, à plat, sans ombre, plus de 1500 px de large.",
  ]);
  assert.ok(lu.lignes.includes('Carte AutoEntrepreneur'));
  assert.equal(moteur.journal.jetons.length, 0, 'pas de passe « bande » sur cette carte');
});

test('chaîne, carte auto-entrepreneur : identifiant différent entre les deux passes → non rempli', async () => {
  const moteur = moteurFactice({ pages: [carteAutoEntrepreneur(), carteAutoEntrepreneur({ identifiant: '1234567B' })] });
  const lu = await lireDocument(sourceFactice(1600, 2000), moteur);
  assert.equal(lu.champs.matriculeFiscal, undefined);
  assert.equal(lu.champs.rne, undefined);
  assert.equal(lu.champs.raisonSociale.valeur, 'PRENOM EXEMPLE');
  assert.equal(lu.avertissements.length, 1);
  assert.match(lu.avertissements[0], /1234567A, 1234567B.*lettre-clé/);
  // Une seule passe l'a lu : elle comble le vide.
  const comble = await lireDocument(sourceFactice(1600, 2000), moteurFactice({ pages: [carteAutoEntrepreneur({ identifiant: '?' }), carteAutoEntrepreneur()] }));
  assert.equal(comble.champs.rne.valeur, '1234567A');
});

test("chaîne, document illisible : pas d'exception, « inconnu », lignes lues et un avertissement", async () => {
  const pages = [[mot('Facture', 100, 100, 220, 130), mot('n°', 230, 100, 260, 130), mot('42', 270, 100, 300, 130), mot(ARABE, 900, 100, 1100, 130)]];
  const lu = await lireDocument(sourceFactice(600, 800), moteurFactice({ pages }));
  assert.equal(lu.document, 'inconnu');
  assert.deepEqual(lu.champs, {});
  assert.deepEqual(lu.lignes, ['Facture n° 42']);
  assert.equal(lu.avertissements.length, 1);
  assert.match(lu.avertissements[0], /Document non reconnu.*à plat, sans ombre, plus de 1500 px de large/);
  // Page blanche : rien n'est lu, rien ne casse.
  const vide = await lireDocument(sourceFactice(600, 800), moteurFactice({ pages: [[]] }));
  assert.deepEqual([vide.document, vide.lignes.length, vide.avertissements.length], ['inconnu', 0, 1]);
  // Extrait du RNE déposé en image : on demande le PDF.
  const rne = await lireDocument(sourceFactice(1600, 2000), moteurFactice({ pages: [[mot('Registre', 100, 100, 240, 130), mot('National', 250, 100, 390, 130), mot('des', 400, 100, 450, 130), mot('Entreprises', 460, 100, 640, 130)]] }));
  assert.deepEqual([rne.document, rne.avertissements.length], ['inconnu', 1]);
  assert.match(rne.avertissements[0], /PDF/);
});
