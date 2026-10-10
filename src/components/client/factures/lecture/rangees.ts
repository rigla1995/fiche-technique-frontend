// Lecture de l'en-tête d'une facture (étape F2) : du texte lu aux RANGÉES de la page. Fonctions PURES.
// Deux entrées : les morceaux de texte d'un PDF (pdf.js : y vers le haut, un morceau peut porter plusieurs mots, ou un
// seul glyphe) et les mots reconnus sur une image (tesseract.js : cadres en pixels, numéro de ligne). Sortie commune :
// des rangées de mots, de haut en bas, dont le texte garde la position de chaque mot (pour retrouver « ce qui est à
// droite de ce libellé » ou « sous ce titre de colonne »).
import type { Mot, Rangee } from './types.ts';

const mediane = (v: number[]): number => {
  if (!v.length) return 0;
  const t = [...v].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
};

/** Morceau de texte d'un PDF tel que pdf.js le donne (getTextContent). */
export interface MorceauPdf {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * Morceaux d'une page de PDF → mots, en coordonnées « y vers le bas ». Les morceaux collés (un glyphe par morceau) sont
 * d'abord réunis ; un morceau de plusieurs mots est coupé à ses espaces, chaque mot recevant sa part de la largeur.
 */
export function motsDePdf(morceaux: readonly MorceauPdf[], hauteurPage: number): Mot[] {
  const bruts = morceaux
    .filter((m) => typeof m.str === 'string' && m.str.trim() !== '')
    .map((m) => {
      const taille = Math.abs(m.height) || Math.abs(m.transform[3]) || 10;
      const x0 = Number(m.transform[4]);
      const base = Number(m.transform[5]);
      return { str: m.str, x0, x1: x0 + Math.max(0, m.width), y0: hauteurPage - base - taille * 0.8, y1: hauteurPage - base + taille * 0.2, taille };
    })
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  // Réunion des morceaux d'une même ligne qui se touchent (moins de 15 % de la taille du texte entre eux).
  const reunis: typeof bruts = [];
  for (const m of bruts) {
    const prec = reunis[reunis.length - 1];
    if (prec && Math.abs(prec.y0 - m.y0) < prec.taille * 0.3 && m.x0 - prec.x1 < prec.taille * 0.15 && m.x0 >= prec.x0) {
      prec.str += m.str;
      prec.x1 = Math.max(prec.x1, m.x1);
      continue;
    }
    reunis.push({ ...m });
  }
  const mots: Mot[] = [];
  for (const m of reunis) {
    const s = m.str.replace(/\s+/g, ' ');
    const largeurCar = (m.x1 - m.x0) / Math.max(1, s.length);
    let i = 0;
    for (const partie of s.split(' ')) {
      if (partie) mots.push({ t: partie, x0: m.x0 + i * largeurCar, x1: m.x0 + (i + partie.length) * largeurCar, y0: m.y0, y1: m.y1 });
      i += partie.length + 1;
    }
  }
  return mots;
}

/** Résultat de tesseract.js (sortie « blocks ») → mots, numérotés par ligne. */
export interface BlocsTesseract {
  blocks: { paragraphs: { lines: { words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] }[] | null;
}

// Caractères sans dessin (marques de sens d'écriture, espaces de largeur nulle) : retirés d'un mot.
const INVISIBLES = /[\u{AD}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}\u{2066}-\u{2069}\u{FEFF}]/gu;

export function motsDeTesseract(page: BlocsTesseract): { mots: Mot[]; lignes: number[] } {
  const mots: Mot[] = [];
  const lignes: number[] = [];
  let li = 0;
  for (const bloc of page.blocks ?? []) {
    for (const paragraphe of bloc.paragraphs) {
      for (const ligne of paragraphe.lines) {
        li++;
        for (const w of ligne.words) {
          // Filets du tableau lus comme « | », « [ », « _ » : retirés (ils grandissaient la hauteur de la rangée).
          const t = w.text.replace(INVISIBLES, '').replace(/^[|[\]{}_]+|[|[\]{}_]+$/g, '').trim();
          if (!t || /^[|[\]{}_—–=~.,;:'"`!¦]+$/.test(t)) continue;
          mots.push({ t, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, c: Math.round(w.confidence) });
          lignes.push(li);
        }
      }
    }
  }
  return { mots, lignes };
}

/** Rangée faite de mots déjà triés de gauche à droite. */
export function rangee(mots: Mot[], page = 1): Rangee {
  const debuts: number[] = [];
  let texte = '';
  for (const m of mots) {
    if (texte) texte += ' ';
    debuts.push(texte.length);
    texte += m.t;
  }
  return {
    mots, texte, debuts, page,
    y0: Math.min(...mots.map((m) => m.y0)),
    y1: Math.max(...mots.map((m) => m.y1)),
    hauteur: mediane(mots.map((m) => m.y1 - m.y0)) || 1,
  };
}

/**
 * Mots → rangées, de haut en bas. Les mots d'une même ligne (numéro de tesseract, s'il est donné) restent ensemble ;
 * deux lignes qui se recouvrent verticalement à plus de 50 % sont fusionnées (libellé à gauche, montant à droite).
 */
export function construireRangees(mots: readonly Mot[], page = 1, lignes?: readonly number[]): Rangee[] {
  const parLigne = new Map<number | string, Mot[]>();
  mots.forEach((m, i) => {
    if (!m.t.trim()) return;
    const cle = lignes?.[i] ?? `mot-${i}`;
    const l = parLigne.get(cle);
    if (l) l.push(m); else parLigne.set(cle, [m]);
  });
  const bandes = [...parLigne.values()].map((l) => {
    const y0 = mediane(l.map((m) => m.y0)), y1 = mediane(l.map((m) => m.y1));
    return { mots: l, y0, y1, cy: (y0 + y1) / 2 };
  }).sort((a, b) => a.cy - b.cy);
  const groupes: { y0: number; y1: number; cy: number; mots: Mot[] }[] = [];
  for (const b of bandes) {
    let meilleur: (typeof groupes)[number] | null = null;
    let part = 0;
    // Les seuls candidats sont les groupes proches : une page compte des centaines de bandes.
    for (let k = groupes.length - 1; k >= 0 && k >= groupes.length - 8; k--) {
      const g = groupes[k];
      const recouvrement = Math.min(g.y1, b.y1) - Math.max(g.y0, b.y0);
      const ratio = recouvrement / Math.max(1e-6, Math.min(g.y1 - g.y0, b.y1 - b.y0));
      if (ratio > 0.5 && ratio > part) { meilleur = g; part = ratio; }
    }
    if (meilleur) meilleur.mots.push(...b.mots);
    else groupes.push({ y0: b.y0, y1: b.y1, cy: b.cy, mots: [...b.mots] });
  }
  return groupes
    .map((g) => rangee([...g.mots].sort((a, b) => a.x0 - b.x0), page))
    .sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
}

/**
 * Parties d'une rangée séparées par un grand blanc (plus de `facteur` fois la hauteur du texte) : sur une facture, un
 * même alignement porte souvent deux blocs (le fournisseur à gauche, « FACTURE N° … » à droite).
 */
export function segments(r: Rangee, facteur = 2.2): Rangee[] {
  const parts: Mot[][] = [];
  let courant: Mot[] = [];
  for (const m of r.mots) {
    const prec = courant[courant.length - 1];
    if (prec && m.x0 - prec.x1 > facteur * r.hauteur) { parts.push(courant); courant = []; }
    courant.push(m);
  }
  if (courant.length) parts.push(courant);
  return parts.map((p) => rangee(p, r.page));
}

/** Index du mot de la rangée qui contient la position `pos` du texte. */
export function motA(r: Rangee, pos: number): number {
  let i = 0;
  while (i + 1 < r.debuts.length && r.debuts[i + 1] <= pos) i++;
  return i;
}
