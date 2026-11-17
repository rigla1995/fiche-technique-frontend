// Recette propre à un canal (étape C2 — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.3) : fonctions PURES
// des écrans. Une variante est un produit complet, lié à son produit d'origine (varianteDeId) et distingué par un
// libellé (« Livraison »). Elle se range sous son produit, dans la page des produits comme dans la grille des canaux.
// Syntaxe TypeScript effaçable : testé tel quel par « node --test scripts/produits-variantes.test.mjs ».

export const LIBELLE_DEFAUT = 'Livraison';
export const LIBELLE_MAX = 40;
const CANAL_DIRECT = 'directe';

export interface AvecVariante {
  id: number;
  name: string;
  varianteDeId?: number | null;
  varianteDeNom?: string | null;
  varianteLibelle?: string | null;
}

const estVariante = (p: AvecVariante): boolean => p.varianteDeId != null;

/** Tri par nom où une variante suit son produit d'origine : origine d'abord, puis ses variantes par nom. */
export function comparerAvecVariantes(a: AvecVariante, b: AvecVariante): number {
  const groupeA = estVariante(a) ? (a.varianteDeNom ?? a.name) : a.name;
  const groupeB = estVariante(b) ? (b.varianteDeNom ?? b.name) : b.name;
  const parGroupe = groupeA.localeCompare(groupeB, 'fr');
  if (parGroupe !== 0) return parGroupe;
  const origineA = a.varianteDeId ?? a.id;
  const origineB = b.varianteDeId ?? b.id;
  if (origineA !== origineB) return origineA - origineB; // deux produits distincts de même nom : chacun avec ses variantes
  if (estVariante(a) !== estVariante(b)) return estVariante(a) ? 1 : -1;
  return a.name.localeCompare(b.name, 'fr');
}

/** La liste dans son ordre, chaque variante remontée juste sous son produit d'origine quand il est dans la liste. */
export function rangerVariantes<T extends AvecVariante>(liste: readonly T[]): T[] {
  const presents = new Set(liste.map((p) => p.id));
  const sousOrigine = (p: T): boolean => p.varianteDeId != null && presents.has(p.varianteDeId);
  const parOrigine = new Map<number, T[]>();
  for (const p of liste) {
    if (!sousOrigine(p)) continue;
    const id = p.varianteDeId as number;
    parOrigine.set(id, [...(parOrigine.get(id) ?? []), p]);
  }
  const rangee: T[] = [];
  for (const p of liste) {
    if (sousOrigine(p)) continue;
    rangee.push(p);
    for (const v of [...(parOrigine.get(p.id) ?? [])].sort((x, y) => x.name.localeCompare(y.name, 'fr'))) rangee.push(v);
  }
  return rangee;
}

/**
 * La liste après la suppression d'un produit : sans lui ; si c'était une variante, son produit d'origine en compte une
 * de moins (son badge suit, sans recharger la page).
 */
export function sansLeProduit<T extends AvecVariante & { variantesCount?: number }>(liste: readonly T[], supprime: AvecVariante): T[] {
  return liste.filter((p) => p.id !== supprime.id).map((p) => (
    supprime.varianteDeId != null && p.id === supprime.varianteDeId
      ? { ...p, variantesCount: Math.max(0, (p.variantesCount ?? 0) - 1) }
      : p
  ));
}

/** Libellé saisi : espaces ramenés à un seul ; null s'il est vide ou trop long. */
export function lireLibelle(texte: string): string | null {
  const libelle = String(texte ?? '').replace(/\s+/g, ' ').trim();
  return libelle && libelle.length <= LIBELLE_MAX ? libelle : null;
}

/** Canaux cochés à l'ouverture de la fenêtre : les prestataires (le cas courant), pas la vente directe. */
export function canauxParDefaut(canaux: readonly string[]): string[] {
  return canaux.filter((c) => c !== CANAL_DIRECT);
}

/** Un produit peut-il recevoir une variante ? Ni une variante elle-même, ni un article vendu tel quel (sans recette). */
export function peutAvoirVariante(p: { type?: string; varianteDeId?: number | null }): boolean {
  return p.varianteDeId == null && p.type !== 'ingredient' && p.type !== 'utilisable';
}
