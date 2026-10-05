// Extrait RNE (lot 3, étape 7) — cases à cocher (« ACTIF / SUSPENDU / REGISTRE RADIÉ »).
// Sur l'extrait, ce sont des DESSINS vectoriels, pas du texte : un fond gris et une bordure noire ; la coche est une
// paire de rectangles pleins pivotés de 45° ; une case vide contient un trait de la couleur du fond, donc invisible.
// On parcourt la liste d'opérateurs de pdf.js en suivant la matrice courante pour obtenir les boîtes en coordonnées
// de page. Les mêmes dessins disent aussi si la couche texte est celle du PDF ou celle d'un scanner (image de la page
// entière, texte invisible) : origineDuTexte. Fonctions PURES : la table OPS et la liste d'opérateurs leur sont
// passées (ni pdfjs, ni DOM).
// ⚠ Forme de « constructPath » propre à pdfjs-dist 6 : [opérateur de peinture, [chemin], minMax]. Version figée.
import type { CaseACocher, Morceau } from './analyseur.ts';

/** Ce que renvoie `page.getOperatorList()`. */
export interface ListeOperateurs {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

type Matrice = number[];
interface Boite {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
interface Chemin extends Boite {
  i: number;
  peinture: string;
  remplissage: string;
  trait: string;
}

const multiplier = (m: Matrice, n: Matrice): Matrice => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

function boiteTransformee(ctm: Matrice, x0: number, y0: number, x1: number, y1: number): Boite {
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// Couleur d'un opérateur : « #rrggbb » (pdf.js récent) ou trois composantes (0–1 ou 0–255).
function couleur(args: ArrayLike<unknown> | null | undefined): string {
  if (!args || !args.length) return '?';
  if (typeof args[0] === 'string') return args[0].toLowerCase();
  if (args.length >= 3) {
    return '#' + Array.from(args).slice(0, 3).map((v) => {
      const n = Number(v);
      return Math.round(n > 1 ? n : n * 255).toString(16).padStart(2, '0');
    }).join('');
  }
  return '?';
}

function estClaire(c: string): boolean {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(c);
  return m ? (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / 3 > 200 : false;
}

const remplit = (peinture: string): boolean => /fill/i.test(peinture);
const trace = (peinture: string): boolean => /stroke/i.test(peinture);
const memeBoite = (a: Boite, b: Boite, t: number): boolean =>
  Math.abs(a.x0 - b.x0) <= t && Math.abs(a.x1 - b.x1) <= t && Math.abs(a.y0 - b.y0) <= t && Math.abs(a.y1 - b.y1) <= t;
const dedans = (a: Boite, b: Boite, t: number): boolean => a.x0 >= b.x0 - t && a.x1 <= b.x1 + t && a.y0 >= b.y0 - t && a.y1 <= b.y1 + t;

/** État graphique suivi le long de la liste d'opérateurs : matrice, couleurs, mode de rendu du texte. */
interface EtatGraphique {
  ctm: Matrice;
  remplissage: string;
  trait: string;
  modeTexte: number;
}

type Arguments = ArrayLike<unknown> | null | undefined;

// Table des opérateurs de pdf.js retournée : numéro → nom.
function nomsDesOperateurs(OPS: object): Record<number, string> {
  const noms: Record<number, string> = {};
  for (const [k, v] of Object.entries(OPS)) if (typeof v === 'number') noms[v] = k;
  return noms;
}

// Parcourt la liste d'opérateurs en tenant l'état graphique à jour (save / restore, transform, formulaires, couleurs,
// mode de rendu du texte) ; `visiter` reçoit chaque autre opérateur avec l'état courant.
function parcourir(
  noms: Record<number, string>, ops: ListeOperateurs,
  visiter: (operateur: string, args: Arguments, i: number, etat: EtatGraphique) => void,
): void {
  let etat: EtatGraphique = { ctm: [1, 0, 0, 1, 0, 0], remplissage: '#000000', trait: '#000000', modeTexte: 0 };
  const pile: EtatGraphique[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const args = ops.argsArray[i] as Arguments;
    const operateur = noms[ops.fnArray[i]];
    switch (operateur) {
      case 'save': pile.push({ ...etat }); break;
      case 'restore': etat = pile.pop() ?? etat; break;
      case 'transform':
        if (args && args.length >= 6) etat.ctm = multiplier(etat.ctm, Array.from(args as ArrayLike<number>));
        break;
      case 'paintFormXObjectBegin': {
        pile.push({ ...etat });
        const matrice = args ? (args[0] as ArrayLike<number> | null | undefined) : null;
        if (matrice && matrice.length === 6) etat.ctm = multiplier(etat.ctm, Array.from(matrice));
        break;
      }
      case 'paintFormXObjectEnd': etat = pile.pop() ?? etat; break;
      case 'setFillRGBColor': etat.remplissage = couleur(args); break;
      case 'setStrokeRGBColor': etat.trait = couleur(args); break;
      case 'setTextRenderingMode': etat.modeTexte = args ? Number(args[0]) : 0; break;
      default: if (operateur) visiter(operateur, args, i, etat); break;
    }
  }
}

// Une page d'extrait porte une dizaine de cases. Au-delà de ce plafond, la page n'est pas celle d'un extrait.
const CASES_MAX = 200;

/**
 * Cases à cocher d'une page : petits carrés à bordure sombre (6 à 30 pt), cochés s'ils contiennent une marque VISIBLE
 * (dessin d'une autre couleur que le fond, ou caractère de coche dans la couche texte). Page saturée de petits carrés
 * (fichier fabriqué) : aucune case, l'état du registre sera signalé « non lu ».
 * @param OPS table des opérateurs de pdf.js (`pdfjs.OPS` : nom → numéro)
 */
export function lireCasesACocher(OPS: object, ops: ListeOperateurs, morceaux: readonly Morceau[] = []): CaseACocher[] {
  const noms = nomsDesOperateurs(OPS);
  const chemins: Chemin[] = [];
  parcourir(noms, ops, (operateur, args, i, etat) => {
    if (operateur !== 'constructPath') return;
    const minMax = args ? (args[2] as ArrayLike<number> | null | undefined) : null;
    if (!args || !minMax || minMax.length < 4) return;
    const peinture = noms[args[0] as number] ?? String(args[0]);
    chemins.push({ i, peinture, ...boiteTransformee(etat.ctm, minMax[0], minMax[1], minMax[2], minMax[3]), remplissage: etat.remplissage, trait: etat.trait });
  });

  const cases: CaseACocher[] = [];
  // Les chemins sont rangés dans l'ordre des opérateurs : le fond d'une case (au plus 8 opérateurs avant) et sa marque
  // (au plus 40 après) se cherchent parmi ses voisins, sans relire toute la liste pour chaque case.
  for (const [k, c] of chemins.entries()) {
    if (!trace(c.peinture) || estClaire(c.trait)) continue;
    const largeur = c.x1 - c.x0;
    const hauteur = c.y1 - c.y0;
    if (largeur < 6 || largeur > 30 || hauteur < 6 || hauteur > 30) continue;
    let couleurFond = '#ffffff';
    for (let j = k - 1; j >= 0 && chemins[j].i >= c.i - 8; j--) {
      const f = chemins[j];
      if (remplit(f.peinture) && memeBoite(f, c, 1.5)) couleurFond = f.remplissage; // le plus ancien l'emporte
    }
    let cochee = false;
    for (let j = k + 1; j < chemins.length && chemins[j].i <= c.i + 40; j++) {
      const m = chemins[j];
      if (m.peinture === 'endPath') continue;
      if (!dedans(m, c, 1) || memeBoite(m, c, 1.5)) continue;
      // un trait de la couleur du fond est invisible : c'est ainsi que l'extrait dessine une case vide
      if ((remplit(m.peinture) ? m.remplissage : m.trait) !== couleurFond) { cochee = true; break; }
    }
    if (!cochee) {
      cochee = morceaux.some((t) => /^[xX\u{2713}\u{2714}\u{2611}\u{2612}\u{25A0}\u{25CF}]$/u.test(t.str.trim())
        && t.x >= c.x0 - 1 && t.x + t.largeur <= c.x1 + 1 && t.y >= c.y0 - 3 && t.y <= c.y1);
    }
    cases.push({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, cochee });
    if (cases.length > CASES_MAX) return [];
  }
  return cases;
}

/**
 * D'où vient la couche texte d'une page ?
 *   natif     le texte est dessiné par le PDF lui-même (l'extrait officiel)
 *   scanner   page numérisée : le texte est celui qu'un scanner a reconnu, invisible ou caché sous l'image de la page
 *   incertain une image couvre presque toute la page et un texte visible est dessiné par-dessus : on ne sait pas
 */
export type OrigineTexte = 'natif' | 'scanner' | 'incertain';

const IMAGES = ['paintImageXObject', 'paintInlineImageXObject', 'paintImageMaskXObject'];
const TEXTES = ['showText', 'showSpacedText', 'nextLineShowText', 'nextLineSetSpacingShowText'];
// Part de la page couverte par des images à partir de laquelle la page est tenue pour une image de page entière
// (l'extrait officiel n'a que le code 2D et un logo : moins de 5 %).
const PART_PLEINE_PAGE = 0.8;

/**
 * Origine de la couche texte d'une page, d'après ses dessins : images peintes (surface cumulée, bornée à la page) et
 * mode de rendu du texte (3 et 7 : texte invisible).
 * @param vue boîte de la page (`page.view` : [x0, y0, x1, y1])
 */
export function origineDuTexte(OPS: object, ops: ListeOperateurs, vue: ArrayLike<number>): OrigineTexte {
  const page: Boite = { x0: Math.min(vue[0], vue[2]), x1: Math.max(vue[0], vue[2]), y0: Math.min(vue[1], vue[3]), y1: Math.max(vue[1], vue[3]) };
  const seuil = PART_PLEINE_PAGE * (page.x1 - page.x0) * (page.y1 - page.y0);
  let aireImages = 0;
  let invisibles = 0;
  let sousImage = 0; // textes visibles dessinés avant que la page soit couverte
  let surImage = 0;
  parcourir(nomsDesOperateurs(OPS), ops, (operateur, _args, _i, etat) => {
    if (IMAGES.includes(operateur)) {
      // une image se peint dans le carré unité, placé par la matrice courante
      const b = boiteTransformee(etat.ctm, 0, 0, 1, 1);
      aireImages += Math.max(0, Math.min(b.x1, page.x1) - Math.max(b.x0, page.x0)) * Math.max(0, Math.min(b.y1, page.y1) - Math.max(b.y0, page.y0));
    } else if (TEXTES.includes(operateur)) {
      if (etat.modeTexte === 3 || etat.modeTexte === 7) invisibles++;
      else if (aireImages >= seuil) surImage++;
      else sousImage++;
    }
  });
  if (invisibles > sousImage + surImage) return 'scanner';
  if (!(seuil > 0) || aireImages < seuil) return 'natif';
  return surImage > sousImage ? 'incertain' : 'scanner';
}
