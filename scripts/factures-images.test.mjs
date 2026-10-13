// Tests de l'étape F5 des factures fournisseur — préparation des IMAGES (src/components/client/factures/lecture/image.ts),
// trajet d'une page lue vers l'image d'origine, mise en page apprise d'un fournisseur (lignes.ts), orientation (chaineOcr.ts).
// node --test scripts/factures-images.test.mjs (Node ≥ 23.6 : types effacés). Images fabriquées pixel par pixel ; la
// mesure sur le jeu de factures fictives est dans labflow-reprise/achats-compta/ESSAI-FACTURES.md §8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accentuer, cadreSurOriginal, depuisCadrePage, eclaircirZonesFoncees, effacerTraits, egaliserFond, ordonnerCoins, redresserFeuille,
  tailleFeuille, tournerPixels, tournerQuart, trouverFeuille, versCadrePage, versOriginal,
} from '../src/components/client/factures/lecture/image.ts';
import { construireRangees } from '../src/components/client/factures/lecture/rangees.ts';
import { lireTableaux } from '../src/components/client/factures/lecture/lignes.ts';
import { completer, ajouterPages, motsLisibles, pageCouchee } from '../src/components/client/factures/lecture/chaineOcr.ts';

const vierge = (w, h, v = 255) => ({ data: new Uint8ClampedArray(w * h).fill(v), width: w, height: h });
const px = (g, x, y) => g.data[y * g.width + x];
const rect = (g, x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.data[y * g.width + x] = v; };

test('tournerQuart : un quart de tour horaire, deux, trois ; quatre = rien', () => {
  const g = vierge(4, 2);
  g.data[0] = 0; // pixel (0, 0) noir
  const q1 = tournerQuart(g, 1);
  assert.deepEqual([q1.width, q1.height], [2, 4]);
  assert.equal(px(q1, 1, 0), 0, 'le coin haut gauche passe en haut à droite');
  const q2 = tournerQuart(g, 2);
  assert.equal(px(q2, 3, 1), 0, 'en bas à droite');
  const q3 = tournerQuart(g, 3);
  assert.equal(px(q3, 0, 3), 0, 'en bas à gauche');
  assert.equal(tournerQuart(g, 4), g);
});

test('tournerPixels : cadre agrandi, fond blanc, centre conservé', () => {
  const g = vierge(100, 50, 0);
  const r = tournerPixels(g, Math.PI / 2);
  assert.deepEqual([r.width, r.height], [50, 100]);
  assert.equal(px(r, 25, 50), 0);
  const r30 = tournerPixels(vierge(100, 100, 0), Math.PI / 6);
  assert.ok(r30.width > 100 && r30.height > 100);
  assert.equal(px(r30, 0, 0), 255, 'les coins ajoutés sont blancs');
});

// Une feuille blanche (texte noir) posée de travers sur une table foncée.
function photo(w = 400, h = 520, angle = 0.08) {
  const g = vierge(w, h, 90);
  const cx = w / 2, cy = h / 2, lw = 140, lh = 200;
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      if (Math.abs(u) <= lw && Math.abs(v) <= lh) g.data[y * w + x] = ((Math.abs(v) % 30) < 4 && Math.abs(u) < 100) ? 30 : 245;
    }
  }
  return g;
}

test('trouverFeuille : les quatre coins d\'une feuille de travers sur une table ; null pour un scan', () => {
  const g = photo();
  const coins = trouverFeuille(g);
  assert.ok(coins, 'feuille trouvée');
  const [l, h] = tailleFeuille(coins);
  assert.ok(Math.abs(l - 281) < 14 && Math.abs(h - 401) < 14, `taille ${l} × ${h}`);
  // Haut gauche plus haut que bas gauche, haut droit à droite du haut gauche.
  assert.ok(coins[0].y < coins[3].y && coins[1].x > coins[0].x);
  const redressee = redresserFeuille(g, coins);
  assert.ok(px(redressee, 5, 5) > 200 && px(redressee, redressee.width - 6, redressee.height - 6) > 200, 'plus de table dans les coins');
  assert.equal(trouverFeuille(vierge(300, 400, 240)), null, 'image uniforme');
  const scan = vierge(300, 400, 250);
  rect(scan, 40, 60, 260, 64, 20);
  assert.equal(trouverFeuille(scan), null, 'scan : la feuille est toute l\'image');
});

test('effacerTraits : traits longs et fins effacés ; texte (court) et aplat (épais) gardés', () => {
  const g = vierge(600, 300);
  rect(g, 20, 100, 580, 102, 40); // trait horizontal
  rect(g, 300, 20, 302, 280, 40); // trait vertical
  rect(g, 50, 150, 54, 172, 0); // « 1 » : trait court
  rect(g, 100, 200, 400, 240, 0); // aplat épais
  const r = effacerTraits(g);
  assert.equal(px(r, 200, 101), 255);
  assert.equal(px(r, 301, 50), 255);
  assert.equal(px(r, 52, 160), 0, 'le texte reste');
  assert.equal(px(r, 250, 220), 0, 'l\'aplat reste');
});

test('eclaircirZonesFoncees : texte clair d\'un bandeau foncé inversé ; texte noir ordinaire intact', () => {
  const g = vierge(400, 300);
  rect(g, 50, 40, 350, 140, 40); // bandeau foncé
  rect(g, 100, 80, 104, 100, 250); // trait clair (lettre) dans le bandeau
  rect(g, 100, 200, 104, 220, 0); // lettre noire hors bandeau
  const r = eclaircirZonesFoncees(g);
  assert.ok(px(r, 200, 60) > 200, 'le fond du bandeau devient clair');
  assert.ok(px(r, 102, 90) < 50, 'la lettre devient foncée');
  assert.equal(px(r, 102, 210), 0, 'texte ordinaire inchangé');
  assert.equal(px(r, 10, 10), 255, 'papier inchangé');
  assert.equal(eclaircirZonesFoncees(vierge(100, 100)).data.every((v) => v === 255), true);
});

test('egaliserFond : une ombre (dégradé) ramenée au blanc, l\'encre garde son contraste', () => {
  const g = vierge(256, 256);
  // Ombre d'une photo : environ 40 niveaux sur la largeur de cette image (la photo « penchée et ombrée » du jeu : 80 sur 2 400 px).
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) g.data[y * 256 + x] = 150 + Math.round(x * 0.15);
  rect(g, 20, 120, 24, 140, 30);
  const r = egaliserFond(g);
  assert.ok(px(r, 5, 5) > 228 && px(r, 250, 250) > 228, `papier blanc partout (${px(r, 5, 5)}, ${px(r, 250, 250)})`);
  assert.ok(px(r, 22, 130) < 90, 'l\'encre reste foncée');
});

test('accentuer : un bord flou est renforcé, une zone uniforme ne bouge pas', () => {
  const g = vierge(10, 10, 200);
  rect(g, 5, 0, 10, 10, 100);
  const r = accentuer(g, 1);
  assert.ok(px(r, 4, 5) > 200 && px(r, 5, 5) < 100);
  assert.equal(px(r, 1, 5), 200);
});

test('versOriginal : page tournée depuis l\'image d\'origine (chemin « source »)', () => {
  const t = {
    largeur: 1000, hauteur: 1400, rotation: 'source', echelle: 2, coins: null, coinsAuto: false, quarts: 0, angle: 0,
    tailles: { reduite: [2000, 2800], feuille: [2000, 2800], quarts: [1000, 1400], lue: [2000, 2800] },
  };
  assert.deepEqual(versOriginal(t, 400, 600), { x: 200, y: 300 });
});

test('versOriginal : feuille recadrée puis quart de tour — un point revient au bon endroit de la photo', () => {
  // Image réduite 800 × 1000 (échelle 0,5 d'une photo 1600 × 2000) ; feuille = rectangle (100, 50) – (700, 950).
  const coins = [[100, 50], [700, 50], [700, 950], [100, 950]];
  const t = {
    largeur: 1600, hauteur: 2000, rotation: 'pixels', echelle: 0.5, coins, coinsAuto: true, quarts: 1, angle: 0,
    tailles: { reduite: [800, 1000], feuille: [600, 900], quarts: [900, 600], lue: [900, 600] },
  };
  // Un quart de tour horaire : le haut gauche de la feuille est en haut à droite de la page lue.
  const p = versOriginal(t, 900, 0);
  assert.ok(Math.abs(p.x - 200) < 1e-6 && Math.abs(p.y - 100) < 1e-6, JSON.stringify(p));
  const c = cadreSurOriginal(t, { x0: 0, y0: 0, x1: 900, y1: 600 });
  assert.ok(Math.abs(c.x0 - 200 / 1600) < 1e-9 && Math.abs(c.y1 - 1900 / 2000) < 1e-9, JSON.stringify(c));
});

// ── Mise en page apprise ──
const mots = (y, blocs, h = 10) => blocs.flatMap(([x, texte]) => {
  let cx = x;
  return texte.split(' ').filter(Boolean).map((t) => { const m = { t, x0: cx, x1: cx + t.length * 6, y0: y, y1: y + h }; cx += (t.length + 1) * 6; return m; });
});
const page = (lignes, largeur = 600) => ({ largeur, hauteur: 842, rangees: construireRangees(lignes.flatMap(([y, blocs]) => mots(y, blocs))) });
const tableau = (titre) => page([
  ...(titre ? [[200, [[40, 'Désignation'], [330, 'Qté'], [400, 'P.U.'], [520, 'Montant']]]] : []),
  [220, [[40, 'Farine T45 sac 25 kg'], [336, '2'], [400, '41,500'], [520, '83,000']]],
  [240, [[40, 'Sucre blanc 50 kg'], [336, '1'], [400, '92,000'], [520, '92,000']]],
  [270, [[400, 'Total HT'], [520, '175,000']]],
]);

test('mise en page : vue sur un tableau à titres (fractions de la page), employée quand le titre est illisible', () => {
  const vu = lireTableaux([tableau(true)], 'pdf');
  assert.equal(vu.lignes.length, 2);
  assert.ok(vu.miseEnPage && vu.miseEnPage.colonnes.length === 4);
  assert.deepEqual(vu.miseEnPage.colonnes.map((c) => c.genre), ['des', 'qte', 'pu', 'montant']);
  assert.ok(vu.miseEnPage.colonnes.every((c) => c.x0 >= 0 && c.x1 <= 1 && c.x0 < c.x1));
  assert.equal(vu.modeleEmploye, false);
  // Sans titre, sans mise en page : seules les rangées dont le calcul se vérifie (ici, toutes).
  const sans = lireTableaux([tableau(false)], 'ocr');
  // Sans titre, avec la mise en page connue : le tableau se lit par colonnes.
  const avec = lireTableaux([tableau(false)], 'ocr', vu.miseEnPage);
  assert.equal(avec.modeleEmploye, true);
  assert.deepEqual(avec.lignes.map((l) => [l.designation, l.quantite, l.prixUnitaire, l.montant]),
    [['Farine T45 sac 25 kg', 2, 41.5, 83], ['Sucre blanc 50 kg', 1, 92, 92]]);
  assert.ok(sans.lignes.length <= 2);
});

test('mise en page : un titre de colonne mal lu est complété par la colonne connue', () => {
  const vu = lireTableaux([tableau(true)], 'pdf').miseEnPage;
  const malLu = page([
    [200, [[40, 'Désignation'], [330, 'xx'], [400, 'P.U.'], [520, 'Montant']]],
    [220, [[40, 'Farine T45 sac 25 kg'], [336, '2'], [400, '41,500'], [520, '83,000']]],
  ]);
  const r = lireTableaux([malLu], 'ocr', vu);
  assert.equal(r.modeleEmploye, true);
  assert.equal(r.lignes[0].quantite, 2);
  assert.equal(r.lignes[0].controle, true);
});

test('completer et ajouterPages : la mise en page vue et l\'emploi d\'une mise en page connue suivent', () => {
  const base = { source: 'ocr', matricule: null, nom: null, adresse: null, telephone: null, email: null, numero: null, date: null,
    totaux: { ht: null, remise: null, fodec: null, tva: null, timbre: null, ttc: null, parTaux: [], coherents: null }, lignes: [], lignesFacture: [], pages: [], avertissements: [] };
  const m = { colonnes: [{ genre: 'des', x0: 0.1, x1: 0.3 }, { genre: 'montant', x0: 0.8, x1: 0.9 }] };
  assert.deepEqual(completer({ ...base }, { ...base, miseEnPage: m }).miseEnPage, m);
  assert.equal(ajouterPages({ ...base, miseEnPageConnue: false }, { ...base, miseEnPageConnue: true }).miseEnPageConnue, true);
});

test('orientation : peu de mots lisibles, et peu au regard des mots reconnus → page couchée', () => {
  const m = (t, c) => ({ t, c, x0: 0, x1: 1, y0: 0, y1: 1 });
  const droite = [...Array(40)].map(() => m('Farine', 90)).concat([...Array(40)].map(() => m('12,500', 90)));
  const couchee = [...Array(8)].map(() => m('Fanne', 75)).concat([...Array(90)].map(() => m('|l', 30)));
  assert.equal(motsLisibles(droite), 40);
  assert.equal(pageCouchee(droite), false);
  assert.equal(pageCouchee(couchee), true);
  assert.equal(pageCouchee([...Array(12)].map(() => m('Total', 95))), false, 'page courte mais lisible (totaux seuls)');
});

// ── Relecture des écrans (13/10) ──
test('relecture : une ombre forte (texte noir sur papier gris foncé) n\'est pas inversée ; un bandeau à texte clair l\'est', () => {
  const ombre = vierge(400, 300, 85);
  rect(ombre, 100, 120, 104, 140, 25); // lettre noire dans l'ombre
  rect(ombre, 200, 120, 204, 140, 25);
  const r = eclaircirZonesFoncees(ombre);
  assert.equal(px(r, 102, 130), 25, 'texte noir de l\'ombre inchangé');
  assert.equal(px(r, 50, 50), 85, 'ombre inchangée');
  // Bandeau foncé sur une page blanche, avec une ligne de texte clair (lettres de 4 × 20 px tous les 12 px).
  const bandeau = vierge(400, 300, 250);
  rect(bandeau, 40, 80, 360, 200, 40);
  for (let x = 80; x < 320; x += 12) rect(bandeau, x, 120, x + 4, 140, 240);
  const rb = eclaircirZonesFoncees(bandeau);
  assert.ok(px(rb, 82, 130) < 60, 'texte clair du bandeau devenu foncé');
  assert.ok(px(rb, 60, 100) > 200, 'fond du bandeau devenu clair');
  assert.equal(px(rb, 10, 10), 250, 'page autour inchangée');
});

test('relecture : un scan à bandeaux foncés en haut et en bas n\'est pas une feuille posée (pas de recadrage)', () => {
  const g = vierge(300, 400, 245);
  rect(g, 0, 0, 300, 60, 40);
  rect(g, 0, 340, 300, 400, 40);
  assert.equal(trouverFeuille(g), null);
});

test('relecture : coins posés dans le désordre remis dans l\'ordre ; cadre croisé ou minuscule refusé', () => {
  const o = ordonnerCoins([[0.9, 0.9], [0.1, 0.1], [0.1, 0.9], [0.9, 0.1]]);
  assert.deepEqual(o, [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]);
  assert.deepEqual(ordonnerCoins([[0.1, 0.1], [0.1, 0.9], [0.9, 0.9], [0.9, 0.1]]), o, 'sens inverse : remis dans l\'ordre (pas de miroir)');
  assert.equal(ordonnerCoins([[0.1, 0.1], [0.12, 0.1], [0.12, 0.12], [0.1, 0.12]]), null, 'trop petit');
  assert.equal(ordonnerCoins([[0.1, 0.1], [0.9, 0.1]]), null);
});

test('relecture : cadre de la page droite — aller-retour exact (feuille, quart de tour, angle ; chemin « source »)', () => {
  const pixels = {
    largeur: 1600, hauteur: 2000, rotation: 'pixels', echelle: 0.5, coins: [[100, 50], [700, 50], [700, 950], [100, 950]], coinsAuto: true, quarts: 1, angle: 0.03,
    tailles: { reduite: [800, 1000], feuille: [600, 900], quarts: [900, 600], lue: [917, 626] },
  };
  const source = {
    largeur: 1000, hauteur: 1400, rotation: 'source', echelle: 1.6, coins: null, coinsAuto: false, quarts: 0, angle: -0.02,
    tailles: { reduite: [1714, 2400], feuille: [1714, 2400], quarts: [1028, 1419], lue: [1645, 2270] },
  };
  for (const t of [pixels, source]) {
    for (const [fx, fy] of [[0, 0], [0.25, 0.5], [0.9, 0.1], [1, 1]]) {
      const p = depuisCadrePage(t, fx, fy);
      const f = versCadrePage(t, p.x, p.y);
      assert.ok(Math.abs(f.x - fx) < 1e-9 && Math.abs(f.y - fy) < 1e-9, `${t.rotation} ${fx},${fy} → ${JSON.stringify(f)}`);
    }
  }
});

test('relecture : une page presque vide n\'est jamais « couchée » (pas trois lectures pour rien)', () => {
  const m = (t, c) => ({ t, c, x0: 0, x1: 1, y0: 0, y1: 1 });
  assert.equal(pageCouchee([m('Total', 95), m('500,000', 90), m('TVA', 60)]), false);
  assert.equal(pageCouchee([...Array(25)].map(() => m('|l', 20))), false, 'moins de 30 mots');
});
