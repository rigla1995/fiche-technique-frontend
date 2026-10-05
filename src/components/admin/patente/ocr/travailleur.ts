// Couche « ocr » de la lecture de la patente (lot 3, étape 7) : cycle de vie du worker de reconnaissance.
// Sans DOM ni tesseract (testé par « node --test ») : lireOcr.ts fournit le worker, ce fichier garantit qu'il est
// TOUJOURS arrêté — lecture réussie, erreur, panne de chargement ou délai dépassé — et que la lecture se termine.

/** Ce que l'on sait arrêter : le worker rendu par tesseract.js, ou le Worker du navigateur lui-même. */
export interface Arretable {
  terminate(): unknown;
}

/** Durée maximale d'une lecture, chargement compris. Au-delà, elle échoue proprement (le bouton se dégrise). */
export const DELAI_LECTURE = 90_000;

/** La lecture a dépassé le délai (réseau figé pendant le chargement, moteur bloqué). */
export class DelaiDepasse extends Error {
  name = 'DelaiDepasse';
}

const arreter = async (cible: Arretable | null): Promise<void> => {
  try {
    await cible?.terminate();
  } catch {
    // déjà arrêté, ou jamais démarré : rien à faire
  }
};

/**
 * Exécute `creer` en notant le Worker du navigateur qu'il ouvre. tesseract.js ne rend son worker qu'une fois chargé :
 * si le chargement tombe en panne ou n'aboutit jamais, c'est le seul moyen de pouvoir l'arrêter. Le constructeur
 * `Worker` de `portee` n'est remplacé que le temps de l'appel, synchrone ; sans `Worker` (ou s'il ne se laisse pas
 * remplacer), `creer` est exécuté tel quel et `ouvert` vaut null.
 */
export function noterWorker<T>(portee: { Worker?: unknown }, creer: () => T): { rendu: T; ouvert: Arretable | null } {
  const Origine = portee.Worker as (new (...parametres: unknown[]) => Arretable) | undefined;
  let ouvert: Arretable | null = null;
  if (typeof Origine !== 'function') return { rendu: creer(), ouvert };
  // Appelé avec « new » : un constructeur qui rend un objet rend cet objet, c'est-à-dire le vrai Worker.
  const Espion = function Espion(...parametres: unknown[]): Arretable {
    ouvert = new Origine(...parametres);
    return ouvert;
  };
  Espion.prototype = Origine.prototype;
  let pose = false;
  try {
    portee.Worker = Espion;
    pose = true;
  } catch {
    // constructeur figé : on fait sans
  }
  try {
    const rendu = creer();
    return { rendu, ouvert };
  } finally {
    if (pose) portee.Worker = Origine;
  }
}

/**
 * Mène une lecture avec un worker. `ouvrir` rend la promesse du worker prêt (`pret`) et, s'il est connu, le Worker
 * déjà ouvert (`ouvert`). Le worker est arrêté dans tous les cas, y compris s'il arrive après l'échec ; passé `delai`
 * millisecondes, la lecture échoue avec `DelaiDepasse`.
 */
export async function avecTravailleur<T extends Arretable, R>(
  ouvrir: () => { pret: Promise<T>; ouvert: Arretable | null },
  lire: (travailleur: T) => Promise<R>,
  delai: number = DELAI_LECTURE,
): Promise<R> {
  let clos = false;
  let travailleur: T | null = null;
  let ouvert: Arretable | null = null;
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const garde = new Promise<never>((_, rejeter) => {
    minuterie = setTimeout(() => rejeter(new DelaiDepasse('La reconnaissance de caractères a pris trop de temps.')), delai);
  });
  try {
    const ouverture = ouvrir();
    ouvert = ouverture.ouvert;
    const lecture = ouverture.pret.then((t) => {
      if (clos) {
        void arreter(t); // arrivé trop tard : personne ne l'attend plus
        throw new DelaiDepasse('Worker prêt après la fin de la lecture.');
      }
      travailleur = t;
      return lire(t);
    });
    return await Promise.race([lecture, garde]);
  } finally {
    clos = true;
    clearTimeout(minuterie);
    await arreter(travailleur);
    await arreter(ouvert);
  }
}
