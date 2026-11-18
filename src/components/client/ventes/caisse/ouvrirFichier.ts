// Import d'un fichier de caisse (étapes V1a et V1b) : du FICHIER déposé à sa lecture, dans le navigateur, sans service
// extérieur. Excel : exceljs (déjà employé pour les exports). PDF avec texte : pdf.js, par le lecteur des factures
// (avecPdf), puis les rangées des factures (rangees.ts). CSV : lireCsv.ts. L'empreinte du fichier (SHA-256) sert au
// serveur à refuser un fichier déjà importé et à reconnaître le document à conserver.
// V1b — TOUT fichier : quand le modèle connu ne s'y reconnaît pas (`lecture` nulle), le fichier est rendu sous forme de
// FEUILLES (lignes de cellules) : un modèle retenu s'y applique, ou l'utilisateur en désigne les colonnes.
// Les règles de lecture sont dans lireCaisse.ts (pures, testées).
import { avecPdf } from '../../factures/lecture/lireFacture.ts';
import { construireRangees, motsDePdf } from '../../factures/lecture/rangees.ts';
import type { MorceauPdf } from '../../factures/lecture/rangees.ts';
import type { Rangee } from '../../factures/lecture/types.ts';
import { exploitable, feuilleDePages, lireFeuilleCaisse, lirePagesCaisse } from './lireCaisse.ts';
import type { LectureCaisse, LigneFeuille } from './lireCaisse.ts';
import { decoderTexte, feuilleDeCsv } from './lireCsv.ts';

export type SourceCaisse = 'excel' | 'pdf' | 'csv';
/** Une feuille du fichier : un onglet d'un classeur, le contenu d'un CSV, les pages d'un PDF. */
export interface FeuilleCaisse { nom: string; lignes: LigneFeuille[] }
/** `lecture` : le fichier lu par ses titres (modèle connu) ; nulle : colonnes à retrouver dans `feuilles`. */
export interface FichierCaisse { source: SourceCaisse; nom: string; empreinte: string; lecture: LectureCaisse | null; feuilles: FeuilleCaisse[] }

/** Pourquoi un fichier n'a pas pu être lu ; l'écran en fait un message au vocabulaire du compte. */
export type RaisonIllisible = 'FORMAT' | 'XLS' | 'TROP_GROS' | 'PDF_IMAGE' | 'SANS_TABLEAU' | 'ILLISIBLE';
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

type Lu = Pick<FichierCaisse, 'lecture' | 'feuilles'>;

async function lireExcel(octets: ArrayBuffer): Promise<Lu> {
  const ExcelJS = (await import('exceljs')).default;
  const classeur = new ExcelJS.Workbook();
  try {
    await classeur.xlsx.load(octets);
  } catch {
    throw new FichierIllisible('ILLISIBLE');
  }
  let lecture: LectureCaisse | null = null;
  const feuilles: FeuilleCaisse[] = [];
  for (const feuille of classeur.worksheets) {
    const lignes: LigneFeuille[] = [];
    feuille.eachRow({ includeEmpty: false }, (ligne, n) => {
      const cellules: unknown[] = [];
      ligne.eachCell({ includeEmpty: false }, (c, col) => { cellules[col] = valeurDe(c.value); });
      lignes.push({ n, cellules });
    });
    lecture ??= lireFeuilleCaisse(lignes);
    if (exploitable(lignes)) feuilles.push({ nom: feuille.name, lignes });
  }
  return { lecture, feuilles };
}

async function lirePdf(octets: ArrayBuffer): Promise<Lu> {
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
  const lecture = lirePagesCaisse(pages);
  if (lecture) return { lecture, feuilles: [] };
  const lignes = feuilleDePages(pages);
  return { lecture: null, feuilles: exploitable(lignes) ? [{ nom: 'PDF', lignes }] : [] };
}

function lireCsv(octets: ArrayBuffer): Lu {
  const debut = new Uint8Array(octets.slice(0, 4096));
  // Des octets nuls hors UTF-16 : ce n'est pas un fichier de texte.
  const utf16 = (debut[0] === 0xff && debut[1] === 0xfe) || (debut[0] === 0xfe && debut[1] === 0xff);
  if (!utf16 && debut.includes(0)) throw new FichierIllisible('ILLISIBLE');
  const lignes = feuilleDeCsv(decoderTexte(new Uint8Array(octets)));
  return { lecture: lireFeuilleCaisse(lignes), feuilles: exploitable(lignes) ? [{ nom: 'CSV', lignes }] : [] };
}

/** Lit le fichier déposé. Lève FichierIllisible avec sa raison. */
export async function ouvrirFichierCaisse(fichier: File): Promise<FichierCaisse> {
  const nom = fichier.name;
  const ext = (/\.([a-z0-9]+)$/i.exec(nom)?.[1] ?? '').toLowerCase();
  if (ext === 'xls') throw new FichierIllisible('XLS');
  const source: SourceCaisse | null = ext === 'xlsx' ? 'excel' : ext === 'pdf' ? 'pdf' : ext === 'csv' || ext === 'txt' ? 'csv' : null;
  if (!source) throw new FichierIllisible('FORMAT');
  if (fichier.size > TAILLE_MAX) throw new FichierIllisible('TROP_GROS');
  const octets = await fichier.arrayBuffer();
  const empreinte = await empreinteDe(octets);
  const lu = source === 'excel' ? await lireExcel(octets) : source === 'pdf' ? await lirePdf(octets) : lireCsv(octets);
  if (!lu.lecture && !lu.feuilles.length) throw new FichierIllisible('SANS_TABLEAU');
  return { source, nom, empreinte, ...lu };
}
