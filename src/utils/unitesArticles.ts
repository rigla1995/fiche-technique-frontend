// Unités de MESURE des articles (table `unites`, référentiel du compte) — helpers d'affichage.
// Lot 1b-2 (§5) : les domaines Hôtellerie/Céramique seedent « pièce », les comptes
// restauration ont historiquement « pièces »/« pieces » : une seule règle pour tous.
//
//   isUnitePiece(nom) → true pour pièce/pièces/piece/pieces/pcs/pc/unité/unités/unite/unites
const UNITES_PIECE = new Set([
  'pièce', 'pièces', 'piece', 'pieces', 'pcs', 'pc',
  'unité', 'unités', 'unite', 'unites',
]);

/** L'unité désigne-t-elle un comptage à la pièce (quantités entières, « portion en pièces ») ? */
export function isUnitePiece(nom: string | null | undefined): boolean {
  return UNITES_PIECE.has(String(nom ?? '').trim().toLowerCase());
}
