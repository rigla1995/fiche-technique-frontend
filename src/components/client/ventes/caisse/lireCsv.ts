// Import d'un fichier de caisse (étape V1b — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §5 bis) : LIRE un
// fichier CSV. Fonctions PURES : du contenu du fichier à une FEUILLE (lignes de cellules), lue ensuite comme celle d'un
// classeur (lireCaisse.ts). Le séparateur (point-virgule, virgule, tabulation, barre) se devine sur les premières
// lignes ; les guillemets protègent un séparateur ou un retour à la ligne ; l'encodage est l'UTF-8, sinon celui de
// Windows (les exports de caisse en France et en Tunisie).
// Syntaxe TypeScript effaçable : testé tel quel par « node --test scripts/ventes-caisse.test.mjs ».
import type { LigneFeuille } from './lireCaisse.ts';

/** Texte d'un fichier : UTF-16 (marque d'ordre), UTF-8, sinon Windows-1252. */
export function decoderTexte(octets: Uint8Array): string {
  if (octets[0] === 0xff && octets[1] === 0xfe) return new TextDecoder('utf-16le').decode(octets);
  if (octets[0] === 0xfe && octets[1] === 0xff) return new TextDecoder('utf-16be').decode(octets);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

const SEPARATEURS = [';', ',', '\t', '|'];

/** Nombre de `sep` d'une ligne, hors guillemets. */
function compter(ligne: string, sep: string): number {
  let n = 0;
  let dans = false;
  for (const c of ligne) {
    if (c === '"') dans = !dans;
    else if (c === sep && !dans) n++;
  }
  return n;
}

/**
 * Le séparateur d'un CSV : celui qui revient le même nombre de fois sur le plus de lignes (le point-virgule d'abord à
 * égalité — une virgule y est alors la décimale).
 */
export function separateurDe(texte: string): string {
  const lignes = texte.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '').slice(0, 40);
  let choisi = ';';
  let note = 0;
  for (const sep of SEPARATEURS) {
    const comptes = lignes.map((l) => compter(l, sep)).filter((n) => n > 0);
    if (!comptes.length) continue;
    const frequences = new Map<number, number>();
    for (const n of comptes) frequences.set(n, (frequences.get(n) ?? 0) + 1);
    const regulier = Math.max(...frequences.values());
    if (regulier > note) { note = regulier; choisi = sep; }
  }
  return choisi;
}

/** Découpe un CSV en lignes de cellules (guillemets doublés, séparateur ou retour à la ligne entre guillemets). */
export function decouperCsv(texte: string, sep = separateurDe(texte)): string[][] {
  const t = texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte;
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = '';
  let dans = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dans) {
      if (c === '"' && t[i + 1] === '"') { cellule += '"'; i++; } else if (c === '"') dans = false; else cellule += c;
    } else if (c === '"' && cellule === '') dans = true;
    else if (c === sep) { ligne.push(cellule); cellule = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = '';
    } else cellule += c;
  }
  if (cellule !== '' || ligne.length) { ligne.push(cellule); lignes.push(ligne); }
  return lignes;
}

/** La feuille d'un CSV : cellules numérotées à partir de 1, lignes vides omises (leur numéro reste celui du fichier). */
export function feuilleDeCsv(texte: string): LigneFeuille[] {
  const feuille: LigneFeuille[] = [];
  decouperCsv(texte).forEach((cellules, i) => {
    if (cellules.every((c) => c.trim() === '')) return;
    const ligne: unknown[] = [];
    cellules.forEach((c, k) => { if (c.trim() !== '') ligne[k + 1] = c.trim(); });
    feuille.push({ n: i + 1, cellules: ligne });
  });
  return feuille;
}
