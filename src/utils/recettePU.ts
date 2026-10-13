// P1 « L'unité des produits utilisables » (labflow-reprise/produits-prestataires/PLAN.md §2 ligne P1, §3) : la recette
// d'un produit utilisable se saisit telle qu'on la fait (2 kg de concentré, de l'eau, de l'ail… pour 4,6 kg de sauce) et
// s'enregistre pour 1 unité (0,434783 kg de concentré pour 1 kg). Le serveur arrondit aussi à 6 décimales
// (src/utils/uniteProduit.js) ; les écrans affichent 3 décimales. Un produit d'avant n'a pas d'unité : sa recette est
// pour 1 recette (quantité produite = 1).

export const DECIMALES_RECETTE = 6;
const arrondi = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** Quantité pour 1 unité du produit, depuis la quantité de la recette entière (4,6 kg : 2 → 0,434783). */
export const pourUneUnite = (quantiteRecette: number, quantiteProduite: number): number =>
  arrondi(quantiteRecette / quantiteProduite, DECIMALES_RECETTE);

/** Quantité de la recette entière, depuis la quantité pour 1 unité (modification : on retrouve la formule saisie). */
export const pourLaRecette = (quantiteUnite: number, quantiteProduite: number): number =>
  arrondi(quantiteUnite * quantiteProduite, 3);

/** Une quantité à l'écran : 3 décimales au plus, à la française (« 0,435 », « 4,6 »). */
export const fmtQuantite = (x: number | string | null | undefined): string => {
  const n = typeof x === 'string' ? parseFloat(x) : x;
  return n == null || !Number.isFinite(n) ? '' : n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
};

/** Quantité produite saisie : un nombre strictement positif (au millième), sinon null. */
export const lireQuantiteProduite = (s: string): number | null => {
  const n = parseFloat(String(s).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const q = arrondi(n, 3);
  return q > 0 ? q : null;
};
