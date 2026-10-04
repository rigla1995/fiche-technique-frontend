// Chef d'orchestre de la lecture d'une patente SANS IA (lot 3, étape 7 — spec backend docs/lot-3-spec.md §5).
// Un fichier déposé par l'admin (PDF, JPEG, PNG, WebP) est lu DANS LE NAVIGATEUR par trois couches, de la plus sûre à la
// moins sûre : cachet électronique « 2D-DOC » signé, texte d'un PDF officiel, reconnaissance de caractères.
// Rien n'est envoyé au serveur ni à un tiers ; rien n'est conservé (le fichier n'est lu qu'en mémoire).
// Ce module et ses bibliothèques (pdf.js, zxing, tesseract.js) ne sont chargés qu'au clic sur « Lire la patente ».
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { lireCode2dCanvas, lireCode2dPdf } from './code2d/lireCode2d.ts';
import { NOM_COUCHE, fusionner } from './fusion.ts';
import { lireOcr } from './ocr/lireOcr.ts';
import { lireTextePdf } from './rne/lireTextePdf.ts';
import type { LecturePatente, ResultatCouche, SourceLecture, SuiviLecture } from './types.ts';

/** Refus expliqué à l'admin (format, taille, fichier illisible) : son message s'affiche tel quel. */
export class LectureImpossible extends Error {
  name = 'LectureImpossible';
}

const TAILLE_MAX = 15 * 1024 * 1024;
const TYPES_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];
const COTE_MAX = 3000; // plus grand côté du canvas de travail, en pixels

const estPdf = (fichier: File, octets: Uint8Array): boolean =>
  fichier.type === 'application/pdf' || (octets[0] === 0x25 && octets[1] === 0x50 && octets[2] === 0x44 && octets[3] === 0x46); // « %PDF »

const canvasBlanc = (largeur: number, hauteur: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(largeur));
  canvas.height = Math.max(1, Math.round(hauteur));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new LectureImpossible("Ce navigateur ne permet pas de lire l'image.");
  ctx.fillStyle = '#fff'; // une image à fond transparent se lit sur fond blanc
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
};

// Image déposée → canvas (orientation de la photo respectée, plus grand côté borné).
async function dessinerImage(fichier: File): Promise<HTMLCanvasElement> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  } catch {
    throw new LectureImpossible('Image illisible : déposez un fichier JPEG, PNG ou WebP.');
  }
  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  const { canvas, ctx } = canvasBlanc(image.width * echelle, image.height * echelle);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return canvas;
}

// Page 1 d'un PDF sans texte exploitable → canvas d'environ 2000 px de large (« print » : le rendu ne se fige pas
// dans un onglet masqué).
async function rendrePage(pdf: PDFDocumentProxy): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(4, 2000 / base.width) });
  const { canvas, ctx } = canvasBlanc(viewport.width, viewport.height);
  await page.render({ canvas, canvasContext: ctx, viewport, intent: 'print' }).promise;
  return canvas;
}

// Une couche qui échoue ne fait pas échouer la lecture : les autres continuent, l'admin est prévenu.
async function essayer<T>(source: SourceLecture, avertissements: string[], lecture: () => Promise<T | null>): Promise<T | null> {
  try {
    return await lecture();
  } catch (e) {
    console.warn(`[patente] couche ${source} :`, e);
    avertissements.push(`La lecture par ${NOM_COUCHE[source]} a échoué : les autres lectures ont été gardées.`);
    return null;
  }
}

export async function lirePatente(fichier: File, suivi: SuiviLecture = () => {}): Promise<LecturePatente> {
  if (fichier.size > TAILLE_MAX) throw new LectureImpossible('Fichier trop lourd (15 Mo au maximum).');
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const pdf = estPdf(fichier, octets);
  if (!pdf && /hei[cf]/i.test(`${fichier.type} ${fichier.name}`)) {
    throw new LectureImpossible('Photo au format HEIC (iPhone) : convertissez-la en JPEG, puis recommencez.');
  }
  if (!pdf && !TYPES_IMAGE.includes(fichier.type)) {
    throw new LectureImpossible('Format non pris en charge : déposez un PDF, ou une image JPEG, PNG ou WebP.');
  }
  const avertissements: string[] = [];

  if (!pdf) {
    const canvas = await dessinerImage(fichier);
    suivi('Recherche du cachet électronique…');
    const code = await essayer('cachet', avertissements, () => lireCode2dCanvas(canvas));
    suivi('Reconnaissance des caractères…', 0);
    const ocr = await essayer('ocr', avertissements, () => lireOcr(canvas, suivi));
    return fusionner(code, null, ocr, avertissements);
  }

  suivi('Ouverture du PDF…');
  const pdfjs = await import('pdfjs-dist');
  const travailleur = new PdfWorker();
  pdfjs.GlobalWorkerOptions.workerPort = travailleur;
  // getDocument TRANSFÈRE le tableau au worker : on lui donne une copie.
  const tache = pdfjs.getDocument({ data: octets.slice() });
  try {
    let document_: PDFDocumentProxy;
    try {
      document_ = await tache.promise;
    } catch {
      throw new LectureImpossible('PDF illisible (fichier abîmé ou protégé par un mot de passe).');
    }
    suivi('Recherche du cachet électronique…');
    const code = await essayer('cachet', avertissements, () => lireCode2dPdf(pdfjs, document_));
    suivi('Lecture du texte…');
    const texte = await essayer('pdf', avertissements, () => lireTextePdf(pdfjs, document_));
    let ocr: ResultatCouche | null = null;
    if (!texte) {
      // PDF scanné, ou document que la lecture par positions ne connaît pas : on lit l'image de la première page.
      suivi('Reconnaissance des caractères…', 0);
      ocr = await essayer('ocr', avertissements, async () => lireOcr(await rendrePage(document_), suivi));
    }
    return fusionner(code, texte, ocr, avertissements);
  } finally {
    await tache.destroy().catch(() => {});
    travailleur.terminate();
  }
}
