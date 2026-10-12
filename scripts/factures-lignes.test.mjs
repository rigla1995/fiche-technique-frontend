// Tests de la lecture des LIGNES d'une facture fournisseur (étape F3 — src/components/client/factures/lecture/lignes.ts).
// node --test scripts/factures-lignes.test.mjs (Node ≥ 23.6 : types effacés). Pages construites à la main (mots et
// positions) ; la mesure sur le jeu de factures fictives est dans labflow-reprise/achats-compta/ESSAI-FACTURES.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireRangees } from '../src/components/client/factures/lecture/rangees.ts';
import { cellules, colonnesDuTitre, deduire, genreDeTitre, lireLignes } from '../src/components/client/factures/lecture/lignes.ts';
import { bandeDuTableau, lignesDouteuses } from '../src/components/client/factures/lecture/chaineOcr.ts';

// Une ligne de page : [x, texte] par bloc, mots de 6 unités par caractère, hauteur h.
const mots = (y, blocs, h = 10) => blocs.flatMap(([x, texte]) => {
  let cx = x;
  return texte.split(' ').filter(Boolean).map((t) => {
    const m = { t, x0: cx, x1: cx + t.length * 6, y0: y, y1: y + h };
    cx += (t.length + 1) * 6;
    return m;
  });
});
const page = (lignes, hauteur = 842, largeur = 595) => ({
  largeur, hauteur,
  rangees: construireRangees(lignes.flatMap(([y, blocs, h]) => mots(y, blocs, h))),
});
const simple = (ls) => ls.map((l) => [l.designation, l.quantite, l.prixUnitaire, l.remise, l.tauxTva, l.montant, l.controle]);

test('genreDeTitre : titres usuels, collés ou mal reconnus', () => {
  const g = (t) => genreDeTitre(t);
  assert.equal(g('Désignation'), 'des');
  assert.equal(g('Code article'), 'ref');
  assert.equal(g('Réfé.'), 'ref');
  assert.equal(g('Article'), 'des');
  assert.equal(g('Qté'), 'qte');
  assert.equal(g('Ote'), 'qte');
  assert.equal(g('P.U. HT'), 'pu');
  assert.equal(g('Prix unitaire'), 'pu');
  assert.equal(g('MontantHT'), 'montant');
  assert.equal(g('Montant TTC'), 'ttc');
  assert.equal(g('Total HT'), 'montant');
  assert.equal(g('Taux TVA'), 'tva');
  assert.equal(g('Tva)'), 'tva');
  assert.equal(g('Remise'), 'remise');
  assert.equal(g('Unité'), 'unite');
  assert.equal(g('N°'), 'num');
  assert.equal(g('Client'), null);
});

test('colonnesDuTitre : désignation et une colonne chiffrée ; « N° Désignation » collés séparés', () => {
  const r = construireRangees(mots(0, [[40, 'N° Désignation'], [270, 'Unité'], [330, 'Qté'], [380, 'P.U. HT'], [450, 'TVA'], [500, 'Montant HT']]));
  assert.deepEqual(colonnesDuTitre(r[0]).map((c) => c.genre), ['num', 'des', 'unite', 'qte', 'pu', 'tva', 'montant']);
  const pasUnTitre = construireRangees(mots(0, [[40, 'N° Facture'], [200, 'Date'], [300, 'Code client']]));
  assert.equal(colonnesDuTitre(pasUnTitre[0]), null);
});

test('cellules : un blanc de plus d\'une hauteur de texte sépare deux colonnes', () => {
  const r = construireRangees(mots(0, [[40, 'Farine T45 sac 25 kg'], [270, '2'], [330, '41,500']]));
  assert.deepEqual(cellules(r[0]).map((c) => c.texte), ['Farine T45 sac 25 kg', '2', '41,500']);
});

test('lireLignes : tableau de logiciel (N°, unité, TVA), arrêt aux totaux', () => {
  const p = page([
    [100, [[40, 'Facture N° FV-1'], [400, 'Date : 03/10/2026']]],
    [200, [[40, 'N°'], [65, 'Désignation'], [270, 'Unité'], [330, 'Qté'], [380, 'P.U. HT'], [450, 'TVA'], [500, 'Montant HT']]],
    [220, [[45, '1'], [65, 'Farine pâtissière T45 sac 25 kg'], [270, 'sac'], [340, '2'], [380, '41,500'], [455, '7%'], [500, '83,000']]],
    [240, [[45, '2'], [65, 'Lait UHT 1 L'], [270, 'pack 6'], [340, '5'], [380, '8,700'], [455, '7%'], [500, '43,500']]],
    [280, [[350, 'Total HT'], [500, '126,500']]],
    [300, [[350, 'TVA 7%'], [500, '8,855']]],
  ]);
  assert.deepEqual(simple(lireLignes([p], 'pdf')), [
    ['Farine pâtissière T45 sac 25 kg', 2, 41.5, null, 7, 83, true],
    ['Lait UHT 1 L', 5, 8.7, null, 7, 43.5, true],
  ]);
  assert.equal(lireLignes([p], 'pdf')[0].unite, 'sac');
  assert.equal(lireLignes([p], 'pdf')[0].cadre.page, 1);
});

test('lireLignes : remise par ligne, montant net ; désignation sur deux rangées ; référence', () => {
  const p = page([
    [200, [[40, 'Réf.'], [90, 'Désignation'], [300, 'Qté'], [350, 'Prix unit.'], [420, 'Remise'], [470, 'TVA'], [510, 'Montant net']]],
    [220, [[40, 'P310'], [90, 'Thon à l\'huile 160 g'], [305, '3'], [350, '132,000'], [425, '5%'], [470, '19%'], [510, '376,200']]],
    [231, [[90, '(carton 48)']]],
    [250, [[40, 'P311'], [90, 'Riz long 5 kg'], [305, '6'], [350, '17,250'], [470, '7%'], [510, '103,500']]],
    [290, [[350, 'Net HT'], [510, '479,700']]],
  ]);
  const ls = lireLignes([p], 'pdf');
  assert.deepEqual(simple(ls), [
    ["Thon à l'huile 160 g (carton 48)", 3, 132, 5, 19, 376.2, true],
    ['Riz long 5 kg', 6, 17.25, null, 7, 103.5, true],
  ]);
  assert.deepEqual(ls.map((l) => l.reference), ['P310', 'P311']);
});

test('lireLignes : colonnes mal rangées sur une image → les nombres sont expliqués par le calcul', () => {
  // « Qté » perdu à la lecture : le 2 tombe sous « Unité », le prix sous « TVA ».
  const p = page([
    [200, [[40, 'Désignation'], [300, 'Unité'], [450, 'TVA'], [510, 'MontantHT']]],
    [220, [[40, 'Beurre doux plaque 1 kg'], [300, 'kg'], [370, '2'], [420, '24,600'], [460, '19%'], [510, '49,200']]],
  ]);
  assert.deepEqual(simple(lireLignes([p], 'ocr')), [['Beurre doux plaque 1 kg', 2, 24.6, null, 19, 49.2, true]]);
});

test('lireLignes : ticket de caisse (« 2 x 1.350 ») sans titre de colonnes', () => {
  const p = page([
    [100, [[10, 'FACTURE N° 0004120-11']]],
    [130, [[10, 'LAIT 1L']]],
    [140, [[20, '6 x 1.350'], [170, '8.100']]],
    [160, [[10, 'EAU 1.5L']]],
    [170, [[20, '12 x 0.720'], [170, '8.640']]],
    [200, [[10, 'TOTAL HT'], [170, '16.740']]],
  ], 400, 226);
  assert.deepEqual(simple(lireLignes([p], 'pdf')), [['LAIT 1L', 6, 1.35, null, null, 8.1, true], ['EAU 1.5L', 12, 0.72, null, null, 8.64, true]]);
});

test('lireLignes : sans titre lisible (photo), seules les rangées dont le calcul se vérifie', () => {
  const p = page([
    [100, [[40, 'Tél. 72 285 600'], [300, 'M.F 1234567A/A/M/000']]],
    [200, [[40, 'Eau minérale 1,5 L (pack 6)'], [300, '5'], [360, '3,600'], [430, '7%'], [500, '18,000']]],
    [220, [[40, 'Consigne casier verre'], [300, '10'], [360, '6,000'], [500, '60,000']]],
    [240, [[40, 'Boisson cola'], [300, '3'], [500, '9,900']]],
    [280, [[350, 'Total HT'], [500, '87,900']]],
  ]);
  assert.deepEqual(simple(lireLignes([p], 'ocr')), [
    ['Eau minérale 1,5 L (pack 6)', 5, 3.6, null, 7, 18, true],
    ['Consigne casier verre', 10, 6, null, null, 60, true],
  ]);
});

test('lireLignes : valeur manquante déduite des deux autres, à relire ; contrôle faux signalé', () => {
  const p = page([
    [200, [[40, 'Désignation'], [300, 'Qté'], [360, 'Prix'], [500, 'Montant']]],
    [220, [[40, 'Pain baguette'], [305, '105'], [500, '19,950']]],
    [240, [[40, 'Croissant beurre'], [305, '40'], [360, '0,900'], [500, '37,000']]],
  ]);
  const ls = lireLignes([p], 'pdf');
  assert.deepEqual([ls[0].prixUnitaire, ls[0].aRelire, ls[0].controle], [0.19, true, true]);
  assert.deepEqual([ls[1].controle, ls[1].aRelire], [false, true]);
});

test('deduire : quantité × prix (− remise %) = dernier nombre ; TVA parmi les taux tunisiens', () => {
  assert.deepEqual(deduire([{ valeur: 3, pourcent: false }, { valeur: 132, pourcent: false }, { valeur: 5, pourcent: true }, { valeur: 19, pourcent: true }, { valeur: 376.2, pourcent: false }], 0.0015),
    { qte: 3, pu: 132, remise: 5, tva: 19, montant: 376.2 });
  assert.equal(deduire([{ valeur: 3, pourcent: false }, { valeur: 9.9, pourcent: false }], 0.0015), null);
});

test('bandeDuTableau, lignesDouteuses : zone relue sur une image et quand la relire', () => {
  const p = page([
    [100, [[40, 'Facture N° 12']]],
    [200, [[40, 'Désignation'], [300, 'Qté'], [360, 'Prix'], [500, 'Montant']]],
    [220, [[40, 'Pain baguette'], [305, '105'], [360, '0,190'], [500, '19,950']]],
    [400, [[350, 'Total HT'], [500, '19,950']]],
  ]);
  const b = bandeDuTableau(p);
  assert.ok(b.y0 < 200 && b.y0 > 100 && b.y1 > 400 && b.y1 < 420, JSON.stringify(b));
  const sur = { lignesFacture: lireLignes([p], 'pdf'), totaux: { ht: 19.95, remise: null } };
  assert.equal(lignesDouteuses(sur), false);
  assert.equal(lignesDouteuses({ ...sur, totaux: { ht: 25, remise: null } }), true);
  assert.equal(lignesDouteuses({ ...sur, lignesFacture: [] }), true);
});

test('relecture : titre « Désignation » centré — la désignation garde ses premiers mots ; référence prise seulement si c\'est un code', () => {
  const p = page([
    [200, [[40, 'N°'], [140, 'Désignation'], [300, 'Qté'], [360, 'Prix'], [500, 'Montant']]],
    [220, [[45, '1'], [65, 'Lait demi-écrémé 1 L'], [305, '5'], [360, '8,700'], [500, '43,500']]],
    [240, [[45, '2'], [65, 'Farine T45 sac 25 kg'], [305, '1'], [360, '41,500'], [500, '41,500']]],
  ]);
  assert.deepEqual(lireLignes([p], 'pdf').map((l) => l.designation), ['Lait demi-écrémé 1 L', 'Farine T45 sac 25 kg']);
  const r = page([
    [200, [[40, 'Réf.'], [150, 'Désignation'], [300, 'Qté'], [360, 'Prix'], [500, 'Montant']]],
    [220, [[40, 'B07'], [75, 'Lait entier 1 L'], [305, '5'], [360, '8,700'], [500, '43,500']]],
    [240, [[75, 'Transport marchandise'], [305, '1'], [360, '10,000'], [500, '10,000']]],
  ]);
  assert.deepEqual(lireLignes([r], 'pdf').map((l) => [l.reference, l.designation]), [['B07', 'Lait entier 1 L'], [null, 'Transport marchandise']]);
});

test('relecture : « Base pizza » et « Yaourt nature … colis » restent des lignes (ni fin du tableau, ni nouveau titre)', () => {
  const p = page([
    [200, [[40, 'Désignation'], [250, 'Unité'], [300, 'Qté'], [360, 'Prix'], [500, 'Montant']]],
    [220, [[40, 'Base pizza tomate 5 kg'], [250, 'kg'], [305, '2'], [360, '12,000'], [500, '24,000']]],
    [240, [[40, 'Yaourt nature 125 g'], [250, 'colis'], [305, '3'], [360, '9,000'], [500, '27,000']]],
    [260, [[40, 'Riz long 5 kg'], [250, 'sac'], [305, '1'], [360, '17,250'], [500, '17,250']]],
    [300, [[350, 'Total HT'], [500, '68,250']]],
  ]);
  assert.deepEqual(lireLignes([p], 'pdf').map((l) => [l.designation, l.montant]), [['Base pizza tomate 5 kg', 24], ['Yaourt nature 125 g', 27], ['Riz long 5 kg', 17.25]]);
});

test('relecture : colonnes TTC seules ramenées en HT avec le taux de la ligne (à relire)', () => {
  const p = page([
    [200, [[40, 'Désignation'], [300, 'Qté'], [350, 'P.U. TTC'], [430, 'TVA'], [500, 'Montant TTC']]],
    [220, [[40, 'Fromage râpé'], [305, '2'], [350, '5,950'], [435, '19%'], [500, '11,900']]],
  ]);
  const [l] = lireLignes([p], 'pdf');
  assert.deepEqual([l.montant, l.prixUnitaire, l.tauxTva, l.luEnTtc, l.aRelire], [10, 5, 19, true, true]);
});

test('relecture : un intertitre n\'est collé à aucune ligne ; une rangée de remise ou de TVA au pied n\'est pas une ligne', () => {
  const p = page([
    [200, [[40, 'Désignation'], [300, 'Qté'], [360, 'Prix'], [500, 'Montant']]],
    [220, [[40, 'BOISSONS']]],
    [240, [[40, 'Eau minérale 1,5 L'], [305, '6'], [360, '0,600'], [500, '3,600']]],
    [260, [[40, 'Remise 5%'], [500, '0,180']]],
    [280, [[40, 'Jus orange'], [305, '1'], [360, '2,000'], [500, '2,000']]],
  ]);
  assert.deepEqual(lireLignes([p], 'pdf').map((l) => l.designation), ['Eau minérale 1,5 L']);
});

test('relecture : sans titre (photo), une rangée qui commence par un n° est lue', () => {
  const p = page([
    [200, [[40, '3'], [70, 'Eau minérale 1,5 L'], [300, '5'], [360, '3,600'], [500, '18,000']]],
    [280, [[350, 'Total HT'], [500, '18,000']]],
  ]);
  assert.deepEqual(lireLignes([p], 'ocr').map((l) => [l.designation, l.quantite, l.montant]), [['Eau minérale 1,5 L', 5, 18]]);
});

test('relecture : première rangée gardée pour la clé (n° de lot dessous)', () => {
  const p = page([
    [200, [[40, 'Désignation'], [300, 'Qté'], [360, 'Prix'], [500, 'Montant']]],
    [220, [[40, 'Farine T45 sac 25 kg'], [305, '1'], [360, '41,500'], [500, '41,500']]],
    [231, [[40, '(lot 2345 dlc 12/2026)']]],
  ]);
  const [l] = lireLignes([p], 'pdf');
  assert.deepEqual([l.designation, l.designationPremiere], ['Farine T45 sac 25 kg (lot 2345 dlc 12/2026)', 'Farine T45 sac 25 kg']);
});
