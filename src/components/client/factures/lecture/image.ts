// Étape F5 des factures fournisseur (labflow-reprise/achats-compta/PLAN-FACTURES.md §1 « F5 ») : préparer l'IMAGE d'une
// page avant la reconnaissance de caractères — fonctions PURES sur des niveaux de gris (0 = encre, 255 = papier), sans
// DOM ni tesseract, testées par « node --test » et réemployées telles quelles par l'outil d'essai (Node).
//   trouverFeuille     la feuille posée sur une table : ses 4 coins (photo) ; null pour un scan ou une feuille entière ;
//   feuillePleine      l'image EST la feuille (scan, page d'un PDF numérisé) : ses bords sont du papier ;
//   redresserFeuille   la feuille ramenée à un rectangle (perspective et inclinaison corrigées) ;
//   tournerQuart       un quart de tour (« Pivoter ») ; tournerPixels : petit angle (redressement des lignes) ;
//   eclaircirZonesFoncees  texte clair sur fond foncé (bandeau, cadre « FACTURE ») : la zone est inversée ;
//   egaliserFond       ombre, éclairage inégal : le papier redevient blanc partout ;
//   effacerTraits      quadrillage d'un tableau : les traits longs et fins sont effacés (la reconnaissance de caractères
//                      perdait les colonnes de chiffres d'un tableau encadré).
import type { Pixels } from '../../../admin/patente/ocr/pixels.ts';
import type { Trajet } from './types.ts';

export interface Point { x: number; y: number }
/** Coins de la feuille, dans l'ordre : haut gauche, haut droit, bas droit, bas gauche (pixels de l'image). */
export type Coins = [Point, Point, Point, Point];

const image = (data: Uint8ClampedArray, width: number, height: number): Pixels => ({ data, width, height });

/** Valeur interpolée (bilinéaire) en (x, y) ; hors de l'image : papier blanc. */
function lire(g: Pixels, x: number, y: number): number {
  const { width: w, height: h, data } = g;
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 255;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const a = data[y0 * w + x0], b = data[y0 * w + x1], c = data[y1 * w + x0], d = data[y1 * w + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** Quarts de tour dans le sens des aiguilles d'une montre (1 = 90°, 2 = 180°, 3 = 270°). */
export function tournerQuart(g: Pixels, quarts: number): Pixels {
  const q = ((Math.round(quarts) % 4) + 4) % 4;
  if (!q) return g;
  const { width: w, height: h, data } = g;
  const W = q % 2 ? h : w, H = q % 2 ? w : h;
  const out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = q === 1 ? h - 1 - y : q === 2 ? w - 1 - x : y;
      const Y = q === 1 ? x : q === 2 ? h - 1 - y : w - 1 - x;
      out[Y * W + X] = data[y * w + x];
    }
  }
  return image(out, W, H);
}

/** Rotation d'un angle `rad` (sens du canvas : positif = horaire, y vers le bas), cadre agrandi, fond blanc. */
export function tournerPixels(g: Pixels, rad: number): Pixels {
  const s = Math.sin(rad), c = Math.cos(rad);
  const W = Math.round(g.width * Math.abs(c) + g.height * Math.abs(s));
  const H = Math.round(g.width * Math.abs(s) + g.height * Math.abs(c));
  const out = new Uint8ClampedArray(W * H);
  const cx = g.width / 2, cy = g.height / 2, CX = W / 2, CY = H / 2;
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      const dx = X - CX, dy = Y - CY;
      out[Y * W + X] = lire(g, dx * c + dy * s + cx, -dx * s + dy * c + cy);
    }
  }
  return image(out, W, H);
}

// ── La feuille ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Image réduite par moyenne de blocs `f` × `f`. */
function reduire(g: Pixels, f: number): Pixels {
  const w = Math.ceil(g.width / f), h = Math.ceil(g.height / f);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let yy = y * f; yy < Math.min(g.height, (y + 1) * f); yy++) {
        for (let xx = x * f; xx < Math.min(g.width, (x + 1) * f); xx++) { s += g.data[yy * g.width + xx]; n++; }
      }
      out[y * w + x] = n ? s / n : 255;
    }
  }
  return image(out, w, h);
}

/** Seuil d'Otsu d'une image en niveaux de gris. */
function otsu(g: Pixels): number {
  const histo = new Float64Array(256);
  for (let i = 0; i < g.data.length; i++) histo[g.data[i]]++;
  const n = g.data.length;
  let somme = 0;
  for (let i = 0; i < 256; i++) somme += i * histo[i];
  let sb = 0, wb = 0, meilleur = -1, seuil = 128;
  for (let i = 0; i < 256; i++) {
    wb += histo[i];
    if (!wb) continue;
    const wf = n - wb;
    if (!wf) break;
    sb += i * histo[i];
    const ecart = sb / wb - (somme - sb) / wf;
    const v = wb * wf * ecart * ecart;
    if (v > meilleur) { meilleur = v; seuil = i; }
  }
  return seuil;
}

/** Droite de régression orthogonale d'un nuage de points : point moyen et direction. */
function droite(points: Point[]): { p: Point; d: Point } | null {
  if (points.length < 3) return null;
  let mx = 0, my = 0;
  for (const q of points) { mx += q.x; my += q.y; }
  mx /= points.length; my /= points.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const q of points) { const dx = q.x - mx, dy = q.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { p: { x: mx, y: my }, d: { x: Math.cos(angle), y: Math.sin(angle) } };
}

function intersection(a: { p: Point; d: Point }, b: { p: Point; d: Point }): Point | null {
  const det = a.d.x * b.d.y - a.d.y * b.d.x;
  if (Math.abs(det) < 1e-6) return null;
  const t = ((b.p.x - a.p.x) * b.d.y - (b.p.y - a.p.y) * b.d.x) / det;
  return { x: a.p.x + t * a.d.x, y: a.p.y + t * a.d.y };
}

const aire = (c: Coins) => Math.abs(c.reduce((s, p, i) => { const q = c[(i + 1) % 4]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;
const convexe = (c: Coins) => {
  let signe = 0;
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4], d = c[(i + 2) % 4];
    const z = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (!signe) signe = Math.sign(z); else if (Math.sign(z) !== signe) return false;
  }
  return true;
};

/**
 * La feuille d'une photo (posée sur une table, un bureau) : la plus grande zone claire d'un seul tenant, ses quatre bords
 * ajustés en droites. → ses coins, ou null si l'image EST la feuille (scan, photo déjà recadrée) ou si rien de sûr ne se
 * dégage (feuille trop petite, trop déformée, fond aussi clair que le papier).
 */
export function trouverFeuille(g: Pixels): Coins | null {
  const f = Math.max(1, Math.ceil(Math.max(g.width, g.height) / 260));
  const s = reduire(g, f);
  const { width: w, height: h } = s;
  const seuil = otsu(s);
  // Écart trop faible entre les deux classes : pas de fond distinct du papier.
  let clairs = 0, sc = 0, sf = 0;
  for (let i = 0; i < s.data.length; i++) { if (s.data[i] > seuil) { clairs++; sc += s.data[i]; } else sf += s.data[i]; }
  if (!clairs || clairs === s.data.length) return null;
  if (sc / clairs - sf / (s.data.length - clairs) < 40) return null;
  // Plus grande composante claire (4-voisinage).
  const etiquette = new Int32Array(w * h).fill(-1);
  let meilleure = -1, tailleMax = 0;
  const pile: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (etiquette[i] !== -1 || s.data[i] <= seuil) continue;
    let taille = 0;
    pile.push(i);
    etiquette[i] = i;
    while (pile.length) {
      const p = pile.pop() as number;
      taille++;
      const x = p % w, y = (p - x) / w;
      const voisins = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of voisins) if (q >= 0 && etiquette[q] === -1 && s.data[q] > seuil) { etiquette[q] = i; pile.push(q); }
    }
    if (taille > tailleMax) { tailleMax = taille; meilleure = i; }
  }
  if (tailleMax < 0.2 * w * h) return null;
  // Bouchage horizontal des trous (texte, tableaux) : chaque rangée de la feuille va de son premier à son dernier pixel.
  const gauche = new Int32Array(h).fill(-1), droiteX = new Int32Array(h).fill(-1);
  let haut = h, bas = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (etiquette[y * w + x] !== meilleure) continue;
      if (gauche[y] < 0) gauche[y] = x;
      droiteX[y] = x;
    }
    if (gauche[y] >= 0) { haut = Math.min(haut, y); bas = y; }
  }
  // La feuille touche les quatre bords de l'image : c'est un scan ou une photo déjà recadrée.
  const touche = (gauche.some((x) => x === 0) ? 1 : 0) + (droiteX.some((x) => x === w - 1) ? 1 : 0) + (haut === 0 ? 1 : 0) + (bas === h - 1 ? 1 : 0);
  if (touche >= 3) return null;
  // Une feuille posée sur une table en est ENTOURÉE : le fond foncé occupe au moins 3 des 4 bords de l'image (relecture
  // des écrans : un scan à bandeaux foncés en haut et en bas n'est pas une feuille posée — il ne se recadre pas).
  const fonceSur = (ps: number[]) => ps.filter((i) => s.data[i] <= seuil).length / Math.max(1, ps.length);
  const bords = [
    fonceSur([...Array(w).keys()]), fonceSur([...Array(w).keys()].map((x) => (h - 1) * w + x)),
    fonceSur([...Array(h).keys()].map((y) => y * w)), fonceSur([...Array(h).keys()].map((y) => y * w + w - 1)),
  ];
  if (bords.filter((f) => f >= 0.4).length < 3) return null;
  // Coins grossiers : extrêmes de x + y et de x − y.
  let tl: Point | null = null, br: Point | null = null, tr: Point | null = null, bl: Point | null = null;
  const contour: Point[] = [];
  for (let y = haut; y <= bas; y++) {
    if (gauche[y] < 0) continue;
    for (const x of [gauche[y], droiteX[y]]) {
      const p = { x, y };
      contour.push(p);
      if (!tl || x + y < tl.x + tl.y) tl = p;
      if (!br || x + y > br.x + br.y) br = p;
      if (!tr || x - y > tr.x - tr.y) tr = p;
      if (!bl || x - y < bl.x - bl.y) bl = p;
    }
  }
  // Bords haut et bas : premier et dernier pixel de chaque colonne.
  for (let x = 0; x < w; x++) {
    let y0 = -1, y1 = -1;
    for (let y = haut; y <= bas; y++) if (etiquette[y * w + x] === meilleure) { if (y0 < 0) y0 = y; y1 = y; }
    if (y0 >= 0) { contour.push({ x, y: y0 }, { x, y: y1 }); }
  }
  if (!tl || !tr || !br || !bl) return null;
  const grossiers: Coins = [tl, tr, br, bl];
  // Chaque point du contour va au côté le plus proche (hors des coins), puis une droite par côté.
  const distanceAuSegment = (p: Point, a: Point, b: Point) => {
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
  };
  const cotes: Point[][] = [[], [], [], []];
  const marge = 3;
  for (const p of contour) {
    if (grossiers.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < marge * 2)) continue;
    let k = 0, dmin = Infinity;
    for (let i = 0; i < 4; i++) { const d = distanceAuSegment(p, grossiers[i], grossiers[(i + 1) % 4]); if (d < dmin) { dmin = d; k = i; } }
    if (dmin <= marge) cotes[k].push(p);
  }
  const droites = cotes.map(droite);
  let coins: Coins = grossiers;
  if (droites.every(Boolean)) {
    const fins = [3, 0, 1, 2].map((i, k) => intersection(droites[i] as { p: Point; d: Point }, droites[k] as { p: Point; d: Point }));
    if (fins.every(Boolean)) coins = fins as Coins;
  }
  // Retour à l'échelle de l'image (centre des blocs).
  const vrais = coins.map((p) => ({ x: (p.x + 0.5) * f, y: (p.y + 0.5) * f })) as Coins;
  if (!convexe(vrais) || aire(vrais) < 0.2 * g.width * g.height) return null;
  if (vrais.some((p) => p.x < -0.05 * g.width || p.y < -0.05 * g.height || p.x > 1.05 * g.width || p.y > 1.05 * g.height)) return null;
  return vrais;
}

/**
 * L'image EST la feuille (scan, page d'un PDF numérisé, photo déjà recadrée) quand aucun fond foncé ne l'entoure : moins
 * de 3 de ses 4 bords sont foncés à 40 % (le critère de trouverFeuille ; bords lus juste à l'intérieur — le liseré d'un
 * scanner ne compte pas ; un scan à bandeaux foncés en haut et en bas reste une feuille). Le cadre de la page est alors
 * l'image entière : une mise en page s'y apprend et s'y applique (contre-relecture : un scan n'apprenait jamais). Une
 * photo dont la feuille n'a pas été trouvée a le plus souvent la table autour : non. (Limite : une feuille photographiée
 * sur une table CLAIRE passe pour un scan — la mise en page connue n'y est gardée que si elle lit mieux.)
 */
export function feuillePleine(g: Pixels): boolean {
  const f = Math.max(1, Math.ceil(Math.max(g.width, g.height) / 260));
  const s = reduire(g, f);
  const { width: w, height: h } = s;
  if (w < 4 || h < 4) return true;
  // Image presque uniforme : pas de fond distinct du papier.
  let min = 255, max = 0;
  for (const v of s.data) { if (v < min) min = v; if (v > max) max = v; }
  if (max - min < 40) return true;
  const seuil = otsu(s);
  const fonceSur = (ps: number[]) => ps.filter((i) => s.data[i] <= seuil).length / Math.max(1, ps.length);
  const bords = [
    fonceSur([...Array(w).keys()].map((x) => w + x)), fonceSur([...Array(w).keys()].map((x) => (h - 2) * w + x)),
    fonceSur([...Array(h).keys()].map((y) => y * w + 1)), fonceSur([...Array(h).keys()].map((y) => y * w + w - 2)),
  ];
  return bords.filter((c) => c >= 0.4).length < 3;
}

/** Homographie qui envoie le rectangle [0, W] × [0, H] sur le quadrilatère `coins`. */
function homographie(coins: Coins, W: number, H: number): number[] | null {
  const src: Point[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = src[i], { x, y } = coins[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  // Élimination de Gauss avec pivot partiel.
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j < 9; j++) A[r][j] -= k * A[c][j];
    }
  }
  return [...A.map((r, i) => r[8] / A[i][i]), 1];
}

/** Taille du rectangle d'une feuille : la moyenne des côtés opposés. */
export function tailleFeuille(coins: Coins): [number, number] {
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  return [Math.max(1, Math.round((d(coins[0], coins[1]) + d(coins[3], coins[2])) / 2)), Math.max(1, Math.round((d(coins[0], coins[3]) + d(coins[1], coins[2])) / 2))];
}

/** La feuille de coins `coins` ramenée à un rectangle (taille : la moyenne des côtés opposés). */
export function redresserFeuille(g: Pixels, coins: Coins): Pixels {
  const [W, H] = tailleFeuille(coins);
  const m = homographie(coins, W, H);
  if (!m) return g;
  const out = new Uint8ClampedArray(W * H);
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const z = m[6] * u + m[7] * v + m[8];
      out[v * W + u] = lire(g, (m[0] * u + m[1] * v + m[2]) / z, (m[3] * u + m[4] * v + m[5]) / z);
    }
  }
  return image(out, W, H);
}

// ── Du point lu à l'image d'origine ─────────────────────────────────────────────────────────────────────────────────

/** Point (x, y) d'une image tournée de `rad` (taille W × H) → point de l'image avant rotation (w × h). */
function avantRotation(x: number, y: number, rad: number, W: number, H: number, w: number, h: number): Point {
  const s = Math.sin(rad), c = Math.cos(rad);
  const dx = x - W / 2, dy = y - H / 2;
  return { x: dx * c + dy * s + w / 2, y: -dx * s + dy * c + h / 2 };
}

/** Point (x, y) d'une image tournée de `quarts` quarts de tour → point avant (image de w × h avant les quarts). */
function avantQuarts(x: number, y: number, quarts: number, w: number, h: number): Point {
  const q = ((Math.round(quarts) % 4) + 4) % 4;
  if (q === 1) return { x: y, y: h - x };
  if (q === 2) return { x: w - x, y: h - y };
  if (q === 3) return { x: w - y, y: x };
  return { x, y };
}

/** Un point de la page lue (unités de la page) → le point de l'image d'origine (pixels de l'image donnée à la lecture). */
export function versOriginal(t: Trajet, x: number, y: number): Point {
  if (t.rotation === 'source') {
    const [W, H] = t.tailles.quarts;
    return avantRotation(x / t.echelle, y / t.echelle, t.angle, W, H, t.largeur, t.hauteur);
  }
  const [WL, HL] = t.tailles.lue, [WQ, HQ] = t.tailles.quarts, [WF, HF] = t.tailles.feuille;
  const a = avantRotation(x, y, t.angle, WL, HL, WQ, HQ);
  const b = avantQuarts(a.x, a.y, t.quarts, WF, HF);
  let r = b;
  if (t.coins) {
    const m = homographie(t.coins.map(([px, py]) => ({ x: px, y: py })) as Coins, WF, HF);
    if (m) {
      const z = m[6] * b.x + m[7] * b.y + m[8];
      r = { x: (m[0] * b.x + m[1] * b.y + m[2]) / z, y: (m[3] * b.x + m[4] * b.y + m[5]) / z };
    }
  }
  return { x: r.x / t.echelle, y: r.y / t.echelle };
}

/** Point (x, y) d'une image de w × h → point de cette image tournée de `rad` (taille W × H) : l'inverse d'avantRotation. */
function apresRotation(x: number, y: number, rad: number, w: number, h: number, W: number, H: number): Point {
  const s = Math.sin(rad), c = Math.cos(rad);
  const u = x - w / 2, v = y - h / 2;
  return { x: u * c - v * s + W / 2, y: u * s + v * c + H / 2 };
}

/**
 * Le CADRE DE LA PAGE droite : la feuille recadrée (ou l'image entière), tournée de ses quarts de tour, avant le
 * redressement fin. Une mise en page apprise s'y exprime en fractions (relecture des écrans : la page lue est agrandie par
 * la rotation, et une photo non recadrée contient la table). Point de la page lue → fractions de ce cadre.
 */
export function versCadrePage(t: Trajet, x: number, y: number): Point {
  if (t.rotation === 'source') {
    const p = avantRotation(x / t.echelle, y / t.echelle, t.angle, t.tailles.quarts[0], t.tailles.quarts[1], t.largeur, t.hauteur);
    return { x: p.x / t.largeur, y: p.y / t.hauteur };
  }
  const [WL, HL] = t.tailles.lue, [WQ, HQ] = t.tailles.quarts;
  const a = avantRotation(x, y, t.angle, WL, HL, WQ, HQ);
  return { x: a.x / WQ, y: a.y / HQ };
}

/** Fractions du cadre de la page droite → point de la page lue (l'inverse de versCadrePage). */
export function depuisCadrePage(t: Trajet, fx: number, fy: number): Point {
  if (t.rotation === 'source') {
    const p = apresRotation(fx * t.largeur, fy * t.hauteur, t.angle, t.largeur, t.hauteur, t.tailles.quarts[0], t.tailles.quarts[1]);
    return { x: p.x * t.echelle, y: p.y * t.echelle };
  }
  const [WL, HL] = t.tailles.lue, [WQ, HQ] = t.tailles.quarts;
  return apresRotation(fx * WQ, fy * HQ, t.angle, WQ, HQ, WL, HL);
}

/**
 * Quatre coins placés à la main (fractions de l'image), remis dans l'ordre haut gauche, haut droit, bas droit, bas gauche
 * quel que soit l'ordre de pose ; null si le cadre se croise ou s'aplatit (relecture des écrans : posés à l'envers, ils
 * donnaient une image en miroir).
 */
export function ordonnerCoins(ps: readonly [number, number][]): [number, number][] | null {
  if (ps.length !== 4 || ps.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  const cx = ps.reduce((s, p) => s + p[0], 0) / 4, cy = ps.reduce((s, p) => s + p[1], 0) / 4;
  // y vers le bas : l'angle croissant tourne dans le sens des aiguilles d'une montre à l'écran.
  const tries = [...ps].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  const k = tries.reduce((m, p, i) => (p[0] + p[1] < tries[m][0] + tries[m][1] ? i : m), 0);
  const o = [...tries.slice(k), ...tries.slice(0, k)];
  const c = o.map(([x, y]) => ({ x, y })) as Coins;
  return convexe(c) && aire(c) >= 0.05 ? o : null;
}

/** Le cadre d'une ligne lue, en FRACTIONS de l'image d'origine (rectangle qui contient ses quatre coins replacés). */
export function cadreSurOriginal(t: Trajet, c: { x0: number; y0: number; x1: number; y1: number }): { x0: number; y0: number; x1: number; y1: number } {
  const ps = [versOriginal(t, c.x0, c.y0), versOriginal(t, c.x1, c.y0), versOriginal(t, c.x1, c.y1), versOriginal(t, c.x0, c.y1)];
  return {
    x0: Math.min(...ps.map((p) => p.x)) / t.largeur, y0: Math.min(...ps.map((p) => p.y)) / t.hauteur,
    x1: Math.max(...ps.map((p) => p.x)) / t.largeur, y1: Math.max(...ps.map((p) => p.y)) / t.hauteur,
  };
}

// ── Le papier ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Grille de blocs `b` × `b` : une valeur par bloc (fonction des pixels du bloc). */
function grille(g: Pixels, b: number, valeur: (somme: number, max: number, n: number) => number): { v: Float64Array; gw: number; gh: number } {
  const gw = Math.ceil(g.width / b), gh = Math.ceil(g.height / b);
  const v = new Float64Array(gw * gh);
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      let s = 0, m = 0, n = 0;
      for (let y = by * b; y < Math.min(g.height, (by + 1) * b); y++) {
        for (let x = bx * b; x < Math.min(g.width, (bx + 1) * b); x++) { const p = g.data[y * g.width + x]; s += p; if (p > m) m = p; n++; }
      }
      v[by * gw + bx] = valeur(s, m, n);
    }
  }
  return { v, gw, gh };
}

/**
 * Texte clair sur fond foncé : les zones foncées assez grandes pour ne pas être du texte (au moins 3 blocs de haut et 4
 * de large) sont inversées — le texte y devient foncé sur fond clair, comme le reste de la page.
 */
export function eclaircirZonesFoncees(g: Pixels, b = 24, seuil = 96): Pixels {
  const { v, gw, gh } = grille(g, b, (s, _m, n) => s / Math.max(1, n));
  const fonce = (i: number) => v[i] < seuil;
  const vu = new Uint8Array(gw * gh);
  const cadres: [number, number, number, number][] = [];
  for (let i = 0; i < gw * gh; i++) {
    if (vu[i] || !fonce(i)) continue;
    const zone: number[] = [];
    const pile = [i];
    vu[i] = 1;
    let x0 = gw, x1 = -1, y0 = gh, y1 = -1;
    while (pile.length) {
      const p = pile.pop() as number;
      zone.push(p);
      const x = p % gw, y = (p - x) / gw;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const q of [x > 0 ? p - 1 : -1, x < gw - 1 ? p + 1 : -1, y > 0 ? p - gw : -1, y < gh - 1 ? p + gw : -1]) {
        if (q >= 0 && !vu[q] && fonce(q)) { vu[q] = 1; pile.push(q); }
      }
    }
    if (y1 - y0 + 1 < 3 || x1 - x0 + 1 < 4) continue;
    // Un bandeau porte un texte CLAIR : ses pixels minoritaires sont plus clairs que lui. Une ombre forte sur le papier
    // (texte noir sur fond gris foncé) a ses pixels minoritaires plus foncés : elle n'est pas inversée (relecture des
    // écrans — l'inverser rendait le texte plus clair que son fond).
    // Blocs intérieurs seulement (ceux du bord mêlent le papier voisin, plus clair : il passerait pour du texte clair).
    const dedans = new Set(zone);
    const interieurs = zone.filter((p) => {
      const x = p % gw;
      return [x > 0 ? p - 1 : -1, x < gw - 1 ? p + 1 : -1, p - gw, p + gw].every((q) => dedans.has(q));
    });
    const blocs = interieurs.length >= 2 ? interieurs : zone;
    let somme = 0, n = 0;
    for (const p of blocs) somme += v[p];
    const m = somme / blocs.length;
    let clairs = 0, fonces = 0;
    for (const p of blocs) {
      const bx = p % gw, by = (p - bx) / gw;
      for (let y = by * b; y < Math.min(g.height, (by + 1) * b); y++) {
        for (let x = bx * b; x < Math.min(g.width, (bx + 1) * b); x++) {
          const val = g.data[y * g.width + x];
          n++;
          if (val > m + 70) clairs++; else if (val < m - 40) fonces++;
        }
      }
    }
    if (clairs > fonces && clairs >= 0.003 * n) cadres.push([x0, y0, x1, y1]);
  }
  if (!cadres.length) return g;
  // Au pixel près, dans le cadre de chaque zone (un bloc de marge) : un pixel est inversé si son voisinage est foncé — le
  // texte clair de la zone (voisinage foncé) devient foncé, le papier autour (voisinage clair) ne bouge pas.
  const { width: w, height: h, data: d } = g;
  const W = w + 1;
  // Image intégrale en entiers 32 bits : 255 × 3 400² tient (la page lue a 2 400 px de côté, un peu plus une fois tournée).
  const I = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) { s += d[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + s; }
  }
  const r = Math.max(4, Math.round(b * 0.4));
  const moyenne = (x: number, y: number) => {
    const xa = Math.max(0, x - r), ya = Math.max(0, y - r), xb = Math.min(w - 1, x + r), yb = Math.min(h - 1, y + r);
    const s = I[(yb + 1) * W + xb + 1] - I[ya * W + xb + 1] - I[(yb + 1) * W + xa] + I[ya * W + xa];
    return s / ((xb - xa + 1) * (yb - ya + 1));
  };
  const data = new Uint8ClampedArray(d);
  for (const [bx0, by0, bx1, by1] of cadres) {
    const xa = Math.max(0, (bx0 - 1) * b), ya = Math.max(0, (by0 - 1) * b), xb = Math.min(w, (bx1 + 2) * b), yb = Math.min(h, (by1 + 2) * b);
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) if (moyenne(x, y) < 128) data[y * w + x] = 255 - d[y * w + x];
  }
  return image(data, w, h);
}

/**
 * Ombre et éclairage inégal : le fond (le plus clair de chaque bloc, étendu aux voisins puis lissé) est ramené au blanc ;
 * l'encre garde son contraste.
 */
export function egaliserFond(g: Pixels, b = 32): Pixels {
  const { v, gw, gh } = grille(g, b, (_s, m) => m);
  // Max des voisins (un bloc plein de texte prend le papier d'à côté), puis moyenne 3 × 3.
  const dilate = new Float64Array(gw * gh), lisse = new Float64Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < gw && Y < gh) m = Math.max(m, v[Y * gw + X]);
      }
      dilate[y * gw + x] = m;
    }
  }
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < gw && Y < gh) { s += dilate[Y * gw + X]; n++; }
      }
      lisse[y * gw + x] = s / n;
    }
  }
  const data = new Uint8ClampedArray(g.data.length);
  for (let y = 0; y < g.height; y++) {
    const fy = Math.min(gh - 1, Math.max(0, y / b - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < g.width; x++) {
      const fx = Math.min(gw - 1, Math.max(0, x / b - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
      const fond = (lisse[y0 * gw + x0] * (1 - tx) + lisse[y0 * gw + x1] * tx) * (1 - ty) + (lisse[y1 * gw + x0] * (1 - tx) + lisse[y1 * gw + x1] * tx) * ty;
      data[y * g.width + x] = (g.data[y * g.width + x] * 255) / Math.max(48, fond);
    }
  }
  return image(data, g.width, g.height);
}

/** Netteté (masque flou) : l'écart à la moyenne 3 × 3 est renforcé de `force` — un texte flou ou agrandi se détache. */
export function accentuer(g: Pixels, force = 0.8): Pixels {
  const { width: w, height: h, data: d } = g;
  const data = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const Y = y + dy;
        if (Y < 0 || Y >= h) continue;
        for (let dx = -1; dx <= 1; dx++) { const X = x + dx; if (X >= 0 && X < w) { s += d[Y * w + X]; n++; } }
      }
      const v = d[y * w + x];
      data[y * w + x] = v + force * (v - s / n);
    }
  }
  return image(data, w, h);
}

/**
 * Quadrillage : les traits FINS (épaisseur ≤ `epaisseur`) et LONGS (au moins `part` de la largeur, ou de la hauteur)
 * sont effacés, ainsi que leur liseré. Le texte (traits courts) et les aplats (épais) restent.
 */
export function effacerTraits(g: Pixels, epaisseur = 7, part = 0.05, encre = 200): Pixels {
  const { width: w, height: h, data: d } = g;
  const noir = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) noir[i] = d[i] < encre ? 1 : 0;
  // Épaisseur verticale et horizontale de chaque pixel d'encre.
  const epV = new Uint16Array(w * h), epH = new Uint16Array(w * h);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!noir[y * w + x]) { y++; continue; }
      let y2 = y;
      while (y2 < h && noir[y2 * w + x]) y2++;
      for (let k = y; k < y2; k++) epV[k * w + x] = Math.min(65535, y2 - y);
      y = y2;
    }
  }
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!noir[y * w + x]) { x++; continue; }
      let x2 = x;
      while (x2 < w && noir[y * w + x2]) x2++;
      for (let k = x; k < x2; k++) epH[y * w + k] = Math.min(65535, x2 - x);
      x = x2;
    }
  }
  const trait = new Uint8Array(w * h);
  const trou = 2;
  // Traits horizontaux : par rangée, suites de pixels fins (trous de 2 pixels admis) assez longues.
  const longueurH = Math.max(40, part * w);
  for (let y = 0; y < h; y++) {
    let debut = -1, dernier = -1;
    const fermer = () => { if (debut >= 0 && dernier - debut + 1 >= longueurH) for (let k = debut; k <= dernier; k++) if (noir[y * w + k]) trait[y * w + k] = 1; };
    for (let x = 0; x < w; x++) {
      const fin = noir[y * w + x] && epV[y * w + x] <= epaisseur;
      if (fin) { if (debut < 0 || x - dernier > trou + 1) { fermer(); debut = x; } dernier = x; }
    }
    fermer();
  }
  const longueurV = Math.max(40, part * 0.6 * h);
  for (let x = 0; x < w; x++) {
    let debut = -1, dernier = -1;
    const fermer = () => { if (debut >= 0 && dernier - debut + 1 >= longueurV) for (let k = debut; k <= dernier; k++) if (noir[k * w + x]) trait[k * w + x] = 1; };
    for (let y = 0; y < h; y++) {
      const fin = noir[y * w + x] && epH[y * w + x] <= epaisseur;
      if (fin) { if (debut < 0 || y - dernier > trou + 1) { fermer(); debut = y; } dernier = y; }
    }
    fermer();
  }
  const data = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!trait[y * w + x]) continue;
      data[y * w + x] = 255;
      // Liseré (pixels gris de l'anticrénelage) autour du trait.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && !trait[Y * w + X] && d[Y * w + X] > 120) data[Y * w + X] = 255;
      }
    }
  }
  return image(data, w, h);
}
