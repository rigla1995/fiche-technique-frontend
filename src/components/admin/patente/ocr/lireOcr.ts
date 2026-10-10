// Couche « ocr » de la lecture de la patente (lot 3, étape 7) : point d'entrée, dans le navigateur.
// Reconnaissance de caractères par tesseract.js (modèle « fra » seul : « ara » coûte 1,6 Mo et 2,5 à 3 fois le temps,
// sans rien apporter — l'arabe n'est pas imprimable sur les factures). Tout est servi par l'application sous /ocr/ :
// rien n'est demandé ni envoyé à un tiers. Ce fichier ne porte que le canvas et le worker ; la chaîne de lecture est
// dans chaine.ts, les fonctions pures dans pixels.ts, extraction.ts et matricule.ts, le cycle de vie du worker (arrêt
// garanti, délai de 90 s) dans travailleur.ts.
import { createWorker } from 'tesseract.js';
import type { PSM, Worker as TravailleurOcr } from 'tesseract.js';
import type { ResultatCouche, SuiviLecture } from '../types.ts';
import { ETAPE, lireDocument } from './chaine.ts';
import type { Moteur, Source } from './chaine.ts';
import { motsDePage } from './extraction.ts';
import { versRgba } from './pixels.ts';
import type { Pixels } from './pixels.ts';
import { avecTravailleur, noterWorker } from './travailleur.ts';
import type { Arretable } from './travailleur.ts';

// Fichiers copiés depuis node_modules par vite.config.ts (versions figées par package-lock.json).
// `cacheMethod: 'none'` : par défaut, tesseract.js garde le modèle de langue dans IndexedDB sous une clé fixe, sans
// jamais le revalider. Ici rien n'est conservé par l'application : le modèle est tenu par le cache HTTP du navigateur,
// que le serveur revalide à chaque usage.
export const FICHIERS = {
  workerPath: '/ocr/worker.min.js', corePath: '/ocr/core/', langPath: '/ocr/lang/', gzip: true, workerBlobURL: false, cacheMethod: 'none',
};

function toile(largeur: number, hauteur: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(largeur));
  canvas.height = Math.max(1, Math.round(hauteur));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("Ce navigateur ne permet pas de lire l'image.");
  ctx.fillStyle = '#fff'; // la transparence et la couleur sont toujours aplaties sur fond blanc
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

export function sourceCanvas(image: HTMLCanvasElement): Source {
  return {
    largeur: image.width,
    hauteur: image.height,
    extraire(zone, largeur, hauteur) {
      const { canvas, ctx } = toile(largeur, hauteur);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, zone.left, zone.top, zone.width, zone.height, 0, 0, canvas.width, canvas.height);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    },
    tourner(radians) {
      const sinus = Math.abs(Math.sin(radians)), cosinus = Math.abs(Math.cos(radians));
      const { canvas, ctx } = toile(image.width * cosinus + image.height * sinus, image.width * sinus + image.height * cosinus);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(radians);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      return sourceCanvas(canvas);
    },
  };
}

// tesseract.js refuse un ImageData, et pour un canvas il appelle toBlob, bridé à ~1 s dans un onglet masqué : on lui
// passe une adresse « data: » en PNG, produite de façon synchrone.
export function enPng(image: Pixels): string {
  const { canvas, ctx } = toile(image.width, image.height);
  ctx.putImageData(new ImageData(versRgba(image), image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function moteurTesseract(travailleur: TravailleurOcr): Moteur {
  const pleinePage = () => travailleur.setParameters({
    tessedit_pageseg_mode: '3' as PSM, tessedit_char_whitelist: '', preserve_interword_spaces: '1', user_defined_dpi: '300',
  });
  return {
    async angle(image) {
      await pleinePage();
      const { data } = await travailleur.recognize(enPng(image), { rotateAuto: true }, { text: false });
      return data.rotateRadians || 0;
    },
    async page(image) {
      await pleinePage();
      const { data } = await travailleur.recognize(enPng(image), {}, { text: true, blocks: true });
      return motsDePage(data);
    },
    async jeton(image, mode, alphabet) {
      await travailleur.setParameters({
        tessedit_pageseg_mode: (mode === 'ligne' ? '7' : '10') as PSM, tessedit_char_whitelist: alphabet, user_defined_dpi: '300',
      });
      const { data } = await travailleur.recognize(enPng(image));
      return data.text;
    },
  };
}

// Le premier usage télécharge le cœur et le modèle (~2 Mo), les suivants les reprennent du cache HTTP : leur
// avancement occupe le premier dixième du suivi.
// Pannes de chargement, telles que tesseract.js les signale :
//   cœur introuvable            sa promesse échoue ;
//   modèle introuvable, initialisation refusée   `errorHandler` seulement — sa promesse ne se termine jamais ;
//   cœur qui ne démarre pas, réseau figé         rien du tout : seul le délai de la lecture y met fin.
// Dans les trois cas tesseract.js ne rend pas son worker : on note donc le Worker qu'il ouvre (`noterWorker`), pour
// pouvoir l'arrêter quand même.
export function ouvrirTravailleur(suivi: SuiviLecture): { pret: Promise<TravailleurOcr>; ouvert: Arretable | null } {
  const enErreur = (raison: unknown): Error => (raison instanceof Error ? raison : new Error(String(raison)));
  let signaler: (raison: unknown) => void = () => {};
  const panne = new Promise<never>((_, rejeter) => { signaler = (raison) => rejeter(enErreur(raison)); });
  const { rendu, ouvert } = noterWorker(globalThis, () => createWorker('fra', 1, {
    ...FICHIERS,
    logger: (m) => { if (m.status === 'loading language traineddata') suivi(ETAPE, 0.1 * m.progress); },
    errorHandler: signaler,
  }));
  return { pret: Promise.race([rendu.catch((raison) => { throw enErreur(raison); }), panne]), ouvert };
}

/**
 * Lit par reconnaissance de caractères un document dessiné sur fond blanc (image déposée, ou page 1 d'un PDF sans
 * texte) : carte d'identification fiscale ou carte auto-entrepreneur. Tous les champs rendus sont « à relire ».
 * Un document illisible ne lève pas d'exception : `document: 'inconnu'`, les lignes lues et un avertissement.
 * Une panne de chargement ou une lecture de plus de 90 s lève une exception ; le worker est arrêté dans tous les cas.
 * `suivi` reçoit un avancement de 0 à 1.
 */
export async function lireOcr(canvas: HTMLCanvasElement, suivi: SuiviLecture = () => {}): Promise<ResultatCouche> {
  let finie = false;
  const suiviVivant: SuiviLecture = (etape, avancement) => { if (!finie) suivi(etape, avancement); };
  suiviVivant(ETAPE, 0);
  try {
    return await avecTravailleur(
      () => ouvrirTravailleur(suiviVivant),
      (travailleur) => lireDocument(sourceCanvas(canvas), moteurTesseract(travailleur), suiviVivant),
    );
  } finally {
    finie = true; // une lecture abandonnée (délai dépassé) ne fait plus bouger le suivi
  }
}
