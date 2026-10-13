// Extrait RNE en IMAGE (scan, photo, PDF numérisé) : les mots de la reconnaissance de caractères deviennent des
// morceaux de texte positionnés, lus par le même analyseur que le PDF d'origine (analyseur.ts : libellés français et
// leur valeur par la position). Fonctions PURES (testées par scripts/patente-rne.test.mjs).
//   pageDepuisOcr   mots reconnus (pixels, origine en haut) → page de morceaux (points, origine en bas, page A4) ;
//                   une rangée garde un seul y (les mots d'une même ligne ne se séparent pas) ;
//   lectureRneOcr   lecture d'une ou plusieurs passes de reconnaissance, fusionnées : une même valeur lue avec et sans
//                   espace (« ALIARIAHI » / « ALIA RIAHI ») garde la version la plus espacée ; deux valeurs différentes :
//                   la dernière passe, l'autre lecture citée en note.
import type { ChampIdentite, ChampLu, ResultatCouche } from '../types.ts';
import { construireRangees } from '../ocr/extraction.ts';
import type { MotOcr } from '../ocr/extraction.ts';
import { lectureExtraitRne } from './analyseur.ts';
import type { Morceau, PageTexte } from './analyseur.ts';

const LARGEUR_A4 = 595.28; // en points
// Mots de la reconnaissance retenus : une lettre ou un chiffre, et une confiance minimale (l'arabe lu par le modèle
// « fra » donne surtout du bruit peu sûr).
const CONFIANCE_MIN = 30;

/** Mots reconnus sur une page de `largeur` × `hauteur` pixels → page de morceaux positionnés, en points. */
export function pageDepuisOcr(mots: readonly MotOcr[], largeur: number, hauteur: number): PageTexte {
  const k = LARGEUR_A4 / Math.max(1, largeur);
  const utiles = mots.filter((m) => m.c >= CONFIANCE_MIN && /[\p{L}\d]/u.test(m.t));
  const { rangees } = construireRangees(utiles);
  const morceaux: Morceau[] = rangees.flatMap((r) => {
    const y = (hauteur - r.y1) * k;
    return r.mots.map((m) => ({ str: m.t, x: m.b.x0 * k, y, largeur: (m.b.x1 - m.b.x0) * k }));
  });
  return { largeur: LARGEUR_A4, hauteur: hauteur * k, morceaux, cases: null, texteDouteux: true };
}

const sansEspaces = (s: string): string => s.replace(/\s+/g, '').toUpperCase();
const nbEspaces = (s: string): number => (s.match(/\s+/g) ?? []).length;

/** Fusion des lectures de plusieurs passes (de la moins sûre à la plus sûre). null si aucune n'a reconnu l'extrait. */
export function fusionnerPassesRne(passes: readonly (ResultatCouche | null)[]): ResultatCouche | null {
  const lues = passes.filter((p): p is ResultatCouche => p !== null);
  if (!lues.length) return null;
  const champs: Partial<Record<ChampIdentite, ChampLu>> = {};
  for (const passe of lues) {
    for (const [cle, lu] of Object.entries(passe.champs) as [ChampIdentite, ChampLu][]) {
      const garde = champs[cle];
      if (!garde) { champs[cle] = lu; continue; }
      if (sansEspaces(garde.valeur) === sansEspaces(lu.valeur)) {
        if (nbEspaces(lu.valeur) > nbEspaces(garde.valeur)) champs[cle] = { ...garde, valeur: lu.valeur };
      } else {
        const note = [lu.note, `autre lecture : « ${garde.valeur} »`].filter(Boolean).join(' ; ');
        champs[cle] = { ...lu, aRelire: true, note };
      }
    }
  }
  const plusRiche = [...lues].sort((a, b) => Object.keys(b.champs).length - Object.keys(a.champs).length)[0];
  return {
    document: 'extrait_rne',
    champs,
    lignes: plusRiche.lignes,
    avertissements: [...new Set(lues.flatMap((p) => p.avertissements))],
  };
}

/** Extrait RNE lu en image : une passe par jeu de mots reconnus (page entière), fusionnées. null : pas un extrait. */
export function lectureRneOcr(passes: readonly { mots: readonly MotOcr[]; largeur: number; hauteur: number }[]): ResultatCouche | null {
  return fusionnerPassesRne(passes.map((p) => {
    const lu = lectureExtraitRne([pageDepuisOcr(p.mots, p.largeur, p.hauteur)], { source: 'ocr' });
    return lu ? { document: lu.document, champs: lu.champs, lignes: lu.lignes, avertissements: lu.avertissements } : null;
  }));
}
