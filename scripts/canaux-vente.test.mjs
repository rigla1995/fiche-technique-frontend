// C1 « Canaux de vente » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.2) : fonctions pures de la grille
// « Configuration vente » — état enregistré d'une cellule, saisie d'un prix, case, cellules envoyées, copie d'un canal.
// Lancer : node --test scripts/canaux-vente.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANAL_DIRECT, cleCellule, lireCle, lirePrixSaisi, etatEnregistre, etatAffiche, surPrix, surCase, garder,
  celluleAEnvoyer, majorer, apercuCopie, ouvertALaSaisie, afficheSur, remplacantSur, accorderOrigine, cocherCanal,
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
  assert.deepEqual(apercuCopie(lignes, 20, 0.01, false), { copies: 3, remplaces: 1, retires: 0, laisses: 0 });
  assert.deepEqual(apercuCopie(lignes, 20, 0.01, true), { copies: 3, remplaces: 1, retires: 1, laisses: 0 });
  assert.deepEqual(apercuCopie(lignes, 0, 0.01, false), { copies: 3, remplaces: 2, retires: 0, laisses: 0 });
});

test('apercuCopie : un produit et sa variante ne se remplacent pas (C2, même règle que le serveur)', () => {
  const vend = (prix) => ({ prix, enVente: true });
  const rien = { prix: null, enVente: false };
  // La source vend l'original, la cible vend déjà la variante : rien n'est copié ni retiré pour ce produit.
  const versPrestataire = [
    { cle: 'produit:1', origine: null, source: vend(20), cible: { prix: 24, enVente: false } },
    { cle: 'produit:5', origine: 'produit:1', source: rien, cible: vend(24) },
    { cle: 'produit:2', origine: null, source: vend(9), cible: rien },
  ];
  assert.deepEqual(apercuCopie(versPrestataire, 0, 0.01, true), { copies: 1, remplaces: 0, retires: 0, laisses: 1 });
  // Dans l'autre sens : la source vend la variante, la cible vend l'original.
  const versDirecte = [
    { cle: 'produit:1', origine: null, source: rien, cible: vend(20) },
    { cle: 'produit:5', origine: 'produit:1', source: vend(24), cible: rien },
  ];
  assert.deepEqual(apercuCopie(versDirecte, 0, 0.01, true), { copies: 0, remplaces: 0, retires: 0, laisses: 1 });
  // Un article valorisé de même numéro qu'un produit n'est pas de la famille.
  const valorise = [
    { cle: 'ingredient:1', origine: null, source: vend(3), cible: rien },
    { cle: 'produit:5', origine: 'produit:1', source: rien, cible: vend(24) },
  ];
  assert.deepEqual(apercuCopie(valorise, 0, 0.01, false), { copies: 1, remplaces: 0, retires: 0, laisses: 0 });
});

// ── C2 : un produit et sa variante sur un même canal ──
const P = { type: 'produit', id: 1, varianteDeId: null, vendable: { id: 'avP', prix_vente: 20, actif: true, directe: true } };
const V = { type: 'produit', id: 5, varianteDeId: 1, vendable: { id: 'avV', prix_vente: 0, actif: true, directe: false } };
const AUTRE = { type: 'produit', id: 2, varianteDeId: null, vendable: { id: 'avA', prix_vente: 9, actif: true, directe: true } };
const VALORISE = { type: 'ingredient', id: 1, vendable: { id: 'avI', prix_vente: 4, actif: true, directe: true } };
const GRILLE = [P, V, AUTRE, VALORISE];
// Chez le prestataire : l'original a gardé son prix (24) sans y être en vente, la variante s'y vend à 24.
const PRIX = [
  { article_vendable_id: 'avP', activite_prestataire_id: LIEN, prix_vente: 24, en_vente: false },
  { article_vendable_id: 'avV', activite_prestataire_id: LIEN, prix_vente: 24, en_vente: true },
];

test('remplacantSur : la variante en vente verrouille la cellule de son produit d\'origine, sur ce canal seulement', () => {
  assert.equal(remplacantSur(P, GRILLE, PRIX, LIEN, {}), V);
  assert.equal(remplacantSur(P, GRILLE, PRIX, CANAL_DIRECT, {}), null);
  assert.equal(remplacantSur(V, GRILLE, PRIX, LIEN, {}), null);        // une variante n'est jamais verrouillée
  assert.equal(remplacantSur(AUTRE, GRILLE, PRIX, LIEN, {}), null);
  assert.equal(remplacantSur(VALORISE, GRILLE, PRIX, LIEN, {}), null); // même numéro que le produit, autre nature
  // La variante décochée (modification en attente) : la cellule de l'origine se rouvre aussitôt.
  const decochee = { [cleCellule('produit', 5, LIEN)]: surCase(undefined, false) };
  assert.equal(remplacantSur(P, GRILLE, PRIX, LIEN, decochee), null);
});

test('accorderOrigine : cocher la variante décoche l\'origine, la décocher lui rend sa case', () => {
  const cleV = cleCellule('produit', 5, CANAL_DIRECT);
  const cleP = cleCellule('produit', 1, CANAL_DIRECT);
  // Un premier prix saisi sur la variante en vente directe la coche : l'origine cède sa case, son prix est gardé.
  let ed = accorderOrigine({ [cleV]: surPrix({ prix: null, enVente: false }, undefined, '22') }, cleV, GRILLE, PRIX);
  assert.equal(afficheSur(V, PRIX, CANAL_DIRECT, ed).enVente, true);
  assert.deepEqual(afficheSur(P, PRIX, CANAL_DIRECT, ed), { texte: '20', prix: 20, enVente: false, cochable: true, modifie: true });
  assert.equal(remplacantSur(P, GRILLE, PRIX, CANAL_DIRECT, ed), V);
  assert.deepEqual(celluleAEnvoyer(cleP, { prix: 20, enVente: true }, ed[cleP]), { article_type: 'produit', article_id: 1, canal: CANAL_DIRECT, en_vente: false });
  // Le prix effacé : la variante n'est plus en vente, l'origine retrouve sa case et plus rien n'est à envoyer pour elle.
  ed = accorderOrigine({ ...ed, [cleV]: surPrix({ prix: null, enVente: false }, ed[cleV], '') }, cleV, GRILLE, PRIX);
  assert.equal(afficheSur(P, PRIX, CANAL_DIRECT, ed).enVente, true);
  assert.equal(ed[cleP], undefined);
  // Une case de l'origine décochée à la main n'est pas « rendue » par la variante.
  ed = { [cleP]: surCase(undefined, false) };
  ed = accorderOrigine({ ...ed, [cleV]: surCase(undefined, false) }, cleV, GRILLE, PRIX);
  assert.equal(afficheSur(P, PRIX, CANAL_DIRECT, ed).enVente, false);
  // La cellule d'un autre produit ou d'un article valorisé ne touche à rien.
  assert.deepEqual(accorderOrigine({}, cleCellule('produit', 2, LIEN), GRILLE, PRIX), {});
  assert.deepEqual(accorderOrigine({}, cleCellule('ingredient', 1, LIEN), GRILLE, PRIX), {});
});

test('accorderOrigine : deux variantes — l\'origine ne revient que lorsque aucune ne tient la place', () => {
  const W = { type: 'produit', id: 6, varianteDeId: 1, vendable: { id: 'avW', prix_vente: 21, actif: true, directe: false } };
  const grille = [...GRILLE, W];
  const cleV = cleCellule('produit', 5, CANAL_DIRECT);
  const cleW = cleCellule('produit', 6, CANAL_DIRECT);
  let ed = accorderOrigine({ [cleV]: surPrix({ prix: null, enVente: false }, undefined, '22') }, cleV, grille, PRIX);
  ed = accorderOrigine({ ...ed, [cleW]: surCase(ed[cleW], true) }, cleW, grille, PRIX);
  ed = accorderOrigine({ ...ed, [cleV]: surCase(ed[cleV], false) }, cleV, grille, PRIX);
  assert.equal(afficheSur(P, PRIX, CANAL_DIRECT, ed).enVente, false); // la seconde variante tient encore la place
  ed = accorderOrigine({ ...ed, [cleW]: surCase(ed[cleW], false) }, cleW, grille, PRIX);
  assert.equal(afficheSur(P, PRIX, CANAL_DIRECT, ed).enVente, true);
});

test('cocherCanal : « Tout » ne change pas qui tient la place, « Aucun » décoche tout', () => {
  // Chez le prestataire : la variante y est, l'origine (qui a un prix) reste décochée ; l'autre produit n'a pas de prix.
  let ed = cocherCanal({}, GRILLE, GRILLE, PRIX, LIEN, true);
  assert.equal(afficheSur(P, PRIX, LIEN, ed).enVente, false);
  assert.equal(afficheSur(V, PRIX, LIEN, ed).enVente, true);
  assert.equal(afficheSur(AUTRE, PRIX, LIEN, ed).enVente, false);
  // « Aucun » puis « Tout » : la variante revient, pas l'origine.
  ed = cocherCanal(ed, GRILLE, GRILLE, PRIX, LIEN, false);
  assert.equal(afficheSur(V, PRIX, LIEN, ed).enVente, false);
  ed = cocherCanal(ed, GRILLE, GRILLE, PRIX, LIEN, true);
  assert.equal(afficheSur(V, PRIX, LIEN, ed).enVente, true);
  assert.equal(afficheSur(P, PRIX, LIEN, ed).enVente, false);
  // En vente directe, l'origine se vend : une variante qui y a un prix n'y est pas cochée d'office.
  const avecPrix = [P, { ...V, vendable: { ...V.vendable, prix_vente: 22 } }, AUTRE, VALORISE];
  ed = cocherCanal({}, avecPrix, avecPrix, PRIX, CANAL_DIRECT, true);
  assert.equal(afficheSur(avecPrix[1], PRIX, CANAL_DIRECT, ed).enVente, false);
  assert.equal(afficheSur(P, PRIX, CANAL_DIRECT, ed).enVente, true);
  // Seules les lignes affichées sont touchées (filtre de recherche), mais la règle regarde toute la grille.
  ed = cocherCanal({}, [P], GRILLE, PRIX, LIEN, true);
  assert.deepEqual(ed, {});
});
