// Lecture optique du code « 2D-DOC » (DataMatrix signé) d'un extrait RNE ou d'une carte d'auto-entrepreneur.
// Tout se passe dans le navigateur : rien n'est envoyé, rien n'est conservé. Portage du prototype validé dans
// Chromium (essai du 04/10/2026). Ce que l'essai a appris, et qu'il ne faut pas défaire :
//   - le détecteur DataMatrix de ZXing part du CENTRE de l'image : on lui présente des FENÊTRES, l'une après l'autre ;
//   - un code anti-crénelé (2,5 px par module) ne se lit pas à toutes les tailles : agrandissement au plus proche
//     voisin ; l'indice PURE_BARCODE échoue toujours sur une telle image, on ne le demande jamais ;
//   - une PNG a un canal alpha : la transparence se compose sur du blanc avant le passage en niveaux de gris ;
//   - pdf.js remet une image incorporée sous forme d'ImageBitmap (navigateur) ou de données brutes (`data`, `kind`) ;
//   - le rendu pdf.js ordinaire attend requestAnimationFrame et se fige dans un onglet masqué : `intent: 'print'` ;
//   - MultiFormatReader remplit la console : DataMatrixReader seul, importé avec les seules classes utiles.
// La recherche est bornée : nombre de fenêtres du balayage plafonné (fenetres.ts) et durée totale limitée
// (DUREE_MAX_MS). Passé ce temps, elle s'arrête sans résultat : les autres lectures du document continuent.
// Le texte lu est ensuite analysé et sa signature vérifiée par analyse2ddoc.ts et signature.ts (fonctions pures).
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap';
import DecodeHintType from '@zxing/library/esm/core/DecodeHintType';
import NotFoundException from '@zxing/library/esm/core/NotFoundException';
import RGBLuminanceSource from '@zxing/library/esm/core/RGBLuminanceSource';
import GlobalHistogramBinarizer from '@zxing/library/esm/core/common/GlobalHistogramBinarizer';
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer';
import DataMatrixReader from '@zxing/library/esm/core/datamatrix/DataMatrixReader';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { LectureCode2d } from '../types.ts';
import { interpreterCode2d } from './analyse2ddoc.ts';
import type { Dimensions, Echeance, Fenetre } from './fenetres.ts';
import { echeance, fenetresBalayage, fenetresImage } from './fenetres.ts';

type PdfJs = typeof import('pdfjs-dist');

/** Image en niveaux de gris : un octet par pixel, 0 = noir. */
interface ImageGrise extends Dimensions {
  gris: Uint8ClampedArray;
}

/** Image incorporée d'un PDF, telle que pdf.js la remet. */
interface ImagePdf {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: CanvasImageSource;
}

const PIXELS_MAX = 16e6; // au-delà, un essai est sauté (mémoire, durée)
const COTE_MIN_IMAGE_PDF = 40; // en pixels : plus petit, c'est une puce ou un filet, pas un code
const IMAGES_PDF_MAX = 12;
const DELAI_IMAGE_PDF_MS = 5000;
// Durée totale accordée à la recherche du code dans un document, rendu de la page compris. Un vrai document se lit
// en moins d'une seconde ; sans code, le pire cas mesuré (grand scan balayé en entier) prend quelques secondes.
const DUREE_MAX_MS = 15_000;
// Échelle du rendu d'une page. Le code de l'extrait RNE fait 1,2 point par module : à l'échelle 2 (2,4 px par
// module), il ne se lit qu'à certaines positions sur la page (une fois sur deux en simulation, selon l'alignement
// des modules sur les pixels) ; à l'échelle 4 (4,8 px par module), il se lit partout.
const ECHELLE_RENDU = 4;
// Page rendue : le coin haut-gauche d'abord (zone de 200 x 160 points où l'extrait RNE porte son code, validée par
// l'essai), puis un balayage (fenetres.ts).
const COIN_RNE_POINTS = { l: 200, h: 160 };
const LARGEUR_A4_POINTS = 595; // une image balayée est supposée montrer une page entière (scan d'un extrait)
// En dessous de 3,5 px par point (scan à moins de 250 ppp : moins de 4,2 px par module), un code se lit mal à x1 :
// le balayage réessaie alors, agrandies x2, les fenêtres où un code est vu sans être lu.
const BALAYAGE_FIN_PX_PAR_POINT = 3.5;

const INDICES = new Map<DecodeHintType, boolean>([[DecodeHintType.TRY_HARDER, true]]);

// ---------------------------------------------------------------------------------------------------------------
// Images en niveaux de gris
// ---------------------------------------------------------------------------------------------------------------

function grisDuCanvas(canvas: HTMLCanvasElement): ImageGrise | null {
  if (!canvas.width || !canvas.height) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { data, width: l, height: h } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gris = new Uint8ClampedArray(l * h);
  for (let i = 0, p = 0; i < gris.length; i++, p += 4) {
    const a = data[p + 3] / 255; // transparence composée sur du blanc
    gris[i] = Math.round((0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) * a + 255 * (1 - a));
  }
  return { l, h, gris };
}

/** Un ImageBitmap ne donne pas ses pixels : on le dessine sur un canvas blanc, puis on lit le canvas. */
function grisDuDessin(source: CanvasImageSource, l: number, h: number): ImageGrise | null {
  const canvas = document.createElement('canvas');
  canvas.width = l;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, l, h);
  ctx.drawImage(source, 0, 0);
  const image = grisDuCanvas(canvas);
  canvas.width = canvas.height = 0;
  return image;
}

function grisDeLImagePdf(pdfjs: PdfJs, objet: ImagePdf | null): ImageGrise | null {
  if (!objet) return null;
  const { width: l, height: h, data } = objet;
  if (!(l >= COTE_MIN_IMAGE_PDF) || !(h >= COTE_MIN_IMAGE_PDF) || l * h > PIXELS_MAX) return null;
  if (objet.bitmap) return grisDuDessin(objet.bitmap, l, h);
  if (!data) return null;
  const { GRAYSCALE_1BPP, RGB_24BPP, RGBA_32BPP } = pdfjs.ImageKind;
  const gris = new Uint8ClampedArray(l * h);
  if (objet.kind === RGBA_32BPP && data.length >= 4 * l * h) {
    for (let i = 0, p = 0; i < gris.length; i++, p += 4) {
      const a = data[p + 3] / 255;
      gris[i] = Math.round((0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) * a + 255 * (1 - a));
    }
  } else if (objet.kind === RGB_24BPP && data.length >= 3 * l * h) {
    for (let i = 0, p = 0; i < gris.length; i++, p += 3) {
      gris[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
    }
  } else if (objet.kind === GRAYSCALE_1BPP && data.length >= ((l + 7) >> 3) * h) {
    const octetsParLigne = (l + 7) >> 3; // un bit par pixel, lignes alignées sur l'octet ; 1 = blanc
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < l; x++) gris[y * l + x] = (data[y * octetsParLigne + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
    }
  } else {
    return null;
  }
  return { l, h, gris };
}

function extraire(image: ImageGrise, [x0, y0, x1, y1]: Fenetre): ImageGrise {
  const gauche = Math.round(x0);
  const haut = Math.round(y0);
  const l = Math.max(0, Math.round(x1) - gauche);
  const h = Math.max(0, Math.round(y1) - haut);
  const gris = new Uint8ClampedArray(l * h).fill(255);
  const debut = Math.max(0, gauche);
  const fin = Math.min(image.l, gauche + l);
  if (fin > debut) {
    for (let y = Math.max(0, haut); y < Math.min(image.h, haut + h); y++) {
      gris.set(image.gris.subarray(y * image.l + debut, y * image.l + fin), (y - haut) * l + (debut - gauche));
    }
  }
  return { l, h, gris };
}

/** Agrandissement au plus proche voisin : les modules gardent des bords nets. */
function agrandir(image: ImageGrise, facteur: number): ImageGrise {
  const l = Math.round(image.l * facteur);
  const h = Math.round(image.h * facteur);
  const gris = new Uint8ClampedArray(l * h);
  for (let y = 0; y < h; y++) {
    const ligne = Math.min(image.h - 1, Math.floor(y / facteur)) * image.l;
    for (let x = 0; x < l; x++) gris[y * l + x] = image.gris[ligne + Math.min(image.l - 1, Math.floor(x / facteur))];
  }
  return { l, h, gris };
}

// ---------------------------------------------------------------------------------------------------------------
// Recherche du DataMatrix : fenêtres x agrandissements x binariseurs, arrêt au premier succès
// ---------------------------------------------------------------------------------------------------------------

function decoder(image: ImageGrise, global: boolean): string {
  const source = new RGBLuminanceSource(image.gris, image.l, image.h);
  const bitmap = new BinaryBitmap(global ? new GlobalHistogramBinarizer(source) : new HybridBinarizer(source));
  return new DataMatrixReader().decode(bitmap, INDICES).getText();
}

// Rend la main au navigateur (affichage du suivi). MessageChannel : contrairement à setTimeout, il n'est pas
// ralenti dans un onglet masqué.
const ceder = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      resolve();
      return;
    }
    const canal = new MessageChannel();
    canal.port1.onmessage = () => {
      canal.port1.close();
      resolve();
    };
    canal.port2.postMessage(null);
  });

/**
 * Promesse bornée dans le temps : sa valeur, ou null si elle n'est pas arrivée au bout de `ms` millisecondes.
 * Un échec arrivé après coup est ignoré.
 */
const avecDelai = <T>(promesse: Promise<T>, ms: number): Promise<T | null> =>
  new Promise((resolve, reject) => {
    // Au-delà de 2^31 - 1 ms, setTimeout se déclenche tout de suite.
    const minuterie = setTimeout(() => resolve(null), Math.min(ms, 0x7fffffff));
    promesse.then(
      (valeur) => {
        clearTimeout(minuterie);
        resolve(valeur);
      },
      (erreur) => {
        clearTimeout(minuterie);
        reject(erreur);
      },
    );
  });

/**
 * Texte du premier code 2D-DOC lu (il commence par « DC »), ou null. Fenêtres du prototype : chaque fenêtre est
 * essayée à tous les agrandissements. `siVu` (balayage) : une fenêtre n'est agrandie que si le détecteur y a VU un
 * code sans réussir à le lire (Checksum, Format) ; une fenêtre où rien n'est trouvé (NotFound) reste à x1.
 * `garde` : une fois le temps écoulé, la recherche s'arrête (null), sans essayer les fenêtres restantes.
 */
async function chercher(
  image: ImageGrise, fenetres: Fenetre[], agrandissements: number[], garde: Echeance, siVu = false,
): Promise<string | null> {
  let dernierePause = performance.now();
  for (const fenetre of fenetres) {
    if (garde.expire()) return null;
    const base = extraire(image, fenetre);
    if (!base.l || !base.h) continue;
    let vu = false;
    for (const facteur of agrandissements) {
      if (siVu && facteur > 1 && !vu) break;
      if (base.l * facteur * base.h * facteur > PIXELS_MAX) continue;
      if (facteur > 1 && garde.expire()) return null;
      const essai = facteur === 1 ? base : agrandir(base, facteur);
      for (const global of [false, true]) {
        try {
          const texte = decoder(essai, global);
          if (texte.startsWith('DC')) return texte;
        } catch (e) {
          // Pas de code lisible dans cette fenêtre : essai suivant. `instanceof`, pas le nom de la classe, que la
          // minification rend illisible.
          if (!(e instanceof NotFoundException)) vu = true;
        }
      }
    }
    if (performance.now() - dernierePause > 50) {
      await ceder();
      dernierePause = performance.now();
    }
  }
  return null;
}

const balayer = (image: ImageGrise, pxParPoint: number, garde: Echeance): Promise<string | null> =>
  chercher(image, fenetresBalayage(image, pxParPoint), pxParPoint < BALAYAGE_FIN_PX_PAR_POINT ? [1, 2] : [1], garde, true);

// ---------------------------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------------------------

function imageDeLaPage(page: PDFPageProxy, nom: string, delaiMs: number): Promise<ImagePdf | null> {
  const magasin = nom.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const delai = setTimeout(() => resolve(null), delaiMs);
    const rendre = (objet: ImagePdf | null) => {
      clearTimeout(delai);
      resolve(objet ?? null);
    };
    try {
      magasin.get(nom, rendre);
    } catch {
      rendre(null);
    }
  });
}

/** Voie préférée : les images incorporées de la page, avec les pixels exacts du code (aucun rééchantillonnage). */
async function lireImagesIncorporees(pdfjs: PdfJs, page: PDFPageProxy, garde: Echeance): Promise<LectureCode2d | null> {
  const operateurs = await avecDelai(page.getOperatorList(), garde.reste());
  if (!operateurs) return null;
  const vues = new Set<string>();
  for (let i = 0; i < operateurs.fnArray.length && vues.size < IMAGES_PDF_MAX; i++) {
    if (operateurs.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
    const nom: unknown = operateurs.argsArray[i]?.[0];
    if (typeof nom !== 'string' || vues.has(nom)) continue;
    if (garde.expire()) return null;
    vues.add(nom);
    const image = grisDeLImagePdf(pdfjs, await imageDeLaPage(page, nom, Math.min(DELAI_IMAGE_PDF_MS, garde.reste())));
    if (!image) continue;
    const texte = await chercher(image, fenetresImage(image), [1, 2], garde);
    const lecture = texte === null ? null : await interpreterCode2d(texte);
    if (lecture) return lecture;
  }
  return null;
}

/** Voie de secours : la page rendue sur un canvas, puis le coin haut-gauche et un balayage. */
async function lirePageRendue(page: PDFPageProxy, garde: Echeance): Promise<LectureCode2d | null> {
  if (garde.expire()) return null;
  const taille = page.getViewport({ scale: 1 });
  const echelle = Math.min(ECHELLE_RENDU, Math.sqrt(PIXELS_MAX / (taille.width * taille.height)));
  const viewport = page.getViewport({ scale: echelle });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  let image: ImageGrise | null = null;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const rendu = page.render({ canvasContext: ctx, canvas, viewport, intent: 'print' });
    if ((await avecDelai(rendu.promise.then(() => true), garde.reste())) === null) {
      rendu.cancel(); // rendu trop long : on l'arrête, la recherche s'arrête sans résultat
      return null;
    }
    image = grisDuCanvas(canvas);
  } finally {
    canvas.width = canvas.height = 0;
  }
  if (!image) return null;
  const coin: Fenetre = [0, 0, COIN_RNE_POINTS.l * echelle, COIN_RNE_POINTS.h * echelle];
  const texte = (await chercher(image, [coin], [1, 2], garde)) ?? (await balayer(image, echelle, garde));
  return texte === null ? null : interpreterCode2d(texte);
}

// ---------------------------------------------------------------------------------------------------------------
// Points d'entrée — null quand aucun code 2D-DOC n'est trouvé (ou pas dans le temps imparti) ; ne lèvent jamais
// d'exception. `dureeMaxMs` : durée totale accordée à la recherche (les recettes la raccourcissent).
// ---------------------------------------------------------------------------------------------------------------

// Trace sans contenu du document : le nom de l'erreur seulement.
const signaler = (e: unknown): void => console.warn('[patente] cachet électronique : lecture en échec', e instanceof Error ? e.name : '');

/**
 * Code 2D-DOC d'un PDF ouvert par l'appelant (qui le fermera) : les images incorporées de la page 1 d'abord, sinon
 * la page 1 rendue (coin haut-gauche, puis balayage).
 */
export async function lireCode2dPdf(pdfjs: PdfJs, pdf: PDFDocumentProxy, dureeMaxMs: number = DUREE_MAX_MS): Promise<LectureCode2d | null> {
  try {
    const garde = echeance(dureeMaxMs);
    const page = await avecDelai(pdf.getPage(1), garde.reste());
    if (!page) return null;
    const lecture = await lireImagesIncorporees(pdfjs, page, garde).catch(() => null);
    return lecture ?? (await lirePageRendue(page, garde));
  } catch (e) {
    signaler(e);
    return null;
  }
}

/**
 * Code 2D-DOC d'une image que l'appelant a déjà dessinée sur un canvas à fond blanc : les fenêtres du prototype
 * (x1, x2, x3), puis un balayage.
 */
export async function lireCode2dCanvas(canvas: HTMLCanvasElement, dureeMaxMs: number = DUREE_MAX_MS): Promise<LectureCode2d | null> {
  try {
    const garde = echeance(dureeMaxMs);
    const image = grisDuCanvas(canvas);
    if (!image) return null;
    const texte =
      (await chercher(image, fenetresImage(image), [1, 2, 3], garde)) ??
      (await balayer(image, Math.min(image.l, image.h) / LARGEUR_A4_POINTS, garde));
    return texte === null ? null : await interpreterCode2d(texte);
  } catch (e) {
    signaler(e);
    return null;
  }
}
