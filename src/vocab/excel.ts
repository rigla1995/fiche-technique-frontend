// Nom d'onglet Excel construit avec le vocabulaire du compte (lot 2, exports Excel du front).
// Un terme saisi par l'admin peut contenir « / » ou être long (« Clients professionnels ») : Excel
// (et ExcelJS, qui lève une exception) refuse * ? : \ / [ ], l'apostrophe en tête ou en fin, le nom
// vide, le nom réservé « History » et tout nom de plus de 31 caractères.
// Avec le lexique par défaut, les noms d'onglets actuels sortent inchangés.
//   wb.addWorksheet(nomOnglet(`Ventes ${voc.Court('acheteur', true)}`))
// Module PUR : aucun import.

const INTERDITS = /[*?:\\/[\]]/g;
const LONGUEUR_MAX = 31;

/** Nom d'onglet Excel sûr : caractères interdits retirés, 31 caractères au plus, jamais vide. */
export function nomOnglet(texte: string): string {
  const propre = String(texte ?? '').replace(INTERDITS, ' ').replace(/\s+/g, ' ').trim();
  const nom = propre.slice(0, LONGUEUR_MAX).replace(/^'+|'+$/g, '').trim();
  return !nom || nom.toLowerCase() === 'history' ? 'Feuille' : nom;
}
