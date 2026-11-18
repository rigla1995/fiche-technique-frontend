// Import d'un fichier de caisse (étape V1a) : du FICHIER déposé à sa lecture, dans le navigateur, sans service extérieur.
// Excel : exceljs (déjà employé pour les exports). PDF avec texte : pdf.js, par le lecteur des factures (avecPdf), puis
// les rangées des factures (rangees.ts). L'empreinte du fichier (SHA-256) sert au serveur à refuser un fichier déjà
// importé. Les règles de lecture sont dans lireCaisse.ts (pures, testées).
import { avecPdf } from '../../factures/lecture/lireFacture.ts';
import { construireRangees, motsDePdf } from '../../factures/lecture/rangees.ts';
import type { MorceauPdf } from '../../factures/lecture/rangees.ts';
import type { Rangee } from '../../factures/lecture/types.ts';
import { lireFeuilleCaisse, lirePagesCaisse } from './lireCaisse.ts';
import type { LectureCaisse, LigneFeuille } from './lireCaisse.ts';

export interface FichierCaisse { source: 'excel' | 'pdf'; nom: string; empreinte: string; lecture: LectureCaisse }

/** Pourquoi un fichier n'a pas pu être lu ; l'écran en fait un message au vocabulaire du compte. */
export type RaisonIllisible = 'FORMAT' | 'XLS' | 'CSV' | 'TROP_GROS' | 'PDF_IMAGE' | 'SANS_TABLEAU' | 'ILLISIBLE';
export class FichierIllisible extends Error {
  raison: RaisonIllisible;
  constructor(raison: RaisonIllisible) {
    super(raison);
    this.name = 'FichierIllisible';
    this.raison = raison;
  }
}

export const TAILLE_MAX = 15 * 1024 * 1024;
const PAGES_MAX = 60;

async function empreinteDe(octets: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Valeur d'une cellule : le résultat d'une formule, le texte d'un texte enrichi, une date en « JJ-MM-AAAA ». */
function valeurDe(v: unknown): unknown {
  if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, '0')}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${v.getUTCFullYear()}`;
  if (v && typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown };
    if ('result' in o) return valeurDe(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('');
    if ('text' in o) return valeurDe(o.text);
    return null;
  }
  return v;
}

async function lireExcel(octets: ArrayBuffer): Promise<LectureCaisse | null> {
  const ExcelJS = (await import('exceljs')).default;
  const classeur = new ExcelJS.Workbook();
  try {
    await classeur.xlsx.load(octets);
  } catch {
    throw new FichierIllisible('ILLISIBLE');
  }
  for (const feuille of classeur.worksheets) {
    const lignes: LigneFeuille[] = [];
    feuille.eachRow({ includeEmpty: false }, (ligne, n) => {
      const cellules: unknown[] = [];
      ligne.eachCell({ includeEmpty: false }, (c, col) => { cellules[col] = valeurDe(c.value); });
      lignes.push({ n, cellules });
    });
    const lu = lireFeuilleCaisse(lignes);
    if (lu) return lu;
  }
  return null;
}

async function lirePdf(octets: ArrayBuffer): Promise<LectureCaisse | null> {
  let caracteres = 0;
  let pages: { rangees: Rangee[] }[];
  try {
    pages = await avecPdf(new Uint8Array(octets), async (pdf) => {
      const lues: { rangees: Rangee[] }[] = [];
      for (let n = 1; n <= Math.min(pdf.numPages, PAGES_MAX); n++) {
        const page = await pdf.getPage(n);
        const [, y0, , y1] = page.view;
        const contenu = await page.getTextContent();
        const morceaux = contenu.items.filter((i) => 'str' in i) as unknown as MorceauPdf[];
        caracteres += morceaux.reduce((s, m) => s + m.str.trim().length, 0);
        lues.push({ rangees: construireRangees(motsDePdf(morceaux, y1 - y0), n) });
      }
      return lues;
    });
  } catch {
    throw new FichierIllisible('ILLISIBLE');
  }
  // Un PDF sans texte est une image (ticket scanné) : sa lecture est l'étape V2.
  if (caracteres < 40) throw new FichierIllisible('PDF_IMAGE');
  return lirePagesCaisse(pages);
}

/** Lit le fichier déposé. Lève FichierIllisible avec sa raison. */
export async function ouvrirFichierCaisse(fichier: File): Promise<FichierCaisse> {
  const nom = fichier.name;
  const ext = (/\.([a-z0-9]+)$/i.exec(nom)?.[1] ?? '').toLowerCase();
  if (ext === 'xls') throw new FichierIllisible('XLS');
  if (ext === 'csv') throw new FichierIllisible('CSV');
  if (ext !== 'xlsx' && ext !== 'pdf') throw new FichierIllisible('FORMAT');
  if (fichier.size > TAILLE_MAX) throw new FichierIllisible('TROP_GROS');
  const octets = await fichier.arrayBuffer();
  const empreinte = await empreinteDe(octets);
  const lecture = ext === 'xlsx' ? await lireExcel(octets) : await lirePdf(octets);
  if (!lecture) throw new FichierIllisible('SANS_TABLEAU');
  return { source: ext === 'xlsx' ? 'excel' : 'pdf', nom, empreinte, lecture };
}
