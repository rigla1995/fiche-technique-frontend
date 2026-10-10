// Lecture de l'en-tête d'une facture (étape F2) : montants et dates écrits à la tunisienne. Fonctions PURES.
// Montants : 3 décimales (millimes), virgule ou point, espaces ou points de milliers — « 1 234,567 », « 1.234,567 »,
// « 1234.567 », « 1,234.567 ». Un seul séparateur suivi de 3 chiffres (« 1.250 ») se lit comme des millimes : c'est
// l'usage tunisien ; les totaux de la facture tranchent ensuite (HT + TVA + timbre = TTC).
import type { Rangee } from './types.ts';

const MILLIERS_SEULS = /^\d{1,3}([.,' ]\d{3})+$/;

/** « 1 234,567 » → 1234.567 ; null si ce n'est pas un nombre. */
export function lireNombre(brut: string): number | null {
  let s = String(brut).replace(/[\u00a0\u202f\s']/g, '').replace(/^[+]/, '');
  const negatif = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/^[-(]|\)$/g, '');
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return null;
  const virgules = (s.match(/,/g) ?? []).length;
  const points = (s.match(/\./g) ?? []).length;
  let normal: string;
  if (virgules && points) {
    // les deux : le dernier est la virgule décimale, l'autre sépare les milliers
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const mil = dec === ',' ? '.' : ',';
    if (s.indexOf(dec) !== s.lastIndexOf(dec)) return null;
    normal = s.split(mil).join('').replace(dec, '.');
  } else if (virgules + points === 0) {
    normal = s;
  } else {
    const sep = virgules ? ',' : '.';
    const n = virgules || points;
    if (n === 1) normal = s.replace(sep, '.');
    else if (MILLIERS_SEULS.test(s)) normal = s.split(sep).join(''); // « 1.234.567 » : milliers
    else return null;
  }
  const v = Number(normal);
  if (!Number.isFinite(v)) return null;
  return negatif ? -v : v;
}

/** Nombre trouvé dans une rangée, avec sa place. */
export interface NombreLu {
  valeur: number;
  brut: string;
  /** Premier et dernier mot (index dans la rangée). */
  de: number;
  a: number;
  x0: number;
  x1: number;
  /** Pourcentage (« 19 % », « 19% ») : un taux, jamais un montant. */
  pourcent: boolean;
}

const DATE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
const MONNAIE = /^(dt|tnd|d|dinars?|millimes?)$/i;
// Un mot qui commence par un nombre et finit par une monnaie collée : « 123,456DT ».
const COLLE = /^(-?\(?[\d.,']+\)?)(dt|tnd|d|%)?[:;]?$/i;

/**
 * Nombres d'une rangée, de gauche à droite. Les groupes de milliers séparés par une espace (« 1 234,567 », deux mots
 * pour la reconnaissance de caractères) sont réunis quand ils se suivent de près. Les dates sont écartées.
 */
export function nombresDeRangee(r: Rangee): NombreLu[] {
  const res: NombreLu[] = [];
  const mots = r.mots;
  for (let i = 0; i < mots.length; i++) {
    const t = mots[i].t.replace(/^[:=]+/, '');
    if (DATE.test(t)) continue;
    const m = t.match(COLLE);
    if (!m || !/\d/.test(m[1])) continue;
    let brut = m[1];
    let suffixe = (m[2] ?? '').toLowerCase();
    let j = i;
    // milliers séparés par une espace : « 1 » « 234,567 » (écart de moins d'une hauteur de texte)
    while (!suffixe && /^-?\d{1,3}( \d{3})*$/.test(brut)) {
      const suivant = mots[j + 1];
      if (!suivant || suivant.x0 - mots[j].x1 > r.hauteur * 0.9) break;
      const ms = suivant.t.match(/^(\d{3}(?:[.,]\d{1,3})?)(dt|tnd|d)?[:;]?$/i);
      if (!ms) break;
      brut = `${brut} ${ms[1]}`;
      suffixe = (ms[2] ?? '').toLowerCase();
      j++;
      if (/[.,]/.test(ms[1])) break;
    }
    const valeur = lireNombre(brut);
    if (valeur === null) continue;
    let pourcent = suffixe === '%';
    if (!pourcent && mots[j + 1]?.t === '%') { pourcent = true; j++; }
    res.push({ valeur, brut, de: i, a: j, x0: mots[i].x0, x1: mots[j].x1, pourcent });
    // monnaie détachée (« 123,456 DT ») : on la saute
    if (mots[j + 1] && MONNAIE.test(mots[j + 1].t)) j++;
    i = j;
  }
  return res;
}

const MOIS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1, fevrier: 2, fevr: 2, fev: 2, mars: 3, mar: 3, avril: 4, avr: 4, mai: 5, juin: 6,
  juillet: 7, juil: 7, aout: 8, aou: 8, septembre: 9, sept: 9, sep: 9, octobre: 10, oct: 10, novembre: 11, nov: 11,
  decembre: 12, dec: 12,
};
const sansAccents = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const iso = (a: number, m: number, j: number): string | null => {
  if (a < 100) a += 2000;
  if (m < 1 || m > 12 || j < 1 || j > 31 || a < 2000 || a > 2099) return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCMonth() !== m - 1) return null;
  return d.toISOString().slice(0, 10);
};

/** Dates d'un texte (« 03/10/2026 », « 3-10-26 », « 2026-10-03 », « 3 octobre 2026 »), en AAAA-MM-JJ, dans l'ordre. */
export function datesDuTexte(texte: string): { iso: string; index: number; fin: number }[] {
  const res: { iso: string; index: number; fin: number }[] = [];
  const s = sansAccents(texte).toLowerCase();
  const numeriques = /(?<![\d])(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})(?![\d])|(?<![\d])(\d{4})-(\d{2})-(\d{2})(?![\d])/g;
  for (const m of s.matchAll(numeriques)) {
    const v = m[1] ? iso(Number(m[3]), Number(m[2]), Number(m[1])) : iso(Number(m[4]), Number(m[5]), Number(m[6]));
    if (v) res.push({ iso: v, index: m.index ?? 0, fin: (m.index ?? 0) + m[0].length });
  }
  const enLettres = /(?<![\d])(\d{1,2})(?:er)?\s+([a-z]{3,9})\.?\s+(\d{4})(?![\d])/g;
  for (const m of s.matchAll(enLettres)) {
    const mois = MOIS[m[2]];
    const v = mois ? iso(Number(m[3]), mois, Number(m[1])) : null;
    if (v) res.push({ iso: v, index: m.index ?? 0, fin: (m.index ?? 0) + m[0].length });
  }
  return res.sort((a, b) => a.index - b.index);
}

/** Arrondi au millime. */
export const millime = (v: number): number => Math.round(v * 1000) / 1000;
