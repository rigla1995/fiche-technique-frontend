// Extrait RNE (lot 3, étape 7) — cases à cocher (« ACTIF / SUSPENDU / REGISTRE RADIÉ »).
// Sur l'extrait, ce sont des DESSINS vectoriels, pas du texte : un fond gris et une bordure noire ; la coche est une
// paire de rectangles pleins pivotés de 45° ; une case vide contient un trait de la couleur du fond, donc invisible.
// On parcourt la liste d'opérateurs de pdf.js en suivant la matrice courante pour obtenir les boîtes en coordonnées
// de page. Fonction PURE : la table OPS et la liste d'opérateurs lui sont passées (ni pdfjs, ni DOM).
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

/**
 * Cases à cocher d'une page : petits carrés à bordure sombre (6 à 30 pt), cochés s'ils contiennent une marque VISIBLE
 * (dessin d'une autre couleur que le fond, ou caractère de coche dans la couche texte).
 * @param OPS table des opérateurs de pdf.js (`pdfjs.OPS` : nom → numéro)
 */
export function lireCasesACocher(OPS: object, ops: ListeOperateurs, morceaux: readonly Morceau[] = []): CaseACocher[] {
  const nom: Record<number, string> = {};
  for (const [k, v] of Object.entries(OPS)) if (typeof v === 'number') nom[v] = k;

  let ctm: Matrice = [1, 0, 0, 1, 0, 0];
  let remplissage = '#000000';
  let trait = '#000000';
  const pile: [Matrice, string, string][] = [];
  const chemins: Chemin[] = [];
  const depiler = (): void => {
    const etat = pile.pop();
    if (etat) [ctm, remplissage, trait] = etat;
  };
  for (let i = 0; i < ops.fnArray.length; i++) {
    const args = ops.argsArray[i] as ArrayLike<unknown> | null | undefined;
    switch (nom[ops.fnArray[i]]) {
      case 'save': pile.push([ctm, remplissage, trait]); break;
      case 'restore': depiler(); break;
      case 'transform':
        if (args && args.length >= 6) ctm = multiplier(ctm, Array.from(args as ArrayLike<number>));
        break;
      case 'paintFormXObjectBegin': {
        pile.push([ctm, remplissage, trait]);
        const matrice = args ? (args[0] as ArrayLike<number> | null | undefined) : null;
        if (matrice && matrice.length === 6) ctm = multiplier(ctm, Array.from(matrice));
        break;
      }
      case 'paintFormXObjectEnd': depiler(); break;
      case 'setFillRGBColor': remplissage = couleur(args); break;
      case 'setStrokeRGBColor': trait = couleur(args); break;
      case 'constructPath': {
        const minMax = args ? (args[2] as ArrayLike<number> | null | undefined) : null;
        if (!args || !minMax || minMax.length < 4) break;
        const peinture = nom[args[0] as number] ?? String(args[0]);
        chemins.push({ i, peinture, ...boiteTransformee(ctm, minMax[0], minMax[1], minMax[2], minMax[3]), remplissage, trait });
        break;
      }
      default: break;
    }
  }

  const cases: CaseACocher[] = [];
  for (const c of chemins) {
    if (!trace(c.peinture) || estClaire(c.trait)) continue;
    const largeur = c.x1 - c.x0;
    const hauteur = c.y1 - c.y0;
    if (largeur < 6 || largeur > 30 || hauteur < 6 || hauteur > 30) continue;
    const fond = chemins.find((f) => f.i < c.i && f.i >= c.i - 8 && remplit(f.peinture) && memeBoite(f, c, 1.5));
    const couleurFond = fond ? fond.remplissage : '#ffffff';
    let cochee = false;
    for (const m of chemins) {
      if (m.i <= c.i || m.i > c.i + 40 || m.peinture === 'endPath') continue;
      if (!dedans(m, c, 1) || memeBoite(m, c, 1.5)) continue;
      // un trait de la couleur du fond est invisible : c'est ainsi que l'extrait dessine une case vide
      if ((remplit(m.peinture) ? m.remplissage : m.trait) !== couleurFond) { cochee = true; break; }
    }
    if (!cochee) {
      cochee = morceaux.some((t) => /^[xX\u{2713}\u{2714}\u{2611}\u{2612}\u{25A0}\u{25CF}]$/u.test(t.str.trim())
        && t.x >= c.x0 - 1 && t.x + t.largeur <= c.x1 + 1 && t.y >= c.y0 - 3 && t.y <= c.y1);
    }
    cases.push({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, cochee });
  }
  return cases;
}
