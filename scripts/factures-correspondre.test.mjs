// Tests des correspondances (étape F3 — src/components/client/factures/lecture/correspondre.ts) : clé d'apprentissage
// (MÊMES VECTEURS que le serveur, test/facturesF3.test.js), conversion proposée, article proposé.
// node --test scripts/factures-correspondre.test.mjs (Node ≥ 23.6 : types effacés).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  articlesProbables, cleDeLigne, ecartArrondiStock, ecartDePrix, prixParUniteDeStock, probablesPour, proposer, proposerConversion,
  ressemblanceArticle, totauxRecalcules,
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
  ['Numéro de ligne pris pour une réf.', '12', 'des:numero de ligne pris pour une ref'],
  ['Code court', '160', 'ref:160'],
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
  const memeUnite = proposerConversion('Persil', 'botte', 'botte');
  assert.deepEqual([memeUnite.n, memeUnite.sure], [1, true], 'même unité écrite pareil : sûr');
  const rien = proposerConversion('Persil', null, 'botte');
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

test('relecture : même réf. mais désignation sans rapport → proposée, jamais reconnue', () => {
  const p = proposer({ designation: 'Huile de tournesol 5 L', reference: 'EAU-15', unite: 'bidon' }, ctx);
  assert.equal(p.etat, 'proposee');
  assert.match(p.raison, /même réf\./);
});

test('relecture : clé cherchée sur la première rangée lue (un n° de lot dessous ne change rien)', () => {
  const p = proposer({ designation: 'POULET ENTIER Lot 2345 DLC 12/2026', designationPremiere: 'POULET ENTIER', unite: 'KG' }, ctx);
  assert.deepEqual([p.etat, p.articleId], ['reconnue', 5]);
});

test('relecture : correction faite à la main (emplois 0) → « corrigée dans Correspondances »', () => {
  const c2 = { ...ctx, correspondances: [{ ...ctx.correspondances[2], emplois: 0 }] };
  assert.equal(proposer({ designation: 'POULET ENTIER', unite: 'KG' }, c2).raison, 'corrigée dans Correspondances');
});

test('relecture : totaux — déconsigne négative hors remise et FODEC (même calcul que le serveur)', () => {
  const r = totauxRecalcules([
    { quantite: 10, montant: 100, tauxTva: 0, conversion: 6 },
    { quantite: 5, montant: 30, tauxTva: 0, conversion: null },
    { quantite: 4, montant: -24, tauxTva: 0, conversion: null },
  ], { remiseGlobale: 10 });
  assert.deepEqual(r.couts.map((c) => Math.round(c * 1000) / 1000), [92.308, 27.692, -24]);
  assert.equal(r.ht, 96);
});

test('relecture : prix par g trop petit pour le millime signalé ; au kg, rien', () => {
  assert.ok(ecartArrondiStock(83, 2, 25000, 0.002) > 0);
  assert.equal(ecartArrondiStock(83, 2, 25, 1.66), null);
});

test('relecture : articles classés une fois par contexte, même résultat qu\'articlesProbables', () => {
  const f = probablesPour(ctx);
  assert.deepEqual(f('Farine T45').map((a) => a.id), articlesProbables('Farine T45', ctx).map((a) => a.id));
  assert.equal(f('Farine T45'), f('Farine T45'), 'gardé en mémoire');
});
