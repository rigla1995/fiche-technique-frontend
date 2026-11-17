// C1 « Canaux de vente » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.2) : fonctions pures de la grille
// « Configuration vente » — état enregistré d'une cellule, saisie d'un prix, case, cellules envoyées, copie d'un canal.
// Lancer : node --test scripts/canaux-vente.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANAL_DIRECT, cleCellule, lireCle, lirePrixSaisi, etatEnregistre, etatAffiche, surPrix, surCase, garder,
  celluleAEnvoyer, majorer, apercuCopie, ouvertALaSaisie,
} from '../src/components/client/ventes/canaux.ts';

const LIEN = 'lien-glovo';
const vendable = (plus = {}) => ({ id: 'av1', prix_vente: 20, actif: true, directe: true, ...plus });
const prixPresta = (plus = {}) => ({ article_vendable_id: 'av1', activite_prestataire_id: LIEN, prix_vente: 24, en_vente: true, ...plus });

test('clé d\'une cellule : aller et retour', () => {
  const cle = cleCellule('produit', 12, CANAL_DIRECT);
  assert.equal(cle, 'produit:12|directe');
  assert.deepEqual(lireCle(cle), { article_type: 'produit', article_id: 12, canal: 'directe' });
  assert.deepEqual(lireCle(cleCellule('ingredient', 3, LIEN)), { article_type: 'ingredient', article_id: 3, canal: LIEN });
});

test('lirePrixSaisi : nombre > 0 à deux décimales, virgule acceptée', () => {
  assert.equal(lirePrixSaisi('7,5'), 7.5);
  assert.equal(lirePrixSaisi(' 8.905 '), 8.91);
  assert.equal(lirePrixSaisi('0'), null);
  assert.equal(lirePrixSaisi(''), null);
  assert.equal(lirePrixSaisi('abc'), null);
  assert.equal(lirePrixSaisi('-3'), null);
});

test('etatEnregistre : vente directe', () => {
  assert.deepEqual(etatEnregistre(undefined, [], CANAL_DIRECT), { prix: null, enVente: false });
  assert.deepEqual(etatEnregistre(vendable(), [], CANAL_DIRECT), { prix: 20, enVente: true });
  assert.deepEqual(etatEnregistre(vendable({ directe: false }), [], CANAL_DIRECT), { prix: 20, enVente: false });
  assert.deepEqual(etatEnregistre(vendable({ actif: false }), [], CANAL_DIRECT), { prix: 20, enVente: false });
  // Serveur d'avant les canaux : pas de champ « directe » → la vente directe suit l'interrupteur du produit.
  assert.deepEqual(etatEnregistre({ id: 'av1', prix_vente: 20, actif: true }, [], CANAL_DIRECT), { prix: 20, enVente: true });
  // Produit réservé à un prestataire : aucun prix direct.
  assert.deepEqual(etatEnregistre(vendable({ prix_vente: 0, directe: false }), [], CANAL_DIRECT), { prix: null, enVente: false });
});

test('etatEnregistre : prestataire', () => {
  assert.deepEqual(etatEnregistre(vendable(), [prixPresta()], LIEN), { prix: 24, enVente: true });
  assert.deepEqual(etatEnregistre(vendable(), [prixPresta({ en_vente: false })], LIEN), { prix: 24, enVente: false });
  assert.deepEqual(etatEnregistre(vendable(), [prixPresta({ prix_vente: null })], LIEN), { prix: null, enVente: false });
  assert.deepEqual(etatEnregistre(vendable(), [], LIEN), { prix: null, enVente: false });
  assert.deepEqual(etatEnregistre(vendable({ actif: false }), [prixPresta()], LIEN), { prix: 24, enVente: false });
  assert.deepEqual(etatEnregistre(vendable(), [prixPresta({ activite_prestataire_id: 'autre' })], LIEN), { prix: null, enVente: false });
  assert.equal(ouvertALaSaisie(vendable(), [prixPresta()], LIEN), true);
  assert.equal(ouvertALaSaisie(vendable({ directe: false }), [prixPresta()], CANAL_DIRECT), false);
});

test('etatAffiche : sans modification, l\'enregistré tel quel', () => {
  assert.deepEqual(etatAffiche({ prix: 20, enVente: true }, undefined), { texte: '20', prix: 20, enVente: true, cochable: true, modifie: false });
  assert.deepEqual(etatAffiche({ prix: null, enVente: false }, undefined), { texte: '', prix: null, enVente: false, cochable: false, modifie: false });
  // Produit activé jadis sans prix : affiché coché, sans être compté comme une modification.
  assert.equal(etatAffiche({ prix: null, enVente: true }, undefined).modifie, false);
});

test('saisie d\'un prix : une cellule neuve se coche seule, un prix vidé décoche', () => {
  const vide = { prix: null, enVente: false };
  let ed = surPrix(vide, undefined, '2');
  assert.deepEqual(etatAffiche(vide, ed), { texte: '2', prix: 2, enVente: true, cochable: true, modifie: true });
  ed = surPrix(vide, ed, '26');
  assert.equal(etatAffiche(vide, ed).enVente, true);
  ed = surPrix(vide, ed, '');
  assert.deepEqual(etatAffiche(vide, ed), { texte: '', prix: null, enVente: false, cochable: false, modifie: false });
  assert.equal(garder(vide, ed), undefined, 'revenue à l\'enregistré : plus rien en attente');
  ed = surPrix(vide, ed, '30');
  assert.equal(etatAffiche(vide, ed).enVente, true, 'retaper un prix recoche');
});

test('saisie d\'un prix sur une cellule enregistrée : la case reste ce qu\'elle était', () => {
  const coche = { prix: 20, enVente: true };
  const decoche = { prix: 20, enVente: false };
  assert.equal(etatAffiche(coche, surPrix(coche, undefined, '22')).enVente, true);
  assert.equal(etatAffiche(decoche, surPrix(decoche, undefined, '22')).enVente, false, 'un prix gardé pour plus tard ne remet pas en vente');
  let ed = surPrix(coche, undefined, '');
  assert.equal(etatAffiche(coche, ed).enVente, false);
  ed = surPrix(coche, ed, '21');
  assert.deepEqual(etatAffiche(coche, ed), { texte: '21', prix: 21, enVente: true, cochable: true, modifie: true });
  assert.equal(garder(coche, surPrix(coche, undefined, '20')), undefined, 'même prix : rien à enregistrer');
});

test('case cliquée à la main : la saisie d\'un prix ne la touche plus', () => {
  const vide = { prix: null, enVente: false };
  let ed = surPrix(vide, undefined, '26');
  ed = surCase(ed, false);
  assert.equal(etatAffiche(vide, ed).enVente, false);
  ed = surPrix(vide, ed, '27');
  assert.equal(etatAffiche(vide, ed).enVente, false);
  // Cocher sans prix ne tient pas : la case n'est pas cochable.
  assert.deepEqual(etatAffiche(vide, surCase(undefined, true)), { texte: '', prix: null, enVente: false, cochable: false, modifie: false });
});

test('celluleAEnvoyer : seulement ce qui change', () => {
  const cle = cleCellule('produit', 7, LIEN);
  const vide = { prix: null, enVente: false };
  const coche = { prix: 20, enVente: true };
  assert.equal(celluleAEnvoyer(cle, coche, undefined), null);
  assert.deepEqual(celluleAEnvoyer(cle, vide, surPrix(vide, undefined, '26')), { article_type: 'produit', article_id: 7, canal: LIEN, prix: 26, en_vente: true });
  assert.deepEqual(celluleAEnvoyer(cle, coche, surPrix(coche, undefined, '22')), { article_type: 'produit', article_id: 7, canal: LIEN, prix: 22 });
  assert.deepEqual(celluleAEnvoyer(cle, coche, surCase(undefined, false)), { article_type: 'produit', article_id: 7, canal: LIEN, en_vente: false });
  assert.deepEqual(celluleAEnvoyer(cle, coche, surPrix(coche, undefined, '')), { article_type: 'produit', article_id: 7, canal: LIEN, prix: null, en_vente: false });
  assert.deepEqual(celluleAEnvoyer(cle, { prix: 20, enVente: false }, surCase(undefined, true)), { article_type: 'produit', article_id: 7, canal: LIEN, en_vente: true });
});

test('majorer : mêmes résultats que le serveur', () => {
  assert.equal(majorer(20, 20, 0.01), 24);
  assert.equal(majorer(8.9, 20, 0.01), 10.68);
  assert.equal(majorer(8.9, 20, 0.1), 10.7);
  assert.equal(majorer(8.9, 20, 0.5), 10.5);
  assert.equal(majorer(8.9, 20, 1), 11);
  assert.equal(majorer(7.5, 20, 0.1), 9);
  assert.equal(majorer(10, -10), 9);
  assert.equal(majorer(0.2, 0, 1), 0.01);
  assert.equal(majorer(8.9, 20, 0.3), 10.68);
});

test('apercuCopie : copiés, prix remplacés, retirés', () => {
  const lignes = [
    { source: { prix: 20, enVente: true }, cible: { prix: null, enVente: false } },   // copié, rien à remplacer
    { source: { prix: 8.9, enVente: true }, cible: { prix: 12, enVente: true } },     // copié, prix remplacé
    { source: { prix: 10, enVente: true }, cible: { prix: 12, enVente: false } },     // copié, même prix après +20 %
    { source: { prix: 6, enVente: false }, cible: { prix: 7, enVente: true } },       // absent de la source
    { source: { prix: null, enVente: false }, cible: { prix: null, enVente: false } },
  ];
  assert.deepEqual(apercuCopie(lignes, 20, 0.01, false), { copies: 3, remplaces: 1, retires: 0 });
  assert.deepEqual(apercuCopie(lignes, 20, 0.01, true), { copies: 3, remplaces: 1, retires: 1 });
  assert.deepEqual(apercuCopie(lignes, 0, 0.01, false), { copies: 3, remplaces: 2, retires: 0 });
});
