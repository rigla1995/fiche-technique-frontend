// Où chercher le DataMatrix dans une image : fenêtres de recherche et garde de temps de la lecture optique
// (lireCode2d.ts). Fonctions pures (ni DOM, ni zxing, ni pdf.js), testées par scripts/patente-code2d.test.mjs.
// Le détecteur DataMatrix de ZXing part du CENTRE de l'image qu'on lui donne : on lui présente donc des fenêtres,
// l'une après l'autre. Leur nombre et la durée totale de la recherche sont bornés, quel que soit le document.

/** Fenêtre de recherche, en pixels : x0, y0, x1, y1. Ce qui dépasse de l'image est blanc. */
export type Fenetre = readonly [number, number, number, number];

/** Largeur et hauteur d'une image, en pixels. */
export interface Dimensions {
  l: number;
  h: number;
}

// Balayage. Centres espacés de 60 points : l'un d'eux tombe dans tout code d'au moins 21 mm de côté ; fenêtres de
// 260 points : le code entier y tient, avec sa marge blanche, jusqu'à 42 mm de côté.
const PAS_BALAYAGE_POINTS = 60;
const COTE_BALAYAGE_POINTS = 260;
/**
 * Plafond du nombre de fenêtres d'un balayage, quelle que soit la surface de la page : une page A4 en demande 140,
 * une A3 280. Sans plafond, une page déclarée immense (un PDF peut annoncer des millions de points) en demandait
 * des millions, jusqu'à épuiser la mémoire de l'onglet.
 */
export const FENETRES_BALAYAGE_MAX = 400;

/** Fenêtres du prototype : image entière, moitié haute (code des cartes), quarts, moitié basse, centre. */
export function fenetresImage({ l, h }: Dimensions): Fenetre[] {
  return [
    [0, 0, l, h], [0, 0, l, h / 2], [0, 0, l / 2, h / 2], [l / 2, 0, l, h / 2],
    [0, h / 2, l, h], [0, h / 2, l / 2, h], [l / 2, h / 2, l, h], [l / 4, h / 4, (3 * l) / 4, (3 * h) / 4],
  ];
}

/**
 * Balayage : fenêtres carrées centrées sur une grille, pour un code qui n'est au centre d'aucune fenêtre du
 * prototype — en haut à gauche d'une page, par exemple. `pxParPoint` : l'échelle du rendu pour une page de PDF ;
 * pour une image, celle d'une page A4 qui la remplirait.
 * Jamais plus de FENETRES_BALAYAGE_MAX fenêtres : au-delà, le pas et le côté des fenêtres grandissent ensemble (la
 * page reste couverte en entier, plus grossièrement). Une image plus étroite qu'un demi-pas n'a aucune fenêtre de
 * balayage : celles du prototype l'ont déjà montrée en entier.
 */
export function fenetresBalayage({ l, h }: Dimensions, pxParPoint: number): Fenetre[] {
  if (!(l > 0) || !(h > 0) || !(pxParPoint > 0)) return [];
  // Centres sur un côté : le premier à un demi-pas du bord, les suivants tous les pas.
  const centres = (cote: number, pas: number): number => Math.max(0, Math.ceil(cote / pas - 0.5));
  let pas = PAS_BALAYAGE_POINTS * pxParPoint;
  if (centres(l, pas) * centres(h, pas) > FENETRES_BALAYAGE_MAX) {
    pas = Math.max(pas, Math.sqrt((l * h) / FENETRES_BALAYAGE_MAX));
    while (centres(l, pas) * centres(h, pas) > FENETRES_BALAYAGE_MAX) pas *= 1.02; // l'arrondi des centres peut dépasser de peu
  }
  if (!Number.isFinite(pas)) return [];
  const colonnes = centres(l, pas);
  const rangees = centres(h, pas);
  const demi = (pas * COTE_BALAYAGE_POINTS) / PAS_BALAYAGE_POINTS / 2;
  const fenetres: Fenetre[] = [];
  for (let j = 0; j < rangees; j++) {
    const cy = pas / 2 + j * pas;
    for (let i = 0; i < colonnes; i++) {
      const cx = pas / 2 + i * pas;
      fenetres.push([cx - demi, cy - demi, cx + demi, cy + demi]);
    }
  }
  return fenetres;
}

/** Garde de temps d'une recherche. */
export interface Echeance {
  /** Vrai une fois le temps écoulé : la recherche s'arrête là, sans résultat. */
  expire: () => boolean;
  /** Temps restant, en millisecondes (0 une fois le temps écoulé). */
  reste: () => number;
}

/** Échéance dans `dureeMs` millisecondes. `horloge` : celle des tests ; par défaut, l'horloge du navigateur. */
export function echeance(dureeMs: number, horloge: () => number = () => performance.now()): Echeance {
  const fin = horloge() + dureeMs;
  return { expire: () => !(horloge() < fin), reste: () => Math.max(0, fin - horloge()) || 0 };
}
