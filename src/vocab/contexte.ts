// Contexte React du vocabulaire du compte (lot 2, spec §2.3).
// La valeur est posée par AuthProvider (src/context/AuthContext.tsx) ; hors provider,
// la valeur par défaut du contexte est le vocabulaire par défaut (restauration).
// Lecture : `const voc = useVocabulaire()` (src/hooks/useVocabulaire.ts).
import { createContext } from 'react';
import { vocabDefaut } from './vocab';
import type { Vocab } from './vocab';

export const VocabContext = createContext<Vocab>(vocabDefaut);
