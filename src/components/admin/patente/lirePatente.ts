// Chef d'orchestre de la lecture d'une patente SANS IA (lot 3, étape 7 — spec backend docs/lot-3-spec.md §5).
// Un fichier déposé par l'admin (PDF, JPEG, PNG, WebP) est lu DANS LE NAVIGATEUR par trois couches, de la plus sûre à la
// moins sûre : cachet électronique « 2D-DOC » signé, texte d'un PDF officiel, reconnaissance de caractères.
// Rien n'est envoyé au serveur ni à un tiers ; rien n'est conservé (le fichier n'est lu qu'en mémoire).
// Ce module et ses bibliothèques (pdf.js, zxing, tesseract.js) ne sont chargés qu'au clic sur « Lire la patente ».
// pdf.js : construction « legacy » (celle des tests et des recettes ; elle porte ses compléments pour un navigateur
// qui n'est pas de la dernière version), page ET worker ensemble.
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker';
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
const DELAI_OUVERTURE = 30_000; // ouverture d'un PDF par son worker, en millisecondes
// Décodeurs d'images de pdf.js (JBIG2, JPEG 2000) servis par l'application, comme /ocr/ (vite.config.ts) : sans eux,
// un PDF numérisé en noir et blanc se lit comme une page blanche.
const DECODEURS_PDF = '/pdf-wasm/';
const ECHEC = "La lecture n'a pas abouti. Saisissez les champs à la main, ou réessayez avec un autre fichier.";

const estPdf = (fichier: File, octets: Uint8Array): boolean =>
  fichier.type === 'application/pdf' || (octets[0] === 0x25 && octets[1] === 0x50 && octets[2] === 0x44 && octets[3] === 0x46); // « %PDF »

// HEIC d'après le type ; d'après l'extension seulement quand le navigateur ne donne aucun type.
const estHeic = (fichier: File): boolean => /hei[cf]/i.test(fichier.type) || (!fichier.type && /\.hei[cf]$/i.test(fichier.name));

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
    console.warn(`[patente] lecture par ${NOM_COUCHE[source]} en échec`, e instanceof Error ? e.name : '');
    avertissements.push(`La lecture par ${NOM_COUCHE[source]} a échoué.`);
    return null;
  }
}

// Aucune couche n'a rien rendu (la reconnaissance de caractères a échoué et rien d'autre n'a lu) : l'admin lit un
// refus clair plutôt qu'un compte rendu vide.
function conclure(...lectures: Parameters<typeof fusionner>): LecturePatente {
  const [code, texte, ocr] = lectures;
  if (!code && !texte && !ocr) throw new LectureImpossible(ECHEC);
  return fusionner(...lectures);
}

export async function lirePatente(fichier: File, suivi: SuiviLecture = () => {}): Promise<LecturePatente> {
  if (fichier.size > TAILLE_MAX) throw new LectureImpossible('Fichier trop lourd (15 Mo au maximum).');
  if (fichier.size === 0) throw new LectureImpossible('Fichier vide.');
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const pdf = estPdf(fichier, octets);
  if (!pdf && estHeic(fichier)) {
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
    return conclure(code, null, ocr, avertissements);
  }

  suivi('Ouverture du PDF…');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const travailleur = new PdfWorker();
  // Un worker qui ne se charge pas (réseau coupé, fichier absent) ne répond jamais : sans cette garde, l'ouverture —
  // puis destroy() — attendraient sans fin et le bouton resterait grisé.
  let panne = false;
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const garde = new Promise<never>((_, rejeter) => {
    const echouer = () => {
      panne = true;
      rejeter(new LectureImpossible("Le lecteur de PDF n'a pas pu être chargé : vérifiez la connexion, puis recommencez."));
    };
    travailleur.onerror = echouer;
    minuterie = setTimeout(echouer, DELAI_OUVERTURE);
  });
  garde.catch(() => {});
  pdfjs.GlobalWorkerOptions.workerPort = travailleur;
  // getDocument TRANSFÈRE le tableau au worker : on lui donne une copie.
  const tache = pdfjs.getDocument({ data: octets.slice(), wasmUrl: DECODEURS_PDF });
  try {
    let document_: PDFDocumentProxy;
    try {
      document_ = await Promise.race([tache.promise, garde]);
    } catch (e) {
      if (e instanceof LectureImpossible) throw e;
      throw new LectureImpossible('PDF illisible (fichier abîmé ou protégé par un mot de passe).');
    } finally {
      clearTimeout(minuterie);
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
    return conclure(code, texte, ocr, avertissements);
  } finally {
    if (!panne) await tache.destroy().catch(() => {});
    travailleur.terminate();
    pdfjs.GlobalWorkerOptions.workerPort = null;
  }
}
