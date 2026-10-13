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
import { ETAPE_OCR, ajouterPages, completer, lireImageFacture, situer } from './chaineOcr';
import type { MoteurFacture } from './chaineOcr';
import { lireEntete } from './entete';
import { construireRangees, motsDePdf } from './rangees';
import type { BlocsTesseract, MorceauPdf } from './rangees';
import type { Destinataire, EnteteLu, MiseEnPage, PageLue, PreparationPage, SuiviLecture } from './types';

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

/** Étape F5 : ce que la personne a choisi pour chaque page d'image (« Recadrer », « Pivoter »), et la mise en page connue. */
export interface OptionsLecture {
  /** Par page : clé `cleDePage(fichier, page)`. */
  preparations?: Record<string, PreparationPage>;
  /** Mise en page apprise d'un fournisseur, d'après son matricule (GET /api/factures/mise-en-page). */
  modele?: (matricule: string) => Promise<MiseEnPage | null>;
}
/** Clé d'une page de la facture déposée : rang du fichier (à partir de 0), numéro de page dans ce fichier. */
export const cleDePage = (fichier: number, page: number) => `${fichier}:${page}`;
/** Pages d'images lues au plus (une facture plus longue : les 4 premières et la dernière, qui porte les totaux). */
const PAGES_IMAGES = 5;

export async function lireFacture(
  fichiers: FichierALire[], client: Destinataire, suivi: SuiviLecture = () => {}, signal?: AbortSignal, opts: OptionsLecture = {},
): Promise<EnteteLu & { duree: number }> {
  const verifier = () => { if (signal?.aborted) throw new LectureArretee('Lecture arrêtée.'); };
  const debut = performance.now();
  const lisibles = fichiers.filter((f) => f.type === 'application/pdf' || lisibleEnImage(f));
  const premier = lisibles[0];
  // Rang de chaque fichier lu dans la facture déposée (étape F3 : la ligne cliquée est encadrée sur sa page).
  const rangFichier = (f: FichierALire | null | undefined) => Math.max(0, f ? fichiers.indexOf(f) : 0);
  if (!premier) {
    throw new LectureImpossible(fichiers.some((f) => /hei[cf]/.test(f.type))
      ? "Photo HEIC sans copie lisible : la facture sera jointe, saisissez l'en-tête à la main."
      : "Aucun fichier lisible : la facture sera jointe, saisissez l'en-tête à la main.");
  }
  const fin = (e: EnteteLu) => ({ ...e, duree: Math.round((performance.now() - debut) / 100) / 10 });

  // PDF avec texte : aucune reconnaissance de caractères.
  if (premier.type === 'application/pdf') {
    suivi('Lecture du PDF…');
    const octets = new Uint8Array(await premier.fichier.arrayBuffer());
    const entete = await avecPdf<EnteteLu | null>(octets, async (pdf) => {
      const { pages, caracteres } = await textePdf(pdf);
      if (caracteres < CARACTERES_MIN) return null;
      const e = situer(lireEntete(pages, 'pdf', client), rangFichier(premier));
      // Texte présent mais muet (polices sans table de caractères) : la page se lit alors comme une image.
      return muet(e) ? null : e;
    });
    if (entete) return fin(entete);
  }

  // Étape F5 : TOUTES les pages d'images de la facture déposée (photos, pages d'un PDF numérisé), dans l'ordre — 5 au
  // plus. Les pages d'un PDF sont rendues tout de suite (le PDF se ferme après).
  suivi('Préparation de l\'image…');
  const pagesImages: { fichier: number; page: number; dessiner: () => Promise<HTMLCanvasElement> }[] = [];
  for (const f of lisibles) {
    verifier();
    if (f.type === 'application/pdf') {
      const octets = new Uint8Array(await f.fichier.arrayBuffer());
      await avecPdf(octets, async (pdf) => {
        const numeros = [...Array(Math.min(pdf.numPages, PAGES_IMAGES)).keys()].map((x) => x + 1);
        if (pdf.numPages > PAGES_IMAGES) numeros.splice(PAGES_IMAGES - 1, 1, pdf.numPages);
        for (const n of numeros) {
          const c = await rendrePage(pdf, n);
          pagesImages.push({ fichier: rangFichier(f), page: n, dessiner: async () => c });
        }
      });
    } else {
      pagesImages.push({ fichier: rangFichier(f), page: 1, dessiner: () => dessinerImage(lisibleEnImage(f) as Blob) });
    }
  }
  const aLire = pagesImages.length > PAGES_IMAGES ? [...pagesImages.slice(0, PAGES_IMAGES - 1), pagesImages[pagesImages.length - 1]] : pagesImages;

  // Image : reconnaissance de caractères (worker arrêté dans tous les cas, délai borné, et sur arrêt demandé).
  verifier();
  // Arrêt demandé : la lecture rend la main tout de suite (le worker arrêté laisse sa reconnaissance en suspens).
  const arretee = new Promise<never>((_, rejeter) => {
    if (!signal) return;
    const f = () => rejeter(new LectureArretee('Lecture arrêtée.'));
    if (signal.aborted) f(); else signal.addEventListener('abort', f, { once: true });
  });
  arretee.catch(() => {});
  const entete = await Promise.race([arretee, avecTravailleur(
    () => ouvrirTravailleur(suivi),
    async (travailleur) => {
      const stop = () => { void travailleur.terminate(); };
      signal?.addEventListener('abort', stop, { once: true });
      if (signal?.aborted) stop(); // arrêt demandé pendant le chargement du lecteur
      try {
        const m = moteur(travailleur);
        const n = aLire.length;
        let e: EnteteLu | null = null;
        const signatures: string[] = [];
        for (const [k, p] of aLire.entries()) {
          verifier();
          const suiviPage: SuiviLecture = (etape, a) => suivi(n > 1 ? `${etape.replace(/…$/, '')} (page ${k + 1} / ${n})…` : etape, (k + (a ?? 0)) / n);
          const options = {
            preparation: opts.preparations?.[cleDePage(p.fichier, p.page)],
            modele: opts.modele,
            // L'en-tête et les totaux se cherchent sur la première et la dernière page.
            entete: k === 0 || k === n - 1,
          };
          try {
            const d = situer(await lireImageFacture(sourceCanvas(await p.dessiner()), m, client, suiviPage, options), p.fichier, p.page);
            // La même page déposée deux fois (deux photos de la même feuille) : ses lignes répètent celles d'une page
            // précédente — signalé, jamais retiré en silence (la personne retire le fichier en double).
            const signature = (ls: EnteteLu['lignesFacture']) => ls.map((l) => `${l.designation.toLowerCase().replace(/\s+/g, ' ')}|${l.montant ?? ''}`).sort().join('§');
            const sig = signature(d.lignesFacture);
            const repetee: number = d.lignesFacture.length >= 2 ? signatures.indexOf(sig) : -1;
            signatures.push(sig);
            e = e ? ajouterPages(completer(e, d), d) : d;
            if (repetee >= 0) {
              e = { ...e, avertissements: [...e.avertissements, `Les lignes de la page ${k + 1} répètent celles de la page ${repetee + 1} : la même page a-t-elle été déposée deux fois ? Retirez le fichier en double.`] };
            }
          } catch (err) {
            // Une page qui ne se lit pas n'arrête la lecture que si c'est la première.
            verifier();
            if (!e) throw err;
            console.warn('[facture] page illisible', err instanceof Error ? err.name : '');
          }
        }
        if (!e) throw new LectureImpossible("Aucune page lisible : la facture sera jointe, saisissez l'en-tête à la main.");
        return e;
      } finally {
        signal?.removeEventListener('abort', stop);
      }
    },
    DELAI_LECTURE,
  )]);
  verifier();
  suivi(ETAPE_OCR, 1);
  return fin(entete);
}

/** Page affichée dans la fenêtre « Vérifier la facture » (étape F3) : image locale (à libérer), place dans la facture. */
export interface ApercuPage { fichier: number; page: number; url: string }

/**
 * Images des pages de la facture déposée, pour la fenêtre « Vérifier la facture » : chaque page d'un PDF (5 au plus par
 * fichier) rendue en image, chaque photo telle quelle (une photo HEIC : sa copie JPEG). Rien ne quitte le navigateur.
 * L'appelant libère les adresses (URL.revokeObjectURL) en fermant la fenêtre.
 */
export async function apercusDeFacture(fichiers: FichierALire[], signal?: AbortSignal): Promise<ApercuPage[]> {
  const res: ApercuPage[] = [];
  try {
    for (const [k, f] of fichiers.entries()) {
      if (signal?.aborted) break;
      if (f.type === 'application/pdf') {
        const octets = new Uint8Array(await f.fichier.arrayBuffer());
        await avecPdf(octets, async (pdf) => {
          // Les 5 premières pages, et la dernière (celle que la lecture relit pour les totaux d'une facture longue).
          const numeros = [...Array(Math.min(pdf.numPages, PAGES_TEXTE)).keys()].map((x) => x + 1);
          if (pdf.numPages > PAGES_TEXTE) numeros.push(pdf.numPages);
          for (const n of numeros) {
            if (signal?.aborted) break;
            const canvas = await rendrePage(pdf, n);
            const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
            if (blob) res.push({ fichier: k, page: n, url: URL.createObjectURL(blob) });
          }
        });
      } else {
        const image = lisibleEnImage(f);
        if (image) res.push({ fichier: k, page: 1, url: URL.createObjectURL(image) });
      }
    }
  } catch (e) {
    res.forEach((a) => URL.revokeObjectURL(a.url));
    throw e;
  }
  if (signal?.aborted) {
    res.forEach((a) => URL.revokeObjectURL(a.url));
    return [];
  }
  return res;
}
