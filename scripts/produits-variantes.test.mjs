// C2 « Recette propre à un canal » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.3) : fonctions pures des
// écrans — rangement d'une variante sous son produit, libellé, canaux proposés, produits qui peuvent en recevoir une.
// Lancer : node --test scripts/produits-variantes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIBELLE_DEFAUT, LIBELLE_MAX, comparerAvecVariantes, rangerVariantes, lireLibelle, canauxParDefaut, peutAvoirVariante,
  sansLeProduit,
} from '../src/components/client/produits/variantes.ts';

const pizza = { id: 1, name: 'Pizza Margherita' };
const pizzaLiv = { id: 5, name: 'Pizza Margherita — Livraison', varianteDeId: 1, varianteDeNom: 'Pizza Margherita', varianteLibelle: 'Livraison' };
const pizzaEmp = { id: 6, name: 'Pizza Margherita — Emporter', varianteDeId: 1, varianteDeNom: 'Pizza Margherita', varianteLibelle: 'Emporter' };
const salade = { id: 2, name: 'Salade' };
const burger = { id: 3, name: 'Burger' };

test('tri par nom : une variante suit son produit, même renommée à la main', () => {
  const renommee = { ...pizzaLiv, name: 'Zeste spécial' };
  const noms = (l) => [...l].sort(comparerAvecVariantes).map((p) => p.name);
  assert.deepEqual(noms([salade, pizzaLiv, burger, pizza, pizzaEmp]),
    ['Burger', 'Pizza Margherita', 'Pizza Margherita — Emporter', 'Pizza Margherita — Livraison', 'Salade']);
  assert.deepEqual(noms([salade, renommee, pizza]), ['Pizza Margherita', 'Zeste spécial', 'Salade']);
});

test('tri par nom : deux produits de même nom gardent chacun leurs variantes', () => {
  const autre = { id: 9, name: 'Pizza Margherita' };
  const varAutre = { id: 10, name: 'Pizza Margherita — Livraison', varianteDeId: 9, varianteDeNom: 'Pizza Margherita' };
  const ids = [varAutre, pizzaLiv, autre, pizza].sort(comparerAvecVariantes).map((p) => p.id);
  assert.deepEqual(ids, [1, 5, 9, 10]);
});

test('rangerVariantes : l\'ordre de la liste est gardé, la variante remonte sous son produit', () => {
  const ids = (l) => rangerVariantes(l).map((p) => p.id);
  assert.deepEqual(ids([pizzaLiv, salade, pizza, burger, pizzaEmp]), [2, 1, 6, 5, 3]);
  // Produit d'origine absent de la liste (autre onglet, filtre) : la variante reste à sa place.
  assert.deepEqual(ids([pizzaLiv, salade, burger]), [5, 2, 3]);
  assert.deepEqual(ids([]), []);
});

test('sansLeProduit : une variante supprimée, son produit d\'origine en compte une de moins', () => {
  const liste = [{ ...pizza, variantesCount: 2 }, pizzaLiv, pizzaEmp, { ...salade, variantesCount: 0 }];
  const apres = sansLeProduit(liste, pizzaLiv);
  assert.deepEqual(apres.map((p) => p.id), [1, 6, 2]);
  assert.equal(apres[0].variantesCount, 1);
  assert.equal(sansLeProduit(apres, pizzaEmp)[0].variantesCount, 0);
  // Un produit sans lien : la liste perd seulement sa ligne, les autres objets ne changent pas.
  const sansSalade = sansLeProduit(liste, salade);
  assert.deepEqual(sansSalade.map((p) => p.id), [1, 5, 6]);
  assert.equal(sansSalade[0], liste[0]);
  // Le compteur ne passe jamais sous zéro (liste périmée).
  assert.equal(sansLeProduit([{ ...pizza }, pizzaLiv], pizzaLiv)[0].variantesCount, 0);
});

test('lireLibelle : espaces ramenés à un seul, vide ou trop long refusé', () => {
  assert.equal(lireLibelle('  Livraison '), 'Livraison');
  assert.equal(lireLibelle('Grand   format'), 'Grand format');
  assert.equal(lireLibelle('   '), null);
  assert.equal(lireLibelle('x'.repeat(LIBELLE_MAX + 1)), null);
  assert.equal(lireLibelle(LIBELLE_DEFAUT), 'Livraison');
});

test('canauxParDefaut : les prestataires, pas la vente directe', () => {
  assert.deepEqual(canauxParDefaut(['directe', 'lien-a', 'lien-b']), ['lien-a', 'lien-b']);
  assert.deepEqual(canauxParDefaut(['directe']), []);
});

test('peutAvoirVariante : un produit avec recette, pas déjà variante', () => {
  assert.equal(peutAvoirVariante({ type: 'vendable' }), true);
  assert.equal(peutAvoirVariante({ type: 'produit' }), true);
  assert.equal(peutAvoirVariante({ type: 'vendable', varianteDeId: 3 }), false);
  assert.equal(peutAvoirVariante({ type: 'ingredient' }), false);
  assert.equal(peutAvoirVariante({ type: 'utilisable' }), false);
});
