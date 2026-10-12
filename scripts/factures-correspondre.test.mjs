// Tests des correspondances (étape F3 — src/components/client/factures/lecture/correspondre.ts) : clé d'apprentissage
// (MÊMES VECTEURS que le serveur, test/facturesF3.test.js), conversion proposée, article proposé.
// node --test scripts/factures-correspondre.test.mjs (Node ≥ 23.6 : types effacés).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  articlesProbables, cleDeLigne, ecartDePrix, prixParUniteDeStock, proposer, proposerConversion, ressemblanceArticle,
} from '../src/components/client/factures/lecture/correspondre.ts';

const VECTEURS = [
  ['Farine pâtissière T45 sac 25 kg', null, 'des:farine patissiere t45 sac 25 kg'],
  ['  EAU MINÉRALE 1,5 L (pack 6) ', '', 'des:eau minerale 1,5 l pack 6'],
  ['Eau minérale 1.5L', null, 'des:eau minerale 1,5l'],
  ['Œufs calibre M — plateau 30', null, 'des:oeufs calibre m plateau 30'],
  ["Thon à l'huile 160 g (carton 48)", null, 'des:thon a l huile 160 g carton 48'],
  ['Barquette alu', ' p 310 ', 'ref:P310'],
  ['Poulet, entier', 'ré-12', 'ref:RE12'],
  ['Eau minérale', 'EAU.15', 'ref:EAU15'],
  ['Tiret seul', ' - ', 'des:tiret seul'],
  ['', '', null],
];

test('cleDeLigne : mêmes vecteurs que le serveur', () => {
  for (const [designation, reference, attendu] of VECTEURS) assert.equal(cleDeLigne({ designation, reference }), attendu, `${designation} / ${reference}`);
});

test('proposerConversion : contenants, tailles, lots, changement d\'unité', () => {
  const n = (d, u, s) => proposerConversion(d, u, s).n;
  assert.equal(n('Farine pâtissière T45 sac 25 kg', 'sac', 'kg'), 25);
  assert.equal(n('Lait UHT demi-écrémé 1 L', 'pack 6', 'L'), 6);
  assert.equal(n('Tomate concentrée 4/4 (carton 12)', 'carton', 'boîte'), 12);
  assert.equal(n('Eau minérale 1,5 L (pack 6)', 'pack', 'bouteille'), 6);
  assert.equal(n('Eau minérale 1,5 L (pack 6)', 'pack', 'L'), 9);
  assert.equal(n("Thon à l'huile 160 g (carton 48)", 'carton', 'kg'), 7.68);
  assert.equal(n('Œufs calibre M', 'plateau 30', 'pièce'), 30);
  assert.equal(n('Levure boulangère 500 g', 'paquet', 'kg'), 0.5);
  assert.equal(n('Boisson citron 33 cl (pack 24)', 'pack', 'L'), 7.92);
  assert.equal(n('JUS 12X1L', 'carton', 'L'), 12);
  assert.equal(n('YAOURT NATURE x4', 'u', 'pièce'), 4);
  assert.equal(n('Beurre doux plaque 1 kg', 'kg', 'kg'), 1);
  assert.equal(n('Sucre', 'kg', 'g'), 1000);
  assert.equal(n('Poulet entier', 'KG', 'kg'), 1);
  const rien = proposerConversion('Persil', 'botte', 'botte');
  assert.deepEqual([rien.n, rien.sure], [1, false]);
});

const ctx = {
  articles: [
    { id: 1, nom: 'Farine', unite: 'kg', selectionne: true },
    { id: 2, nom: 'Farine complète', unite: 'kg', selectionne: false },
    { id: 3, nom: 'Eau minérale', unite: 'bouteille', selectionne: true },
    { id: 4, nom: 'Lait', unite: 'L', selectionne: true },
    { id: 5, nom: 'Poulet', unite: 'kg', selectionne: true },
  ],
  achats: [{ articleId: 4, dernierPrix: 1.45, derniereDate: '2026-10-01', nbAchats: 3 }],
  correspondances: [
    { id: 10, cle: 'ref:EAU15', designation: 'Eau minérale 1,5 L (pack 6)', reference: 'EAU-15', uniteFacture: 'pack', articleId: 3, horsStock: null, conversion: 6, emplois: 2 },
    { id: 11, cle: 'des:frais de transport', designation: 'Frais de transport', reference: null, uniteFacture: null, articleId: null, horsStock: 'transport', conversion: 1, emplois: 1 },
    { id: 12, cle: 'des:poulet entier', designation: 'POULET ENTIER', reference: null, uniteFacture: 'KG', articleId: 5, horsStock: null, conversion: 1, emplois: 4 },
  ],
};

test('proposer : reconnue par la référence (lue autrement), avec la conversion apprise', () => {
  const p = proposer({ designation: 'EAU MIN 1.5L', reference: 'eau 15', unite: 'pack' }, ctx);
  assert.deepEqual([p.etat, p.articleId, p.conversion, p.conversionSure], ['reconnue', 3, 6, true]);
  assert.match(p.raison, /2 factures/);
});

test('proposer : reconnue par la désignation ; hors stock appris', () => {
  assert.deepEqual(['etat', 'articleId'].map((k) => proposer({ designation: 'Poulet  entier', unite: 'KG' }, ctx)[k]), ['reconnue', 5]);
  const t = proposer({ designation: 'Frais de transport' }, ctx);
  assert.deepEqual([t.etat, t.horsStock, t.articleId], ['reconnue', 'transport', null]);
});

test('proposer : voisine d\'une ligne apprise → proposée ; transport, consigne reconnus aux mots', () => {
  const v = proposer({ designation: 'POULET ENTIER PAC', unite: 'KG' }, ctx);
  assert.deepEqual([v.etat, v.articleId, v.conversion], ['proposee', 5, 1]);
  assert.deepEqual(['etat', 'horsStock'].map((k) => proposer({ designation: 'Consigne casier verre' }, ctx)[k]), ['proposee', 'consigne']);
  assert.deepEqual(['etat', 'horsStock'].map((k) => proposer({ designation: 'Frais de livraison' }, ctx)[k]), ['proposee', 'livraison']);
});

test('proposer : nom d\'article dans la désignation → proposé (le plus précis), avec sa conversion ; sinon à choisir', () => {
  const f = proposer({ designation: 'Farine pâtissière T45 sac 25 kg', unite: 'sac' }, ctx);
  assert.deepEqual([f.etat, f.articleId, f.conversion, f.conversionSure], ['proposee', 1, 25, true]);
  const fc = proposer({ designation: 'FARINE COMPLETE 5KG', unite: 'sac' }, ctx);
  assert.deepEqual([fc.articleId, fc.conversion], [2, 5]);
  const l = proposer({ designation: 'Lait UHT demi-écrémé 1 L', unite: 'pack 6' }, ctx);
  assert.deepEqual([l.etat, l.articleId, l.conversion], ['proposee', 4, 6]);
  assert.equal(proposer({ designation: 'Harissa 135 g (carton 24)', unite: 'carton' }, ctx).etat, 'a_choisir');
});

test('articlesProbables : déjà achetés chez ce fournisseur d\'abord, puis les plus ressemblants', () => {
  const ids = articlesProbables('Farine T45', ctx).map((a) => a.id);
  assert.equal(ids[0], 4, 'le lait, déjà acheté chez ce fournisseur, en tête');
  assert.equal(ids[1], 1);
  assert.equal(ressemblanceArticle('Farine pâtissière T45 sac 25 kg', 'Farine'), 1);
  assert.equal(ressemblanceArticle('Huile de tournesol', 'Farine'), 0);
});

test('prixParUniteDeStock, ecartDePrix', () => {
  assert.equal(prixParUniteDeStock(83, 2, 25), 1.66);
  assert.equal(prixParUniteDeStock(10, 3, 0.333333), 10);
  assert.equal(prixParUniteDeStock(null, 2, 1), null);
  assert.equal(ecartDePrix(1.9, 1.45), 31);
  assert.equal(ecartDePrix(1.5, null), null);
});
