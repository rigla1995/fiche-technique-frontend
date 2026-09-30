import { useContext } from 'react';
import { VocabContext } from '../vocab/contexte';
import type { Vocab } from '../vocab/vocab';

/**
 * Vocabulaire du compte connecté (lot 2) : `const voc = useVocabulaire()`.
 *
 * - Construit par AuthProvider à partir de `user.domaine.lexique` ; l'objet ne change que si
 *   le lexique change (même référence d'un rafraîchissement de /auth/me à l'autre).
 * - Admin, boss, non connecté, ou hors AuthProvider : vocabulaire par défaut (restauration).
 * - Règles d'écriture (vérifiées par scripts/vocab-check.mjs) : l'appel `voc.…('clé')` est écrit
 *   là où le texte est assemblé, sans variable intermédiaire ; chaque sous-composant qui affiche
 *   un terme appelle lui-même ce hook ; jamais `voc` dans les dépendances d'un effet de
 *   chargement de données.
 */
export function useVocabulaire(): Vocab {
  return useContext(VocabContext);
}
