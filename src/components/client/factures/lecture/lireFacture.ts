// Lecture de l'en-tête d'une facture fournisseur déposée à la saisie d'une appro (étape F2 — PLAN-FACTURES.md §4 « La
// lecture »), DANS LE NAVIGATEUR de celui qui la dépose : rien n'est envoyé ailleurs, aucun service extérieur, rien
// n'est conservé par la lecture (la pièce part dans le stockage du compte à l'enregistrement, comme en F1).
//   PDF avec texte        texte par positions (pdf.js), pages 1 à 5 — sûr ;
//   PDF numérisé, photo   reconnaissance de caractères (tesseract.js, modèle « fra ») : page 1 ; si les totaux manquent
//                         et qu'il y a une page ou une photo de plus, la dernière est lue aussi ;
//   photo HEIC            sa copie JPEG (faite en F1 au dépôt).
// Les bibliothèques (pdf.js, tesseract.js et son modèle, servis par LabFlow sous /ocr/ et /pdf-wasm/) ne se chargent
// qu'au premier dépôt d'une facture. Mêmes versions et mêmes réglages que la lecture de la patente (lot 3, étape 7).
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PSM, Worker as TravailleurOcr } from 'tesseract.js';
import type { Pixels } from '../../../admin/patente/ocr/pixels';
import { enPng, ouvrirTravailleur, sourceCanvas } from '../../../admin/patente/ocr/lireOcr';
import { avecTravailleur } from '../../../admin/patente/ocr/travailleur';
import { ETAPE_OCR, completer, lireImageFacture } from './chaineOcr';
import type { MoteurFacture } from './chaineOcr';
import { lireEntete } from './entete';
import { construireRangees, motsDePdf } from './rangees';
import type { BlocsTesseract, MorceauPdf } from './rangees';
import type { Destinataire, EnteteLu, PageLue, SuiviLecture } from './types';

/** Refus expliqué (format, fichier illisible) : son message s'affiche tel quel. */
export class LectureImpossible extends Error {
  name = 'LectureImpossible';
}

/** Un fichier de la facture : l'original et, pour une photo HEIC, sa copie JPEG. */
export interface FichierALire {
  fichier: Blob;
  type: string;
  apercu: Blob | null;
}

const PAGES_TEXTE = 5;
const CARACTERES_MIN = 40; // en dessous, le PDF est un scan : on le lit comme une image
const COTE_MAX = 3000; // plus grand côté du canvas de travail
const DELAI_OUVERTURE = 30_000;
const DECODEURS_PDF = '/pdf-wasm/';
/** Lecture entière (chargement compris) : au-delà, elle s'arrête proprement — la saisie reste possible à la main. */
const DELAI_LECTURE = 120_000;

const canvasBlanc = (largeur: number, hauteur: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(largeur));
  canvas.height = Math.max(1, Math.round(hauteur));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new LectureImpossible("Ce navigateur ne permet pas de lire l'image.");
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
};

async function dessinerImage(image: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  } catch {
    throw new LectureImpossible("Image illisible par ce navigateur : la facture sera jointe, saisissez l'en-tête à la main.");
  }
  const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
  const { canvas, ctx } = canvasBlanc(bitmap.width * echelle, bitmap.height * echelle);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

async function rendrePage(pdf: PDFDocumentProxy, numero: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(numero);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(4, 2400 / Math.max(base.width, base.height)) });
  const { canvas, ctx } = canvasBlanc(viewport.width, viewport.height);
  await page.render({ canvas, canvasContext: ctx, viewport, intent: 'print' }).promise;
  return canvas;
}

function moteur(travailleur: TravailleurOcr): MoteurFacture {
  const regler = (mode: string) => travailleur.setParameters({
    tessedit_pageseg_mode: mode as PSM, tessedit_char_whitelist: '', preserve_interword_spaces: '1', user_defined_dpi: '300',
  });
  const lire = async (image: Pixels, mode: string): Promise<BlocsTesseract> => {
    await regler(mode);
    const { data } = await travailleur.recognize(enPng(image), {}, { text: true, blocks: true });
    return data as unknown as BlocsTesseract;
  };
  return {
    async angle(image) {
      await regler('3');
      const { data } = await travailleur.recognize(enPng(image), { rotateAuto: true }, { text: false });
      return data.rotateRadians || 0;
    },
    page: (image) => lire(image, '3'),
    bloc: (image) => lire(image, '6'),
  };
}

/** Ouvre un PDF avec son worker (garde : un worker qui ne se charge pas ne bloque pas la lecture). */
async function avecPdf<T>(octets: Uint8Array, faire: (pdf: PDFDocumentProxy) => Promise<T>): Promise<T> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const travailleur = new PdfWorker();
  let panne = false;
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const garde = new Promise<never>((_, rejeter) => {
    const echouer = () => {
      panne = true;
      rejeter(new LectureImpossible("Le lecteur de PDF n'a pas pu être chargé : vérifiez la connexion."));
    };
    travailleur.onerror = echouer;
    minuterie = setTimeout(echouer, DELAI_OUVERTURE);
  });
  garde.catch(() => {});
  pdfjs.GlobalWorkerOptions.workerPort = travailleur;
  const tache = pdfjs.getDocument({ data: octets.slice(), wasmUrl: DECODEURS_PDF });
  try {
    let pdf: PDFDocumentProxy;
    try {
      pdf = await Promise.race([tache.promise, garde]);
    } catch (e) {
      if (e instanceof LectureImpossible) throw e;
      throw new LectureImpossible('PDF illisible (fichier abîmé ou protégé par un mot de passe).');
    } finally {
      clearTimeout(minuterie);
    }
    return await faire(pdf);
  } finally {
    if (!panne) await tache.destroy().catch(() => {});
    travailleur.terminate();
    pdfjs.GlobalWorkerOptions.workerPort = null;
  }
}

async function textePdf(pdf: PDFDocumentProxy): Promise<{ pages: PageLue[]; caracteres: number }> {
  const pages: PageLue[] = [];
  let caracteres = 0;
  for (let n = 1; n <= Math.min(pdf.numPages, PAGES_TEXTE); n++) {
    const page = await pdf.getPage(n);
    const [x0, y0, x1, y1] = page.view;
    const contenu = await page.getTextContent();
    const morceaux = contenu.items.filter((i): i is typeof i & MorceauPdf => 'str' in i) as unknown as MorceauPdf[];
    caracteres += morceaux.reduce((s, m) => s + m.str.trim().length, 0);
    pages.push({ largeur: x1 - x0, hauteur: y1 - y0, rangees: construireRangees(motsDePdf(morceaux, y1 - y0), n) });
  }
  return { pages, caracteres };
}

// Ce qui se lit comme une image : la copie JPEG d'une photo HEIC, une image ordinaire ; un PDF se lit à part.
const lisibleEnImage = (f: FichierALire): Blob | null =>
  (/hei[cf]/.test(f.type) ? f.apercu : /^image\//.test(f.type) ? f.fichier : null);

/**
 * Lit l'en-tête d'une facture. `client` : matricule et noms du client (jamais pris pour le fournisseur).
 * Lève LectureImpossible (message à afficher) ; les autres erreurs sont des pannes (« La lecture n'a pas abouti »).
 */
/** Un en-tête lu sur le texte d'un PDF qui ne dit rien (police sans table de caractères : texte illisible). */
const muet = (e: EnteteLu): boolean => !e.matricule && !e.numero && !e.date && e.totaux.ttc === null && e.totaux.ht === null;

/** Lecture arrêtée (fichier remplacé, écran quitté). */
export class LectureArretee extends Error {
  name = 'LectureArretee';
}

export async function lireFacture(
  fichiers: FichierALire[], client: Destinataire, suivi: SuiviLecture = () => {}, signal?: AbortSignal,
): Promise<EnteteLu & { duree: number }> {
  const verifier = () => { if (signal?.aborted) throw new LectureArretee('Lecture arrêtée.'); };
  const debut = performance.now();
  const lisibles = fichiers.filter((f) => f.type === 'application/pdf' || lisibleEnImage(f));
  const premier = lisibles[0];
  if (!premier) {
    throw new LectureImpossible(fichiers.some((f) => /hei[cf]/.test(f.type))
      ? "Photo HEIC sans copie lisible : la facture sera jointe, saisissez l'en-tête à la main."
      : "Aucun fichier lisible : la facture sera jointe, saisissez l'en-tête à la main.");
  }
  const fin = (e: EnteteLu) => ({ ...e, duree: Math.round((performance.now() - debut) / 100) / 10 });

  // PDF avec texte : aucune reconnaissance de caractères.
  let canvas: HTMLCanvasElement | null = null;
  let derniere: (() => Promise<HTMLCanvasElement>) | null = null;
  if (premier.type === 'application/pdf') {
    suivi('Lecture du PDF…');
    const octets = new Uint8Array(await premier.fichier.arrayBuffer());
    type LuPdf = { entete: EnteteLu; p1: null; pN: null } | { entete: null; p1: HTMLCanvasElement; pN: HTMLCanvasElement | null };
    const lu = await avecPdf<LuPdf>(octets, async (pdf) => {
      const { pages, caracteres } = await textePdf(pdf);
      if (caracteres >= CARACTERES_MIN) {
        const entete = lireEntete(pages, 'pdf', client);
        // Texte présent mais muet (polices sans table de caractères) : la page se lit alors comme une image.
        if (!muet(entete)) return { entete, p1: null, pN: null };
      }
      verifier();
      // PDF numérisé : la page 1 en image (et la dernière, rendue tout de suite : le PDF se ferme après).
      const p1 = await rendrePage(pdf, 1);
      const pN = pdf.numPages > 1 ? await rendrePage(pdf, pdf.numPages) : null;
      return { entete: null, p1, pN };
    });
    if (lu.entete) return fin(lu.entete);
    canvas = lu.p1;
    if (lu.pN) { const pN = lu.pN; derniere = async () => pN; }
  } else {
    suivi('Préparation de l\'image…');
    canvas = await dessinerImage(lisibleEnImage(premier) as Blob);
  }
  const autre = lisibles.length > 1 ? lisibles[lisibles.length - 1] : null;
  if (!derniere && autre && autre.type !== 'application/pdf') derniere = () => dessinerImage(lisibleEnImage(autre) as Blob);

  // Image : reconnaissance de caractères (worker arrêté dans tous les cas, délai borné, et sur arrêt demandé).
  verifier();
  const page1 = canvas;
  const entete = await avecTravailleur(
    () => ouvrirTravailleur(suivi),
    async (travailleur) => {
      const stop = () => { void travailleur.terminate(); };
      signal?.addEventListener('abort', stop, { once: true });
      try {
        const m = moteur(travailleur);
        let e = await lireImageFacture(sourceCanvas(page1), m, client, (etape, a) => suivi(etape, derniere ? (a ?? 0) * 0.7 : a));
        verifier();
        // Totaux absents de la première page (facture de plusieurs pages ou photos) : la dernière les porte. Si elle ne
        // se lit pas, la lecture de la première page est gardée.
        if (derniere && e.totaux.coherents !== true) {
          try {
            const d = await lireImageFacture(sourceCanvas(await derniere()), m, client, (etape, a) => suivi(etape, 0.7 + 0.3 * (a ?? 0)));
            e = completer(e, d);
          } catch (err) {
            verifier();
            console.warn('[facture] dernière page illisible', err instanceof Error ? err.name : '');
          }
        }
        return e;
      } finally {
        signal?.removeEventListener('abort', stop);
      }
    },
    DELAI_LECTURE,
  );
  verifier();
  suivi(ETAPE_OCR, 1);
  return fin(entete);
}
