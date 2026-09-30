import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import { vocabDefaut } from '../vocab/vocab';
import type { Vocab } from '../vocab/vocab';
import { rendreTout } from '../vocab/rendre';

// fr.json porte des balises de vocabulaire ([[méthode:clé]], lot 2) : le paquet de
// ressources chargé est toujours fr.json RENDU avec le vocabulaire courant — par défaut
// celui de la restauration, identique au texte d'origine. Les composants gardent t() tel quel.
i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: rendreTout(fr, vocabDefaut) },
    },
    lng: 'fr',
    fallbackLng: 'fr',
    supportedLngs: ['fr'],
    interpolation: { escapeValue: false },
    // Les composants qui utilisent t() se re-rendent quand le paquet est remplacé.
    react: { bindI18nStore: 'added' },
  });

let vocabI18n: Vocab = vocabDefaut;

/**
 * Re-rend le paquet de ressources avec le vocabulaire du compte. Appelé par AuthProvider
 * à chaque changement de vocabulaire (connexion, déconnexion, changement de domaine) ;
 * sans effet si le vocabulaire est déjà celui du paquet.
 */
export function appliquerVocabulaireI18n(voc: Vocab): void {
  if (voc === vocabI18n) return;
  vocabI18n = voc;
  i18n.addResourceBundle('fr', 'translation', rendreTout(fr, voc), true, true);
}

export default i18n;
