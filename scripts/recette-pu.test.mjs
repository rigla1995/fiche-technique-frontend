// Tests de l'unité des produits utilisables (étape P1 — src/utils/recettePU.ts) : recette saisie pour la quantité
// produite, enregistrée pour 1 unité (MÊMES VALEURS que le serveur, test/produitsUnite.test.js), et retour à la
// formule saisie à la modification.
// node --test scripts/recette-pu.test.mjs (Node ≥ 23.6 : types effacés).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECIMALES_RECETTE, fmtQuantite, lireQuantiteProduite, pourLaRecette, pourUneUnite } from '../src/utils/recettePU.ts';

test('pourUneUnite : la sauce tomate (2 kg de concentré, 30 g de sel pour 4,6 kg)', () => {
  assert.equal(DECIMALES_RECETTE, 6);
  assert.equal(pourUneUnite(2, 4.6), 0.434783);
  assert.equal(pourUneUnite(0.03, 4.6), 0.006522);
  assert.equal(pourUneUnite(1.5, 1), 1.5);
  // Une recette qui fait 10 pièces : 1 kg de pâte → 0,1 kg par pièce.
  assert.equal(pourUneUnite(1, 10), 0.1);
});

test('pourLaRecette : on retrouve la formule saisie (aller-retour)', () => {
  for (const [q, lignes] of [[4.6, [2, 0.03, 0.75, 1.2]], [10, [1, 0.125]], [0.75, [0.5, 0.004]], [1, [0.3, 2]]]) {
    for (const x of lignes) assert.equal(pourLaRecette(pourUneUnite(x, q), q), x, `${x} pour ${q}`);
  }
  // Un produit d'avant (pour 1 recette) : rien ne change.
  assert.equal(pourLaRecette(0.25, 1), 0.25);
});

test('fmtQuantite : 3 décimales au plus, à la française', () => {
  assert.equal(fmtQuantite(0.434783), '0,435');
  assert.equal(fmtQuantite(4.6), '4,6');
  assert.equal(fmtQuantite('2.000'), '2');
  assert.equal(fmtQuantite(null), '');
  assert.equal(fmtQuantite('abc'), '');
});

test('lireQuantiteProduite : nombre positif au millième, virgule acceptée', () => {
  assert.equal(lireQuantiteProduite('4.6'), 4.6);
  assert.equal(lireQuantiteProduite('4,6'), 4.6);
  assert.equal(lireQuantiteProduite('4.6004'), 4.6);
  assert.equal(lireQuantiteProduite('0'), null);
  assert.equal(lireQuantiteProduite('0.0004'), null);
  assert.equal(lireQuantiteProduite('-1'), null);
  assert.equal(lireQuantiteProduite(''), null);
});
