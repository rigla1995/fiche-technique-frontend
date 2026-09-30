// Catégories de produits transformés (lot 2, spec §2.3).
// L'API renvoie toujours les libellés PAR DÉFAUT (ils servent de valeur aux filtres,
// regroupements et palettes : ne jamais comparer ni stocker le libellé traduit).
// `libelleCategoriePt(voc, valeur)` ne traduit qu'à l'AFFICHAGE les 5 libellés connus ;
// toute autre valeur (catégorie saisie par le client, « Sans catégorie »…) est rendue telle quelle.
// Module PUR : aucun import d'exécution.
import type { Vocab } from './vocab.ts';

const LIBELLES: Record<string, (voc: Vocab) => string> = {
  // Les 3 libellés de stockUtils (backend `ptCategorie`).
  'Produits Transformés Utilisables': (voc) => voc.Nom('cat_pt_utilisable'),
  'Produits Composés Valorisés': (voc) => voc.Nom('cat_pt_valorise'),
  'Produits Transformés Vendables': (voc) => voc.Nom('cat_pt_vendable'),
  // Les 2 sections de l'Espace Acheteurs (ventes aux acheteurs, portail).
  'Produits Utilisables': (voc) => voc.Titre('produit_utilisable', true),
  'Produits Composés': (voc) => voc.Titre('produit_compose', true),
};

/** Libellé d'affichage d'une catégorie PT renvoyée par l'API, dans le vocabulaire du compte. */
export function libelleCategoriePt(voc: Vocab, valeur: string): string {
  const rendu = Object.prototype.hasOwnProperty.call(LIBELLES, valeur) ? LIBELLES[valeur] : undefined;
  return rendu ? rendu(voc) : valeur;
}

/** Les libellés par défaut que `libelleCategoriePt` sait traduire (valeurs de l'API). */
export const CATEGORIES_PT_CONNUES: readonly string[] = Object.freeze(Object.keys(LIBELLES));
